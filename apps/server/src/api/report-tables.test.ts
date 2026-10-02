/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  createTestDatabase,
  schema,
  type Db,
} from '@budget/db';
import {
  buildTableRows,
  monthConsumption,
  monthHouseholdIncome,
  tableRowTotal,
  type TableMeta,
} from '@budget/domain';
import { referenceModel } from '@budget/fixtures';
import { seedDatabase } from '@budget/fixtures/seed';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, type AuthGate } from '../app';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-report-tables-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

const euroCents = (euros: number) => Math.round(euros * 100);
const ref = referenceModel();

let db: Db;
let app: ReturnType<typeof createApp>;
let sample: any;
let withNetWorth: any;
beforeAll(async () => {
  db = createTestDatabase().db;
  seedDatabase(db);
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
  sample = (await get('/report-tables/months')).body;
  withNetWorth = (await get('/report-tables/months?netWorth=1')).body;
});

async function get(path: string, application = app) {
  const res = await application.request(`/api${path}`);
  return { status: res.status, body: (await res.json()) as any };
}

describe('GET /api/report-tables/months on the sample ledger', () => {
  it('covers every month from the budget start to today, September as the running month', () => {
    expect(sample.asOf).toBe(TODAY);
    expect(sample.firstMonth).toBe('2023-10');
    expect(sample.currentMonth).toBe('2026-09');
    expect(sample.lastFullMonth).toBe('2026-08');
    expect(sample.months).toHaveLength(36);
    expect(sample.months[0].month).toBe('2023-10');
    expect(sample.months[35].month).toBe('2026-09');
  });

  it('spending per category and month equals the reference model, refunds netted against the payee category', () => {
    // The insurer who refunds ("Erstattungen") has a default category: the refund goes back there.
    const refundPayee = db
      .select()
      .from(schema.payee)
      .all()
      .find((p) => p.id === 'pay-versicherung-g');
    const refundCategory = refundPayee?.defaultCategoryId ?? null;
    expect(refundCategory).not.toBeNull();
    const mismatches: string[] = [];
    let netted = 0;
    for (const m of sample.months as any[]) {
      const k = ref.months.findIndex((x) => x.key === m.month);
      const expected = ref.spend[k] as Record<string, number>;
      const refund = euroCents((ref.income[k] as Record<string, number>)['Erstattungen'] ?? 0);
      netted += refund;
      for (const c of sample.categories as any[]) {
        const want =
          euroCents(expected[c.id.replace(/^cat-/, '')] ?? 0) -
          (c.id === refundCategory ? refund : 0);
        const got = m.spending[c.id] ?? 0;
        if (want !== got) mismatches.push(`${m.month} ${c.id}: ${got} instead of ${want}`);
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(netted).toBeGreaterThan(0);
  });

  it('income per type equals the reference model; Kapitalerträge and Erstattungen are no household income', () => {
    const typeId = (name: string) =>
      (sample.incomeTypes as any[]).find((t) => t.name === name).id as string;
    for (const m of sample.months as any[]) {
      const k = ref.months.findIndex((x) => x.key === m.month);
      const inc = ref.income[k] as Record<string, number>;
      for (const [name, euros] of Object.entries(inc))
        // Erstattungen are netted against their category, so none is left as income
        expect(m.income[typeId(name)] ?? 0, `${m.month} ${name}`).toBe(
          name === 'Erstattungen' ? 0 : euroCents(euros),
        );
    }
    const roles = Object.fromEntries((sample.incomeTypes as any[]).map((t) => [t.name, t.role]));
    expect(roles['Kapitalerträge']).toBe('capital');
    expect(roles['Erstattungen']).toBe('refund');
    expect(roles['Gehalt']).toBe('income');
    const meta = sample as TableMeta;
    const aug = (sample.months as any[]).find((m) => m.month === '2026-08');
    const inc = ref.income[34] as Record<string, number>;
    expect(monthHouseholdIncome(aug, meta)).toBe(
      euroCents(
        Object.entries(inc)
          .filter(([name]) => name !== 'Kapitalerträge' && name !== 'Erstattungen')
          .reduce((a, [, v]) => a + v, 0),
      ),
    );
  });

  it('Konsum of a month is Bedarf plus Wunsch spending of the reference model less the refunds', () => {
    const meta = sample as TableMeta;
    for (const m of sample.months as any[]) {
      const k = ref.months.findIndex((x) => x.key === m.month);
      // the refund (Bedarf category of the insurer) reduces Konsum in its month
      const refund = euroCents((ref.income[k] as Record<string, number>)['Erstattungen'] ?? 0);
      expect(monthConsumption(m, meta), m.month).toBe(euroCents(ref.consumptionOf(k)) - refund);
    }
  });

  it('the Gesamttabelle rows add up: class totals, Konsum and Übrig', () => {
    const meta = sample as TableMeta;
    const rows = buildTableRows(sample.months, meta, true);
    const total = (key: string) => tableRowTotal(rows.find((r) => r.key === key)!) ?? 0;
    expect(total('cons')).toBe(total('need') + total('want'));
    expect(total('rest')).toBe(total('inc') - total('cons') - total('future'));
    for (const cls of ['need', 'want', 'future'])
      expect(
        rows
          .filter((r) => r.kind === 'group' && r.key.startsWith(`${cls}:`))
          .reduce((a, r) => a + (tableRowTotal(r) ?? 0), 0),
      ).toBe(total(cls));
  });

  it('carries the plan, top payees and the rule goals', () => {
    expect(Object.keys(sample.payees).length).toBeGreaterThan(0);
    for (const names of Object.values(sample.payees) as string[][])
      expect(names.length).toBeLessThanOrEqual(3);
    expect(sample.targets).toEqual({ savingsRateBp: 2000, moneyAgeDays: 30 });
    const planned = (sample.months as any[]).filter((m) => Object.keys(m.assigned).length > 0);
    expect(planned.length).toBeGreaterThan(0);
  });

  it('Geldalter is a whole number of days where outflows exist', () => {
    const ages = (sample.months as any[]).map((m) => m.moneyAgeDays);
    expect(ages.every((a) => a === null || Number.isInteger(a))).toBe(true);
    expect(ages.filter((a) => a !== null).length).toBeGreaterThan(30);
  });

  it('omits the net worth unless asked and gives month-end values when asked', () => {
    expect(sample.netWorth).toBe('omitted');
    expect(sample.months.every((m: any) => m.netWorthCents === null)).toBe(true);
    expect(withNetWorth.netWorth).toBe('ok');
    // the running month shows today's net worth, the prototype figure
    expect(withNetWorth.months[35].netWorthCents).toBe(8_473_000);
    const nw = (withNetWorth.months as any[]).map((m) => m.netWorthCents);
    expect(nw.every((v) => Number.isInteger(v))).toBe(true);
    // every month end is the net worth of the prototype's reference model (rounding to cents aside)
    nw.forEach((value, k) =>
      expect(Math.abs(value - euroCents(ref.nw[k] as number))).toBeLessThanOrEqual(5),
    );
  });

  it('is a read: a further call leaves the net worth untouched', async () => {
    const before = (await get('/accounts')).body.netWorthEurCents;
    await get('/report-tables/months?netWorth=1');
    expect((await get('/accounts')).body.netWorthEurCents).toBe(before);
  });

  it('rejects an invalid query', async () => {
    expect((await get('/report-tables/months?netWorth=2')).status).toBe(400);
  });
});

describe('GET /api/report-tables/months on small ledgers', () => {
  it('answers honestly without a budget account', async () => {
    const empty = createTestDatabase().db;
    const application = createApp({
      webDir,
      auth: signedIn,
      ledger: { db: empty, today: () => TODAY },
    });
    const { status, body } = await get('/report-tables/months?netWorth=1', application);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      firstMonth: null,
      lastFullMonth: null,
      months: [],
      netWorth: 'unavailable',
    });
  });

  it('counts only complete months as full, keeps refunds and Kapitalerträge out of income and nets refunds against the category', async () => {
    const small = createTestDatabase().db;
    const ctx = { actor: 'tester' };
    accounts.create(
      small,
      {
        id: 'giro',
        name: 'Giro',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-07-01',
        openingBalanceCents: 100_000,
      },
      ctx,
    );
    createEntity(small, schema.categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
    categories.create(small, { id: 'essen', name: 'Essen', groupId: 'g', class: 'need' }, ctx);
    categories.create(small, { id: 'rest', name: 'Restaurant', groupId: 'g', class: 'want' }, ctx);
    createEntity(
      small,
      schema.payee,
      { id: 'p-insurer', name: 'Versicherer', defaultCategoryId: 'rest' },
      ctx,
    );
    const book = (date: string, amountCents: number, split: Record<string, unknown>) =>
      createBooking(
        small,
        { accountId: 'giro', date, amountCents, splits: [{ amountCents, ...split }] },
        ctx,
      );
    book('2026-07-05', -20_000, { categoryId: 'essen' });
    book('2026-07-06', 5_000, { categoryId: 'essen' });
    book('2026-07-28', 250_000, { categoryId: null, incomeTypeId: 'income-salary' });
    book('2026-07-29', 1_200, { categoryId: null, incomeTypeId: 'income-capital' });
    book('2026-08-02', -9_000, { categoryId: 'rest' });
    // a refund of a payee with a category goes back to it, one without stays visible
    createBooking(
      small,
      {
        accountId: 'giro',
        date: '2026-08-30',
        amountCents: 3_000,
        payeeId: 'p-insurer',
        splits: [{ amountCents: 3_000, categoryId: null, incomeTypeId: 'income-refund' }],
      },
      ctx,
    );
    book('2026-07-30', 700, { categoryId: null, incomeTypeId: 'income-refund' });
    const application = createApp({
      webDir,
      auth: signedIn,
      ledger: { db: small, today: () => '2026-08-31' },
    });
    const { body } = await get('/report-tables/months', application);
    // today is the last day of August: August is complete
    expect(body.lastFullMonth).toBe('2026-08');
    expect(body.months.map((m: any) => m.month)).toEqual(['2026-07', '2026-08']);
    // the refund nets against the category
    expect(body.months[0].spending).toEqual({ essen: 15_000 });
    expect(body.months[0].income).toEqual({
      'income-salary': 250_000,
      'income-capital': 1_200,
      'income-refund': 700,
    });
    // August: 9.000 spent at the restaurant, 3.000 refunded to the same category in the refund month
    expect(body.months[1].spending).toEqual({ rest: 6_000 });
    expect(body.months[1].income).toEqual({});
    const meta = body as TableMeta;
    expect(monthHouseholdIncome(body.months[0], meta)).toBe(250_000);
    expect(monthHouseholdIncome(body.months[1], meta)).toBe(0);

    const mid = createApp({
      webDir,
      auth: signedIn,
      ledger: { db: small, today: () => '2026-08-15' },
    });
    expect((await get('/report-tables/months', mid)).body.lastFullMonth).toBe('2026-07');
  });
});
