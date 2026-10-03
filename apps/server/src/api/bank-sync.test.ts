import { createHash, randomUUID } from 'node:crypto';
import { createTestDatabase, createBooking, schema, type OpenedDatabase } from '@budget/db';
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
  it('protects candidate decisions by session/origin, validates bodies and returns audited undo groups', async () => {
    const id = randomUUID();
    const bookingId = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-30',
        amountCents: -129,
        memo: 'Handnotiz',
        splits: [{ amountCents: -129, categoryId: 'essen' }],
      },
      { actor: 'owner' },
    );
    opened.db
      .insert(schema.bankSyncCandidate)
      .values({
        id,
        accountId: 'giro',
        date: '2026-10-01',
        amountCents: -129,
        currency: 'EUR',
        memo: 'Banktext',
        dedupeKey: 'entry-a',
      })
      .run();
    opened.db
      .insert(schema.inboxItem)
      .values({ id, title: 'Bankumsatz prüfen', kind: 'import' })
      .run();
    authenticated = false;
    expect((await call('/candidates/' + id + '/matches')).status).toBe(401);
    expect((await call('/candidates/' + id + '/merge', { bookingId })).status).toBe(401);
    authenticated = true;
    fresh = false; // Ledger decisions use the existing session, no provider or consent mutation.
    expect(
      (await call('/candidates/' + id + '/merge', { bookingId }, 'https://other.example')).status,
    ).toBe(403);
    expect((await call('/candidates/' + id + '/merge', { bookingId, extra: true })).status).toBe(
      400,
    );
    const matches = (await (await call('/candidates/' + id + '/matches')).json()) as {
      merge: { id: string }[];
    };
    expect(matches.merge[0]!.id).toBe(bookingId);
    expect((await call('/candidates/' + id + '/transfer', { bookingId })).status).toBe(409);
    const response = await call('/candidates/' + id + '/merge', { bookingId });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toEqual({ bookingId, groupId: expect.any(String) });
    expect((await call('/candidates/' + id + '/merge', { bookingId })).status).toBe(409);
    expect(provider.transactions).not.toHaveBeenCalled();
    expect(provider.balance).not.toHaveBeenCalled();
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
