import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import {
  accounts,
  createBooking,
  createTestDatabase,
  reconcileAccount,
  type OpenedDatabase,
} from '@budget/db';
import { createApp, type AuthGate } from '../app';

const auth: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: OpenedDatabase, app: ReturnType<typeof createApp>, webDir: string;
beforeEach(() => {
  opened = createTestDatabase();
  webDir = mkdtempSync(join(tmpdir(), 'synthetic-recon-1203-'));
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Synthetic</title>');
  app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => '2026-10-19' } });
});
afterEach(() => {
  opened.close();
  rmSync(webDir, { recursive: true, force: true });
});

it('#1203 explains a later difference with the bookings changed after the check', async () => {
  const ctx = { actor: 'synthetic' };
  accounts.create(
    opened.db,
    {
      id: 'a',
      name: 'Synthetisches Konto',
      type: 'checking',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 10000,
      role: 'budget',
    },
    ctx,
  );
  const empty = await app.request('/api/accounts/a/reconciliation-changes');
  expect(await empty.json()).toEqual({ changes: null });
  reconcileAccount(
    opened.db,
    { accountId: 'a', date: '2026-09-01', statementBalanceCents: 10000, today: '2026-10-19' },
    ctx,
  );
  await new Promise((r) => setTimeout(r, 15));
  createBooking(
    opened.db,
    {
      accountId: 'a',
      date: '2026-08-30',
      status: 'confirmed',
      amountCents: -777,
      splits: [{ amountCents: -777, categoryId: null }],
    },
    ctx,
  );
  const res = await app.request('/api/accounts/a/reconciliation-changes');
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    changes: {
      statementBalanceCents: 10000,
      currentBalanceCents: 9223,
      unexplainedCents: 0,
      changes: [{ change: 'created', amountAfterCents: -777, effectCents: -777 }],
    },
  });
  expect((await app.request('/api/accounts/missing/reconciliation-changes')).status).toBe(404);
});
