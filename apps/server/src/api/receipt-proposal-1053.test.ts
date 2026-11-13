import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createApp } from '../app';
import { sha256Hex } from '../auth/crypto';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { syntheticColumnarPayslipPdf } from '../payslips/testing';
import { createBooking } from '@budget/db';

const origin = 'http://localhost:3000',
  token = 'synthetic-statement-session';
const headers = { origin, cookie: `budget_session=${token}` };
let opened: OpenedDatabase, dir: string, app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  for (const [date, amountCents] of [
    ['2026-10-06', -1240],
    ['2026-10-20', -1240],
    ['2026-10-07', -1250],
    ['2026-10-07', 1240],
  ] as const)
    createBooking(
      opened.db,
      { accountId: 'giro', date, amountCents, status: 'confirmed', splits: [{ amountCents }] },
      { actor: 'test', groupId: `g-${date}-${amountCents}` },
    );
  dir = mkdtempSync(join(tmpdir(), 'budget-receipt-1053-'));
  const now = new Date('2026-10-20T12:00:00Z'),
    store = new AuthStore(opened.db);
  store.createSession({
    id: sha256Hex(token),
    passkeyId: null,
    now,
    expiresAt: new Date('2026-11-20T12:00:00Z'),
    stepUp: false,
    viaRecovery: true,
  });
  const auth = createAuth({
    store,
    clock: () => now,
    config: {
      rpID: 'localhost',
      rpName: 'Budget',
      origin,
      cookieSecure: false,
      setupToken: undefined,
      trustProxy: false,
      sessionDays: 30,
      sessionMaxDays: 90,
      stepUpMinutes: 5,
      pepper: Buffer.from('synthetic-pepper-0123456789abcdef'),
    },
  });
  app = createApp({
    webDir: join(dir, 'web'),
    auth,
    ledger: { db: opened.db, receiptsDir: join(dir, 'receipts'), today: () => '2026-10-20' },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});
const lines = (...texts: string[]) => texts.map((text) => [{ x: 40, text }]);
const tables = () =>
  JSON.stringify(
    [schema.receipt, schema.booking].map((table) => opened.db.all(sql`SELECT * FROM ${table}`)),
  );
async function classify(bytes: Buffer) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], 'synthetic.pdf', { type: 'application/pdf' }));
  return app.request('/api/document-intake/classify', { method: 'POST', headers, body: form });
}
const matches = (query: string) =>
  app.request('/api/document-intake/receipt-matches?' + query, { headers });

it('proposes total, date and payee for a receipt PDF without storing or booking anything', async () => {
  const bytes = await syntheticColumnarPayslipPdf(
    lines('Muster Markt GmbH', 'Datum: 07.10.2026', 'Gesamt 12,40 EUR'),
    '',
  );
  const before = tables();
  const body = (await (await classify(bytes)).json()) as { type: string; receipt?: unknown };
  expect(body.type).toBe('receipt');
  expect(body.receipt).toEqual({
    totalCents: 1240,
    date: '2026-10-07',
    payee: 'Muster Markt GmbH',
  });
  expect(tables()).toBe(before);
});

it('leaves unprinted fields empty instead of guessing', async () => {
  const bytes = await syntheticColumnarPayslipPdf(lines('Synthetic till slip'), '');
  const body = (await (await classify(bytes)).json()) as { receipt?: unknown };
  expect(body.receipt).toEqual({ totalCents: null, date: null, payee: 'Synthetic till slip' });
});

it('lists only outgoing bookings with the same amount within five days', async () => {
  const res = await matches('totalCents=1240&date=2026-10-07&payee=Muster%20Markt');
  expect(res.status).toBe(200);
  const { matches: found } = (await res.json()) as {
    matches: { date: string; amountCents: number }[];
  };
  expect(found.map((row) => [row.date, row.amountCents])).toEqual([['2026-10-06', -1240]]);
});

it('validates the query', async () => {
  expect((await matches('totalCents=0&date=2026-10-07')).status).toBe(400);
  expect((await matches('totalCents=1240&date=07.10.2026')).status).toBe(400);
  expect((await matches('totalCents=1240&date=2026-10-07&x=1')).status).toBe(400);
  const anonymous = await app.request(
    '/api/document-intake/receipt-matches?totalCents=1&date=2026-10-07',
    {
      headers: { origin },
    },
  );
  expect(anonymous.status).toBe(401);
});
