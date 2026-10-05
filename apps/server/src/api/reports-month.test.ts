/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  createTestDatabase,
  createTransfer,
  ensureDefaultRules,
  INCOME_TYPES,
  schema,
  type Db,
} from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

/**
 * The reports of "Monat und Einkommen" on a small synthetic ledger. March 2026 holds household
 * income, Kapitalerträge, a refund, a contact repayment, a transfer, an untyped inflow and a
 * booking after "today": only the first kind counts as income.
 */
const TODAY = '2026-03-18';
const webDir = mkdtempSync(join(tmpdir(), 'budget-month-reports-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

beforeEach(async () => {
  db = createTestDatabase().db;
  const ctx = { actor: 'tester' };
  for (const [id, name, role, sortOrder] of [
    ['giro', 'Giro', 'budget', 1],
    ['spar', 'Tagesgeld', 'reserve', 2],
  ] as const)
    accounts.create(
      db,
      {
        id,
        name,
        type: id === 'giro' ? 'checking' : 'savings',
        role,
        onBudget: true,
        openingDate: '2026-01-01',
        openingBalanceCents: 0,
        sortOrder,
      },
      ctx,
    );
  createEntity(db, schema.categoryGroup, { id: 'g-fix', name: 'Fixkosten' }, ctx);
  createEntity(db, schema.categoryGroup, { id: 'g-leben', name: 'Leben' }, ctx);
  createEntity(db, schema.categoryGroup, { id: 'g-zukunft', name: 'Rücklagen' }, ctx);
  categories.create(
    db,
    { id: 'miete', name: 'Miete', groupId: 'g-fix', class: 'need', kind: 'fixed' },
    ctx,
  );
  categories.create(db, { id: 'essen', name: 'Essen', groupId: 'g-leben', class: 'need' }, ctx);
  categories.create(db, { id: 'reise', name: 'Reise', groupId: 'g-leben', class: 'want' }, ctx);
  categories.create(
    db,
    { id: 'invest', name: 'Investieren', groupId: 'g-zukunft', class: 'future', kind: 'invest' },
    ctx,
  );
  categories.create(
    db,
    { id: 'auslagen', name: 'Auslagen', groupId: 'g-fix', class: null, kind: 'advance' },
    ctx,
  );
  createEntity(db, schema.payee, { id: 'p1', name: 'Arbeitgeber' }, ctx);
  createEntity(db, schema.contact, { id: 'k1', name: 'Kontakt' }, ctx);

  const book = (
    accountId: string,
    date: string,
    amountCents: number,
    splits: Parameters<typeof createBooking>[1]['splits'],
  ) => createBooking(db, { accountId, date, amountCents, payeeId: 'p1', splits }, ctx);
  const salary = INCOME_TYPES.salary.id;
  book('giro', '2026-03-02', 300_000, [
    { categoryId: null, amountCents: 300_000, incomeTypeId: salary },
  ]);
  book('giro', '2026-03-05', 50_000, [
    { categoryId: null, amountCents: 50_000, incomeTypeId: INCOME_TYPES.contribution.id },
  ]);
  book('spar', '2026-03-06', 4_000, [
    { categoryId: null, amountCents: 4_000, incomeTypeId: INCOME_TYPES.capital.id },
  ]);
  book('giro', '2026-03-07', 2_000, [
    { categoryId: null, amountCents: 2_000, incomeTypeId: INCOME_TYPES.refund.id },
  ]);
  book('giro', '2026-03-08', 1_500, [
    { categoryId: 'essen', amountCents: 1_500, incomeTypeId: INCOME_TYPES.refund.id },
  ]);
  book('giro', '2026-03-09', 3_000, [
    { categoryId: 'auslagen', amountCents: 3_000, contactId: 'k1' },
  ]);
  createTransfer(
    db,
    { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-03-10', amountCents: 20_000 },
    ctx,
  );
  // Untyped cash inflows are household income under the shared overview/table classifier.
  book('giro', '2026-03-10', 9_000, [{ categoryId: null, amountCents: 9_000 }]);
  book('giro', '2026-03-25', 5_000, [
    { categoryId: null, amountCents: 5_000, incomeTypeId: INCOME_TYPES.side.id },
  ]);
  book('giro', '2026-03-03', -90_000, [{ categoryId: 'miete', amountCents: -90_000 }]);
  book('giro', '2026-03-11', -12_000, [{ categoryId: 'essen', amountCents: -12_000 }]);
  book('giro', '2026-03-12', -5_000, [{ categoryId: 'invest', amountCents: -5_000 }]);
  book('giro', '2026-02-02', 280_000, [
    { categoryId: null, amountCents: 280_000, incomeTypeId: salary },
  ]);
  book('giro', '2026-02-12', -80_000, [{ categoryId: 'miete', amountCents: -80_000 }]);
  ensureDefaultRules(db);
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
  await call('PUT', '/budget/2026-03/assigned', {
    items: [
      { categoryId: 'miete', assignedCents: 90_000 },
      { categoryId: 'essen', assignedCents: 30_000 },
    ],
  });
});

describe('GET /reports/month/income', () => {
  it('counts household income only; Kapitalerträge and refunds are shown apart', async () => {
    const r = await call('GET', '/reports/month/income?month=2026-03');
    expect(r.status).toBe(200);
    expect(r.body.income.types).toEqual([
      { typeId: salary(), name: 'Gehalt', cents: 300_000 },
      { typeId: INCOME_TYPES.contribution.id, name: 'Beiträge von Kontakten', cents: 50_000 },
      { typeId: INCOME_TYPES.other.id, name: 'Sonstiges', cents: 9_000 },
    ]);
    expect(r.body.income.earnedCents).toBe(359_000);
    expect(r.body.income.capitalCents).toBe(4_000);
    // The uncategorised refund is no income; the refund inside "Essen" is not an income split.
    expect(r.body.income.refundCents).toBe(2_000);
    expect(r.body.partial).toBe(true);
  });

  it('twelve-month window by type, oldest month first, without records before the first month', async () => {
    const r = await call('GET', '/reports/month/income?month=2026-03');
    expect(r.body.window.months).toEqual(['2026-01', '2026-02', '2026-03']);
    const gehalt = r.body.window.rows.find((x: any) => x.name === 'Gehalt');
    expect(gehalt).toMatchObject({ perMonth: [0, 280_000, 300_000], sumCents: 580_000 });
    expect(r.body.window.capital.perMonth).toEqual([0, 0, 4_000]);
    const shares = r.body.window.rows.reduce((a: number, x: any) => a + x.sharePercent, 0);
    expect(shares).toBe(100);
  });

  it('expected payments show their match status, a payment still ahead is pending', async () => {
    const base = { accountId: 'giro', rhythm: 'monthly', validFrom: '2026-01-01' };
    await call('POST', '/expected', {
      ...base,
      name: 'Gehalt',
      kind: 'inflow',
      incomeTypeId: salary(),
      dueDay: 31,
      dateShift: 'before',
      amountCents: 300_000,
    });
    await call('POST', '/expected', {
      ...base,
      name: 'Beitrag',
      kind: 'inflow',
      incomeTypeId: INCOME_TYPES.contribution.id,
      dueDay: 5,
      amountCents: 50_000,
    });
    const before = await call('GET', '/reports/month/income?month=2026-03');
    expect(before.body.expectedMaterialised).toBe(true);
    // Nothing is matched yet, so the booked income cannot be explained by an expected payment.
    expect(before.body.expected.lines.map((l: any) => [l.name, l.status])).toEqual([
      ['Beitrag', 'overdue'],
      ['Gehalt', 'pending'],
      ['Beiträge von Kontakten', 'unplanned'],
      ['Gehalt', 'unplanned'],
      ['Sonstiges', 'unplanned'],
    ]);
    expect(before.body.expected).toMatchObject({
      pendingCount: 1,
      pendingCents: 300_000,
      missingCount: 1,
    });

    await call('POST', '/expected/refresh');
    const after = await call('GET', '/reports/month/income?month=2026-03');
    // The salary was booked on the 2nd, outside the date window of its due day (31st): unplanned.
    expect(after.body.expected.lines.map((l: any) => [l.name, l.status, l.receivedCents])).toEqual([
      ['Beitrag', 'ok', 50_000],
      ['Gehalt', 'pending', 0],
      ['Gehalt', 'unplanned', 300_000],
      ['Sonstiges', 'unplanned', 9_000],
    ]);
    expect(after.body.expected.missingCount).toBe(0);
  });

  it('a month before the records is empty, not an error', async () => {
    const r = await call('GET', '/reports/month/income?month=2024-05');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ beforeRecords: true, income: { earnedCents: 0 } });
  });

  it('refuses a later month and a malformed one', async () => {
    expect((await call('GET', '/reports/month/income?month=2026-04')).status).toBe(422);
    expect((await call('GET', '/reports/month/income?month=2026-4')).status).toBe(400);
  });
});

describe('GET /reports/month/flow', () => {
  it('Einnahmen + Kapitalerträge − Klassen = Übrig; the contact repayment and the transfer are no flow', async () => {
    const r = await call('GET', '/reports/month/flow?month=2026-03');
    expect(r.status).toBe(200);
    const { flow } = r.body;
    expect(flow.earnedCents).toBe(359_000);
    expect(flow.capitalCents).toBe(4_000);
    // Bedarf: Miete 90.000 + Essen 12.000 − refund 1.500; Zukunft: Investieren 5.000.
    expect(flow.chain).toEqual([
      { label: 'Einnahmen', cents: 359_000 },
      { label: 'Kapitalerträge', cents: 4_000, op: '+' },
      { label: 'Bedarf', cents: 100_500, op: '-' },
      { label: 'Zukunft', cents: 5_000, op: '-' },
      { label: 'Übrig', cents: 257_500, op: '=', result: true },
    ]);
    expect(flow.columns.income.map((n: any) => [n.name, n.tone])).toEqual([
      ['Gehalt', 'inc'],
      ['Beiträge von Kontakten', 'inc'],
      ['Sonstiges', 'inc'],
      ['Kapitalerträge', 'cap'],
    ]);
    expect(flow.table.reduce((a: number, x: any) => a + x.sharePercent, 0)).toBe(100);
    expect(r.body.refundCents).toBe(2_000);
  });

  it('twelve months end at the last full month while the current one runs', async () => {
    const r = await call('GET', '/reports/month/flow?month=2026-03&span=year');
    expect(r.body).toMatchObject({ from: '2026-01', to: '2026-02', monthCount: 2 });
    expect(r.body.flow.earnedCents).toBe(280_000);
    expect(r.body.flow.capitalCents).toBe(0);
  });
});

describe('GET /reports/month/onepager', () => {
  it('result chain, 50/30/20 shares and findings come from the same ledger', async () => {
    const r = await call('GET', '/reports/month/onepager?month=2026-03');
    expect(r.status).toBe(200);
    expect(r.body.result).toMatchObject({
      earnedCents: 359_000,
      consumptionCents: 100_500,
      futureCents: 5_000,
      savedCents: 258_500,
      restCents: 253_500,
    });
    expect(r.body.capitalCents).toBe(4_000);
    const s = r.body.allocation.shares;
    expect(s.need + s.want + s.future + s.rest).toBe(100);
    expect(r.body.top.map((t: any) => t.name)).toEqual(['Miete', 'Essen']);
    expect(r.body.top[0]).toMatchObject({
      cents: 90_000,
      previousCents: 80_000,
      deltaCents: 10_000,
    });
    expect(r.body.plan.total).toBeGreaterThan(0);
    expect(r.body.check.total).toBe(16);
    expect(r.body.pace.month).toBe('2026-03');
    expect(r.body.netWorth.cents).toEqual(expect.any(Number));
  });

  it('a past month is evaluated on its last day and is not partial', async () => {
    const r = await call('GET', '/reports/month/onepager?month=2026-02');
    expect(r.body).toMatchObject({ asOf: '2026-02-28', partial: false, previousMonth: '2026-01' });
    expect(r.body.result.earnedCents).toBe(280_000);
    expect(r.body.netWorth.previousMonthEndCents).toEqual(expect.any(Number));
  });

  it('refuses a later month', async () => {
    expect((await call('GET', '/reports/month/onepager?month=2026-09')).status).toBe(422);
  });
});

function salary() {
  return INCOME_TYPES.salary.id;
}
