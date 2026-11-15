import {
  accounts,
  createSecurity,
  createTestDatabase,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import type { TradeConfirmationIntake } from '@budget/domain';
import { sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { createApp } from '../app';
import { sha256Hex } from '../auth/crypto';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { syntheticColumnarPayslipPdf } from '../payslips/testing';

// Synthetic documents only: invented issuer, instrument, ids, ISIN (valid check digit), depot
// and settlement account numbers and amounts, modelled on the layout.
const origin = 'http://localhost:3000',
  token = 'synthetic-trade-confirmation-session';
const headers = { origin, cookie: `budget_session=${token}` };
const ISIN = 'IE00SYNTH008';
const DEPOT = 'synthetic-depot',
  SECURITY = 'synthetic-fund';
let opened: OpenedDatabase, dir: string, app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  accounts.create(
    opened.db,
    {
      id: DEPOT,
      name: 'Synthetic depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-09-01',
    },
    testCtx,
  );
  createSecurity(
    opened.db,
    { id: SECURITY, name: 'Synthetic Index Fund', kind: 'etf', isin: ISIN },
    testCtx,
  );
  dir = mkdtempSync(join(tmpdir(), 'budget-trade-confirmation-1099-'));
  const now = new Date('2026-11-12T12:00:00Z'),
    store = new AuthStore(opened.db);
  store.createSession({
    id: sha256Hex(token),
    passkeyId: null,
    now,
    expiresAt: new Date('2026-12-12T12:00:00Z'),
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
    ledger: { db: opened.db, receiptsDir: join(dir, 'receipts'), today: () => '2026-11-12' },
  });
});
afterEach(() => {
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});

const confirmation = (
  o: { row?: string; isin?: string; execution?: string; issuer?: string } = {},
) =>
  syntheticColumnarPayslipPdf(
    [
      o.issuer ?? 'Beispiel Broker AG Musterweg 1 00000 Beispielstadt',
      'DATUM 09.11.2026',
      `AUSFÜHRUNG ${o.execution ?? '1a2b-3c4d'}`,
      'SPARPLAN 9f8e-7d6c',
      'DEPOT 0123456789',
      'WERTPAPIERABRECHNUNG SPARPLAN',
      'ÜBERSICHT',
      'Sparplanausführung am 09.11.2026 an der Beispiel Exchange.',
      'POSITION ANZAHL DURCHSCHNITTSKURS BETRAG',
      o.row ?? 'Synthetic Index Fund (Acc) 0,339443 Stk. 294,60 EUR 100,00 EUR',
      `ISIN: ${o.isin ?? ISIN}`,
      'GESAMT 100,00 EUR',
      'BUCHUNG',
      'VERRECHNUNGSKONTO WERTSTELLUNG BETRAG',
      'DE00000000000000001234 2026-11-11 -100,00 EUR',
      'Diese Abrechnung wird maschinell erstellt und daher nicht unterschrieben.',
    ].map((text) => [{ x: 40, text }]),
    '',
  );
const tables = () =>
  JSON.stringify(
    [schema.trade, schema.booking, schema.receipt, schema.auditLog].map((table) =>
      opened.db.all(sql`SELECT * FROM ${table}`),
    ),
  );
async function classify(bytes: Buffer) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], 'synthetic.pdf', { type: 'application/pdf' }));
  const response = await app.request('/api/document-intake/classify', {
    method: 'POST',
    headers,
    body: form,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { type: string; confidence: string } & {
    trade?: TradeConfirmationIntake;
  };
}
const book = (body: Record<string, unknown>) =>
  app.request('/api/trades', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      securityId: SECURITY,
      accountId: DEPOT,
      date: '2026-11-09',
      kind: 'buy',
      unitsE8: 33_944_300,
      amountCents: 10_000,
      feeCents: 0,
      taxCents: 0,
      note: null,
      ...body,
    }),
  });

it('turns a savings plan confirmation into a trade proposal without writing anything', async () => {
  const before = tables();
  const body = await classify(await confirmation());
  expect(body.type).toBe('trade_confirmation');
  expect(body.confidence).toBe('certain');
  expect(body.trade).toEqual({
    proposal: {
      reference: 'wpa:1a2b-3c4d',
      source: 'savings_plan',
      kind: 'buy',
      instrument: { name: 'Synthetic Index Fund (Acc)', isin: ISIN },
      date: '2026-11-09',
      unitsE8: 33_944_300,
      amountCents: 10_000,
      feeCents: 0,
      taxCents: 0,
      currency: 'EUR',
      settlementHint: '1234',
      open: [],
      unchecked: false,
    },
    securityId: SECURITY,
    importKey: 'wpa:1a2b-3c4d',
    duplicate: null,
  });
  expect(tables()).toBe(before);
});

it('names contradictory fields as open and matches no instrument for an unknown ISIN', async () => {
  const body = await classify(
    await confirmation({
      row: 'Synthetic Index Fund (Acc) 0,539443 Stk. 294,60 EUR 100,00 EUR',
      isin: 'DE000SYNTH19',
    }),
  );
  expect(body.type).toBe('trade_confirmation');
  expect(body.trade?.securityId).toBeNull();
  expect(body.trade?.proposal).toMatchObject({
    unitsE8: null,
    amountCents: null,
    date: '2026-11-09',
  });
  expect(body.trade?.proposal.open).toEqual(expect.arrayContaining(['units', 'amount']));
});

it('detects a second upload of a confirmed confirmation, also as a changed file', async () => {
  const first = await classify(await confirmation());
  const saved = await book({ importKey: first.trade!.importKey });
  expect(saved.status).toBe(201);
  const { trade } = (await saved.json()) as { trade: { id: string } };

  const again = await classify(await confirmation());
  expect(again.trade?.duplicate).toEqual({
    tradeId: trade.id,
    securityId: SECURITY,
    date: '2026-11-09',
  });
  // The same execution id in a file with other bytes is the same confirmation.
  const changed = await confirmation({
    issuer: 'Beispiel Broker AG Musterweg 3 00000 Beispielstadt',
  });
  expect(changed.equals(await confirmation())).toBe(false);
  const other = await classify(changed);
  expect(other.trade?.duplicate?.tradeId).toBe(trade.id);

  // A repeated write with the same key writes nothing.
  const before = tables();
  const repeat = await book({ importKey: first.trade!.importKey });
  expect(repeat.status).toBe(200);
  expect(((await repeat.json()) as { duplicate: boolean }).duplicate).toBe(true);
  expect(tables()).toBe(before);
});

it('detects a trade with the same figures that was entered by hand', async () => {
  expect((await book({})).status).toBe(201);
  const body = await classify(await confirmation({ execution: '7a7b-7c7d' }));
  expect(body.trade?.duplicate).toMatchObject({ securityId: SECURITY, date: '2026-11-09' });
  // Another quantity on the same day is another trade.
  const different = await classify(
    await confirmation({
      execution: '8a8b-8c8d',
      row: 'Synthetic Index Fund (Acc) 0,339444 Stk. 294,60 EUR 100,00 EUR',
    }),
  );
  expect(different.trade?.duplicate).toBeNull();
});

it('does not mistake another keyed execution with the same figures for a duplicate', async () => {
  const first = await classify(await confirmation({ execution: '1a1a-1a1a' }));
  expect((await book({ importKey: first.trade!.importKey })).status).toBe(201);
  const second = await classify(await confirmation({ execution: '2b2b-2b2b' }));
  expect(second.trade?.duplicate).toBeNull();
  expect((await book({ importKey: second.trade!.importKey })).status).toBe(201);
});

it('offers a deleted confirmation again under a fresh key', async () => {
  const first = await classify(await confirmation());
  const saved = await book({ importKey: first.trade!.importKey });
  const { trade } = (await saved.json()) as { trade: { id: string } };
  const removed = await app.request(`/api/trades/${trade.id}`, { method: 'DELETE', headers });
  expect(removed.status).toBe(200);

  const again = await classify(await confirmation());
  expect(again.trade?.duplicate).toBeNull();
  expect(again.trade?.importKey).toBe('wpa:1a2b-3c4d#2');
  const second = await book({ importKey: again.trade!.importKey });
  expect(second.status).toBe(201);
  expect((await classify(await confirmation())).trade?.duplicate).not.toBeNull();
});

const json = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const bookings = () => opened.db.select().from(schema.booking).all();

it('books the counter booking on the chosen settlement account and undoes everything as one group', async () => {
  const saved = await book({
    feeCents: 100,
    importKey: 'wpa:1a2b-3c4d',
    settlementAccountId: 'giro',
  });
  expect(saved.status).toBe(201);
  const body = (await saved.json()) as { groupId: string; transferId: string | null };
  expect(body.transferId).toBeTruthy();
  const rows = bookings();
  expect(rows.filter((r) => r.accountId === 'giro').map((r) => r.amountCents)).toEqual([-10_100]);
  expect(rows).toHaveLength(3);

  const undone = await json('/api/undo', { groupId: body.groupId });
  expect(undone.status).toBe(200);
  expect(bookings().filter((r) => r.deletedAt === null)).toHaveLength(0);
  expect(
    opened.db
      .select()
      .from(schema.trade)
      .all()
      .every((t) => t.deletedAt !== null),
  ).toBe(true);
});

it('books no counter booking without a chosen settlement account', async () => {
  expect((await book({ feeCents: 100 })).status).toBe(201);
  expect(bookings().map((r) => r.accountId)).toEqual([DEPOT]);
});

it('refuses a settlement account in another currency without writing anything', async () => {
  const before = tables();
  const refused = await book({ importKey: 'wpa:1a2b-3c4d', settlementAccountId: 'usd' });
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(refused.status).toBeLessThan(500);
  expect(tables()).toBe(before);
});

it('confirms a savings plan month with the confirmation key and counter booking', async () => {
  const plan = await json('/api/savings-plans', {
    securityId: SECURITY,
    accountId: DEPOT,
    sourceAccountId: 'giro',
    amountCents: 10_000,
    dayOfMonth: 9,
    validFrom: '2026-11-01',
  });
  expect(plan.status).toBe(201);
  const { plan: created } = (await plan.json()) as { plan: { id: string } };
  const confirm = (extra: Record<string, unknown> = {}) =>
    json(`/api/savings-plans/${created.id}/confirm-execution`, {
      month: '2026-11',
      date: '2026-11-09',
      plannedDate: '2026-11-09',
      plannedAmountCents: 10_000,
      plannedCurrency: 'EUR',
      unitsE8: 33_944_300,
      amountCents: 10_000,
      feeCents: 0,
      note: null,
      importKey: 'wpa:1a2b-3c4d',
      settlementAccountId: 'giro',
      ...extra,
    });
  const first = await confirm();
  expect(first.status).toBe(201);
  expect(
    bookings()
      .filter((r) => r.accountId === 'giro')
      .map((r) => r.amountCents),
  ).toEqual([-10_000]);
  // The key is stored: the same confirmation is recognised even after the figures were edited.
  const upload = await classify(await confirmation());
  expect(upload.trade?.proposal.reference).toBe('wpa:1a2b-3c4d');
  expect(
    opened.db
      .select()
      .from(schema.trade)
      .all()
      .map((t) => t.importKey),
  ).toEqual(['wpa:1a2b-3c4d']);
  expect(upload.trade?.duplicate?.date).toBe('2026-11-09');
});

it('deletes the counter transfer with the trade and refuses a counter booking without reference', async () => {
  const noKey = await book({ settlementAccountId: 'giro' });
  expect(noKey.status).toBeGreaterThanOrEqual(400);
  expect(noKey.status).toBeLessThan(500);
  expect(bookings()).toHaveLength(0);

  const saved = await book({ importKey: 'wpa:1a2b-3c4d', settlementAccountId: 'giro' });
  const { trade } = (await saved.json()) as { trade: { id: string } };
  expect(bookings()).toHaveLength(3);
  const removed = await app.request(`/api/trades/${trade.id}`, { method: 'DELETE', headers });
  expect(removed.status).toBe(200);
  expect(bookings().filter((r) => r.deletedAt === null)).toHaveLength(0);
});
