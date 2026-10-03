import { createHash, randomUUID } from 'node:crypto';
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AuthGate } from '../app';
import { BankSync } from '../bank-sync/service';
import { bankSecretBox } from '../bank-sync/secrets';
import type { BankProvider } from '../bank-sync/provider';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';

let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let fresh: boolean;
let authenticated: boolean;
let provider: BankProvider;
const state = 'synthetic-state-for-callback-0000000000000';
const connectionId = randomUUID();
const auth: AuthGate = {
  routes: new Hono(),
  originGuard: async (c, next) =>
    c.req.method === 'GET' || c.req.header('origin') === 'https://budget.example'
      ? next()
      : c.json({ error: 'origin_rejected' }, 403),
  requireSession: async (c, next) => {
    if (!authenticated) return c.json({ error: 'unauthorized' }, 401);
    c.set('session', {
      id: 'synthetic-session',
      createdAt: '2026-10-01T00:00:00Z',
      revokedAt: null,
      passkeyId: null,
      lastSeenAt: '2026-10-01T00:00:00Z',
      expiresAt: '2026-11-01T00:00:00Z',
      stepUpAt: null,
      viaRecovery: false,
    });
    return next();
  },
  requireStepUp: async (c, next) => (fresh ? next() : c.json({ error: 'step_up_required' }, 403)),
};
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  fresh = true;
  authenticated = true;
  provider = {
    institutions: vi.fn(async () => [
      { name: 'Bank A', country: 'AT', maximumConsentSeconds: 15552000 },
    ]),
    authorize: vi.fn(async () => 'https://auth.enablebanking.com/ais/start'),
    session: vi.fn(async () => ({
      id: 'provider-session',
      validUntil: '2026-12-01T00:00:00Z',
      accounts: [{ uid: 'provider-account', label: 'Konto A', currency: 'EUR' }],
    })),
    transactions: vi.fn(async () => ({ rows: [], skippedInvalid: 0, skippedOutOfWindow: 0 })),
    balance: vi.fn(async () => ({ amountCents: 0, currency: 'EUR', date: '2026-10-01' })),
  };
  const sync = new BankSync(
    opened.db,
    provider,
    bankSecretBox('ef'.repeat(32)),
    'https://budget.example',
    () => new Date('2026-10-01T00:00:00Z'),
  );
  app = createApp({
    webDir: 'test-results/no-web',
    auth,
    ledger: { db: opened.db, bankSync: sync },
  });
  opened.db
    .insert(schema.bankSyncConsent)
    .values({
      id: connectionId,
      initiator: 'synthetic-session',
      stateHash: createHash('sha256').update(state).digest('hex'),
      label: 'Bank A',
      expiresAt: '2026-10-01T00:30:00Z',
      nextRunAt: '2026-10-01T00:00:00Z',
    })
    .run();
});
afterEach(() => opened.close());
const call = (
  path: string,
  body?: unknown,
  origin = 'https://budget.example',
  method = body === undefined ? 'GET' : 'POST',
) =>
  app.request('/api/bank-sync' + path, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
describe('bank API security boundary', () => {
  it('uses decision 41 by default, audits per-source changes, and requires step-up and origin', async () => {
    const policy = '/' + connectionId + '/policy';
    expect(await (await call('')).json()).toMatchObject({
      connections: [{ bookedToLedger: true }],
    });
    fresh = false;
    expect(
      (await call(policy, { bookedToLedger: false }, 'https://budget.example', 'PUT')).status,
    ).toBe(403);
    fresh = true;
    expect(
      (await call(policy, { bookedToLedger: false }, 'https://other.example', 'PUT')).status,
    ).toBe(403);
    expect(
      (await call(policy, { bookedToLedger: 'false' }, 'https://budget.example', 'PUT')).status,
    ).toBe(400);
    expect(
      (await call(policy, { bookedToLedger: false }, 'https://budget.example', 'PUT')).status,
    ).toBe(200);
    expect(await (await call('')).json()).toMatchObject({
      connections: [{ bookedToLedger: false }],
    });
    expect(
      opened.db
        .select()
        .from(schema.auditLog)
        .all()
        .some((a) => a.entityType === 'app_setting'),
    ).toBe(true);
  });
  it('requires session, origin and fresh step-up before any consent HTTP request', async () => {
    authenticated = false;
    expect((await call('')).status).toBe(401);
    authenticated = true;
    expect(
      (await call('/auth', { name: 'Bank A', country: 'AT' }, 'https://other.example')).status,
    ).toBe(403);
    fresh = false;
    expect((await call('/institutions')).status).toBe(403);
    expect((await call('/auth', { name: 'Bank A', country: 'AT' })).status).toBe(403);
    expect((await call('/callback', { state, code: 'code' })).status).toBe(403);
    expect(
      (
        await call(
          '/accounts/' + randomUUID(),
          { accountId: 'giro', fromDate: '2026-09-01' },
          'https://budget.example',
          'PUT',
        )
      ).status,
    ).toBe(403);
    expect(provider.authorize).not.toHaveBeenCalled();
    expect(provider.session).not.toHaveBeenCalled();
  });
  it('validates callback payload, consumes state once, never returns provider credentials', async () => {
    expect((await call('/callback', { state, code: 'code', extra: true })).status).toBe(400);
    const response = await call('/callback', { state, code: 'code' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ id: connectionId });
    expect((await call('/callback', { state, code: 'code' })).status).toBe(409);
    const status = await (await call('')).text();
    expect(status).not.toMatch(
      /provider-session|provider-account|synthetic-session|stateHash|secret/,
    );
  });
  it('rejects expired callback state without calling the provider', async () => {
    opened.db.update(schema.bankSyncConsent).set({ expiresAt: '2026-09-30T23:59:59Z' }).run();
    expect((await call('/callback', { state, code: 'code' })).status).toBe(409);
    expect(provider.session).not.toHaveBeenCalled();
  });
});
