/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  allocationMonth,
  budget,
  categories,
  createBooking,
  createEntity,
  addExpectedVersion,
  createExpectedPayment,
  createTransfer,
  portfolioSummary,
  ruleInputs,
  createTestDatabase,
  INCOME_TYPES,
  schema,
  setAssigned,
  storeCpi,
  type Db,
  type OpenedDatabase,
} from '@budget/db';
import { allocation, fixedCostRatio } from '@budget/domain';
import { referenceModel } from '@budget/fixtures';
import { seedDatabase } from '@budget/fixtures/seed';
import type { Hono } from 'hono';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

// The sample ledger is large and the machine may be busy: a report may take a few seconds.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

function api(db: Db, today: string): Hono {
  return createLedgerApi({ db, today: () => today, stepUp: async (_c, next) => next() });
}
async function get(app: Hono, path: string) {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as any };
}

describe('2.1 Ausgabenanalyse on a small ledger', () => {
  let opened: OpenedDatabase;
  let app: Hono;
  beforeEach(() => {
    opened = createTestDatabase();
    seedBasics(opened.db);
    // Future class and income-like categories must never become consumption.
    categories.create(
      opened.db,
      { id: 'sparplan', name: 'Sparplan', groupId: 'g', class: 'future', kind: 'saving' },
      { actor: 'test' },
    );
    app = api(opened.db, '2026-09-17');
  });
  afterEach(() => opened.close());

  function spend(date: string, categoryId: string, cents: number, id?: string) {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date,
        amountCents: -cents,
        ...(id ? { id } : {}),
        splits: [{ categoryId, amountCents: -cents }],
      },
      { actor: 'test' },
    );
  }

  it('sums Bedarf and Wunsch as consumption, keeps Zukunft apart and nets refunds', async () => {
    spend('2026-08-03', 'miete', 60_000);
    spend('2026-08-10', 'essen', 20_000);
    spend('2026-08-12', 'reise', 15_000);
    spend('2026-08-20', 'sparplan', 40_000);
    // A refund in Essen lowers the category.
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-21',
        amountCents: 2_500,
        splits: [{ categoryId: 'essen', amountCents: 2_500 }],
      },
      { actor: 'test' },
    );
    const { status, body } = await get(app, '/reports/spending/analysis?period=1M');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      period: '1M',
      from: '2026-08-01',
      to: '2026-08-31',
      needCents: 60_000 + 17_500,
      wantCents: 15_000,
      futureCents: 40_000,
      consumptionCents: 92_500,
      averagePerMonthCents: 92_500,
    });
    expect(body.rows.map((r: any) => [r.id, r.cents])).toEqual([
      ['miete', 60_000],
      ['essen', 17_500],
      ['reise', 15_000],
    ]);
    const { need, want, future } = body.classShares;
    expect(need + want + future).toBe(100);
    // Same envelope activity as Plan and Heute.
    const august = budget(opened.db, ['2026-08'])[0]!;
    expect(-august.envelopes['essen']!.activityCents).toBe(17_500);
  });

  it('has no previous window when the ledger is too short and says so honestly', async () => {
    spend('2026-08-03', 'miete', 60_000);
    const { body } = await get(app, '/reports/spending/analysis?period=1J');
    expect(body.availableFrom).toBe('2023-10-01');
    expect(body.previousFrom).not.toBeNull(); // 12 + 12 months exist since 2023-10
    const all = (await get(app, '/reports/spending/analysis?period=Alles')).body;
    expect(all.previousFrom).toBeNull();
    expect(all.changeCents).toBeNull();
    expect(all.moves).toEqual([]);
  });

  it('is empty before any budget account exists and rejects unknown periods', async () => {
    const empty = createTestDatabase();
    const response = await get(api(empty.db, '2026-09-17'), '/reports/spending/analysis');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      from: null,
      to: null,
      consumptionCents: 0,
      rows: [],
      availableMonths: 0,
    });
    empty.close();
    expect((await get(app, '/reports/spending/analysis?period=5J')).status).toBe(400);
  });

  it('serves actual income/expense rows and the read-only goal additions', async () => {
    spend('2026-08-03', 'essen', 12_000);
    const before = opened.sqlite.prepare('select count(*) n from audit_log').get();
    const report = await get(app, '/report-tables/income-expense');
    expect(report.status).toBe(200);
    expect(
      report.body.months.find((m: { month: string }) => m.month === '2026-08').spending.essen,
    ).toBe(12_000);
    expect(report.body.splits).toHaveLength(1);
    const goals = await get(app, '/goals/report');
    expect(goals.status).toBe(200);
    expect(goals.body.coverage).toMatchObject({ averageNeedCents: 1_000, months: 12 });
    expect(opened.sqlite.prepare('select count(*) n from audit_log').get()).toEqual(before);
  });

  it('never writes', async () => {
    spend('2026-08-03', 'miete', 60_000);
    const count = () =>
      opened.sqlite.prepare('select count(*) n from audit_log').get() as { n: number };
    const before = count().n;
    await get(app, '/reports/spending/analysis?period=Alles');
    expect(count().n).toBe(before);
  });
});

describe('2.1 Ausgabenanalyse on the sample ledger', () => {
  let db: Db;
  let app: Hono;
  beforeAll(() => {
    db = createTestDatabase().db;
    seedDatabase(db);
    app = api(db, '2026-09-17');
  });

  it('reproduces the prototype consumption of August 2026 and of the last 12 months', async () => {
    const ref = referenceModel();
    const august = (await get(app, '/reports/spending/analysis?period=1M')).body;
    expect(
      Math.abs(august.consumptionCents - Math.round(ref.consumptionOf(34) * 100)),
    ).toBeLessThanOrEqual(2);
    const year = (await get(app, '/reports/spending/analysis?period=1J')).body;
    expect(year.months).toHaveLength(12);
    expect(year.months[11]).toBe('2026-08');
    const expected = Array.from({ length: 12 }, (_, i) => ref.consumptionOf(23 + i)).reduce(
      (a, b) => a + b,
      0,
    );
    // Erstattungen of the car insurance (6.495 + 10.183 cents in this window) are netted against
    // their category instead of counting as income (owner decision), the prototype does not.
    const refunds = 6_495 + 10_183;
    expect(
      Math.abs(year.consumptionCents - (Math.round(expected * 100) - refunds)),
    ).toBeLessThanOrEqual(30);
    expect(year.needCents + year.wantCents).toBe(year.consumptionCents);
    expect(year.previousFrom).toBe('2024-09-01');
    expect(year.heatMonths).toEqual(year.months);
    // Row totals of the heatmap are the category figures of the list.
    for (const row of year.heatRows)
      expect(row.totalCents).toBe(year.rows.find((r: any) => r.id === row.id).cents);
  });
});

describe('2.2 Budgettreue on a small ledger', () => {
  let opened: OpenedDatabase;
  let app: Hono;
  const ctx = { actor: 'test' };
  beforeEach(() => {
    opened = createTestDatabase();
    seedBasics(opened.db);
    categories.create(
      opened.db,
      { id: 'versicherung', name: 'Versicherung', groupId: 'g', class: 'need', kind: 'periodic' },
      ctx,
    );
    app = api(opened.db, '2026-09-17');
  });
  afterEach(() => opened.close());
  const spend = (date: string, categoryId: string, cents: number) =>
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date,
        amountCents: -cents,
        splits: [{ categoryId, amountCents: -cents }],
      },
      ctx,
    );
  const income = (date: string, cents: number, incomeTypeId: string) =>
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date,
        amountCents: cents,
        splits: [{ categoryId: null, amountCents: cents, incomeTypeId }],
      },
      ctx,
    );

  it('returns absolute deviations for assignment withdrawals and zero net plans', async () => {
    setAssigned(opened.db, 'essen', '2026-08', -200, ctx);
    spend('2026-08-03', 'essen', 18000);
    const answer = await get(app, '/reports/spending/adherence?month=2026-08');
    expect(answer.status).toBe(200);
    expect(answer.body.deviation.rows.find((r: any) => r.id === 'essen')).toMatchObject({
      planCents: -200,
      istCents: 18000,
      deviationCents: 18200,
      deviationBp: null,
      inBand: null,
    });
  });
  it('compares spending with assigned money, plans periodic costs with their reserve', async () => {
    setAssigned(opened.db, 'essen', '2026-08', 20_000, ctx);
    setAssigned(opened.db, 'miete', '2026-08', 60_000, ctx);
    setAssigned(opened.db, 'versicherung', '2026-06', 5_000, ctx);
    setAssigned(opened.db, 'versicherung', '2026-07', 5_000, ctx);
    setAssigned(opened.db, 'versicherung', '2026-08', 5_000, ctx);
    spend('2026-08-10', 'essen', 25_000);
    spend('2026-08-01', 'miete', 60_000);
    spend('2026-08-12', 'versicherung', 14_000);
    const { status, body } = await get(app, '/reports/spending/adherence?month=2026-08');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      month: '2026-08',
      live: false,
      planCents: 20_000 + 60_000 + 15_000,
      istCents: 25_000 + 60_000 + 14_000,
      overCount: 1,
    });
    expect(body.restCents).toBe(body.planCents - body.istCents);
    const by = Object.fromEntries(body.items.map((i: any) => [i.id, i]));
    expect(by.essen).toMatchObject({ planCents: 20_000, istCents: 25_000, over: true });
    expect(by.versicherung).toMatchObject({ planCents: 15_000, planBasis: 'reserve', over: false });
    expect(by.miete.over).toBe(false);
  });

  it('marks the running month as live and explains months outside the budget', async () => {
    spend('2026-09-03', 'essen', 5_000);
    const live = (await get(app, '/reports/spending/adherence')).body;
    expect(live).toMatchObject({ month: '2026-09', live: true, liveUntil: '2026-09-17' });
    expect((await get(app, '/reports/spending/adherence?month=2023-01')).body.status).toBe(
      'before_start',
    );
    expect((await get(app, '/reports/spending/adherence?month=2026-12')).body.status).toBe(
      'future',
    );
    expect((await get(app, '/reports/spending/adherence?month=2026-13')).status).toBe(400);
    const empty = createTestDatabase();
    expect(
      (await get(api(empty.db, '2026-09-17'), '/reports/spending/adherence')).body.status,
    ).toBe('no_budget');
    empty.close();
  });

  it('shows 50/30/20 on household income only: Kapitalerträge and Erstattungen are left out', async () => {
    income('2026-08-05', 300_000, INCOME_TYPES.salary.id);
    income('2026-08-15', 5_000, INCOME_TYPES.capital.id);
    income('2026-08-20', 2_000, INCOME_TYPES.refund.id);
    setAssigned(opened.db, 'miete', '2026-08', 150_000, ctx);
    const body = (await get(app, '/reports/spending/adherence?month=2026-08')).body;
    const august = body.allocation.find((r: any) => r.month === '2026-08');
    expect(august.incomeCents).toBe(300_000);
    expect(august.needCents + august.wantCents + august.futureCents + august.restCents).toBe(
      august.incomeCents,
    );
    const { need, want, future, rest } = august.shares;
    expect(need + want + future + rest).toBe(100);
    // The shared allocation (R01, Heute) uses the same household-income base.
    expect(allocationMonth(opened.db, '2026-08').incomeCents).toBe(300_000);
    expect(body.allocation.length).toBeLessThanOrEqual(12);
  });

  it('never writes', async () => {
    const count = () =>
      opened.sqlite.prepare('select count(*) n from audit_log').get() as { n: number };
    const before = count().n;
    await get(app, '/reports/spending/adherence?month=2026-08');
    expect(count().n).toBe(before);
  });
});

describe('2.2 Budgettreue on the sample ledger', () => {
  let db: Db;
  let app: Hono;
  beforeAll(() => {
    db = createTestDatabase().db;
    seedDatabase(db);
    app = api(db, '2026-09-17');
  });

  it('is the shared allocation: class amounts and the household-income base of R01', async () => {
    const body = (await get(app, '/reports/spending/adherence?month=2026-08')).body;
    expect(body.allocation).toHaveLength(12);
    const august = body.allocation.at(-1);
    expect(august.month).toBe('2026-08');
    expect(august).toMatchObject({
      needCents: 310103,
      wantCents: 192865,
      futureCents: 150888,
      incomeCents: 574584,
    });
    const shared = allocation([allocationMonth(db, '2026-08')]);
    expect(august.incomeCents).toBe(shared.incomeCents);
    for (const row of body.allocation) {
      const s = row.shares;
      expect(s.need + s.want + s.future + s.rest, row.month).toBe(100);
    }
  }, 60_000);

  it('lists the plan of August 2026 in a chain that adds up and a rolling 12-month deviation', async () => {
    const body = (await get(app, '/reports/spending/adherence?month=2026-08')).body;
    expect(body.planCents - body.istCents).toBe(body.restCents);
    expect(body.items.length).toBeGreaterThan(10);
    expect(body.deviation.from).toBe('2025-09-01');
    expect(body.deviation.to).toBe('2026-08-31');
    for (const row of body.deviation.rows)
      if (row.planCents <= 0) expect(row.deviationBp).toBeNull();
    const september = (await get(app, '/reports/spending/adherence?month=2026-09')).body;
    expect(september).toMatchObject({ live: true, status: 'ok' });
    expect(september.allocation.at(-1).month).toBe('2026-08');
  });
});

describe('2.3 Verträge und Abos on a small ledger', () => {
  let opened: OpenedDatabase;
  let app: Hono;
  const ctx = { actor: 'test' };
  const asOf = '2026-09-17';
  beforeEach(() => {
    opened = createTestDatabase();
    seedBasics(opened.db);
    categories.create(
      opened.db,
      { id: 'strom', name: 'Strom', groupId: 'g', class: 'need', kind: 'fixed' },
      ctx,
    );
    categories.create(
      opened.db,
      { id: 'abo', name: 'Abo', groupId: 'g', class: 'want', kind: 'fixed' },
      ctx,
    );
    categories.create(
      opened.db,
      { id: 'kfz', name: 'Kfz', groupId: 'g', class: 'need', kind: 'periodic' },
      ctx,
    );
    categories.create(
      opened.db,
      { id: 'ratgeber', name: 'Ratgeber', groupId: 'g', class: 'need', kind: 'variable' },
      ctx,
    );
    app = api(opened.db, asOf);
  });
  afterEach(() => opened.close());

  const contract = (
    name: string,
    categoryId: string,
    rhythm: 'monthly' | 'yearly',
    amountCents: number,
    currency = 'EUR',
  ) =>
    createExpectedPayment(
      opened.db,
      {
        name,
        kind: 'outflow',
        rhythm,
        dueDay: 1,
        categoryId,
        ...(rhythm === 'yearly' ? { dueMonth: 3 } : {}),
      },
      { validFrom: '2025-01-01', amountCents, currency },
      ctx,
      asOf,
    );

  it('lists only contract categories, valued per month and per year', async () => {
    contract('Stromvertrag', 'strom', 'monthly', 9_500);
    contract('Kfz-Service', 'kfz', 'yearly', 60_000);
    contract('Zeitschrift', 'ratgeber', 'monthly', 1_000);
    const { status, body } = await get(app, '/reports/spending/contracts');
    expect(status).toBe(200);
    expect(body.items.map((i: any) => i.name)).toEqual(['Kfz-Service', 'Stromvertrag']);
    expect(body).toMatchObject({
      fixedMonthlyCents: 9_500,
      periodicAnnualCents: 60_000,
      boundMonthlyCents: 9_500 + 5_000,
      yearlyCents: 9_500 * 12 + 60_000,
      unconvertedCount: 0,
    });
  });

  // Real setups enter a contract with its next due date as start and first price date: the
  // contract runs for years, but that date is still ahead. It must not make the report empty.
  const upcoming = (
    name: string,
    categoryId: string,
    rhythm: 'monthly' | 'yearly',
    amountCents: number,
    startDate: string,
    extra: { endDate?: string } = {},
  ) =>
    createExpectedPayment(
      opened.db,
      {
        name,
        kind: 'outflow',
        rhythm,
        dueDay: Number(startDate.slice(8)),
        ...(rhythm === 'yearly' ? { dueMonth: Number(startDate.slice(5, 7)) } : {}),
        startDate,
        ...extra,
        categoryId,
      },
      { validFrom: startDate, amountCents, currency: 'EUR' },
      ctx,
      asOf,
    );

  it('lists a contract whose first due date is still ahead, within one payment cycle', async () => {
    upcoming('Stromvertrag', 'strom', 'monthly', 9_500, '2026-10-05');
    upcoming('Kfz-Service', 'kfz', 'yearly', 60_000, '2027-02-16');
    // Not a contract yet: starts years ahead; and one that has already ended.
    upcoming('Später Vertrag', 'abo', 'monthly', 1_000, '2028-01-01');
    upcoming('Beendet', 'abo', 'monthly', 2_000, '2026-01-01', { endDate: '2026-06-30' });
    const { body } = await get(app, '/reports/spending/contracts');
    expect(body.items.map((i: any) => i.name)).toEqual(['Kfz-Service', 'Stromvertrag']);
    expect(body).toMatchObject({
      fixedMonthlyCents: 9_500,
      periodicAnnualCents: 60_000,
      yearlyCents: 9_500 * 12 + 60_000,
    });
    // One calculation: rule R10 values the same payments the same way.
    const inputs = ruleInputs(opened.db, asOf);
    expect(inputs.fixedCosts?.fixedMonthlyCents).toBe(9_500);
    expect(inputs.fixedCosts?.periodicAnnualCents).toBe(60_000);
  });

  it('uses the version in force once the payment has started, not the first one', async () => {
    const { payment } = upcoming('Stromvertrag', 'strom', 'monthly', 9_500, '2026-01-01');
    addExpectedVersion(
      opened.db,
      payment.id,
      { validFrom: '2026-09-01', amountCents: 10_500 },
      ctx,
      asOf,
    );
    const { body } = await get(app, '/reports/spending/contracts');
    expect(body.fixedMonthlyCents).toBe(10_500);
  });

  it('keeps the original foreign amount and says when no rate exists', async () => {
    contract('Dollar-Abo', 'abo', 'monthly', 2_000, 'USD');
    const missing = (await get(app, '/reports/spending/contracts')).body;
    expect(missing.items[0]).toMatchObject({
      currency: 'USD',
      nativeCents: 2_000,
      eurCents: null,
    });
    expect(missing.unconvertedCount).toBe(1);
    expect(missing.fixedMonthlyCents).toBe(0);
    opened.db
      .insert(schema.fxRate)
      .values({ currency: 'USD', date: '2026-09-01', rateMicro: 900_000, source: 'ecb' } as never)
      .run();
    const rated = (await get(app, '/reports/spending/contracts')).body;
    expect(rated.items[0]).toMatchObject({ eurCents: 1_800, rateMicro: 900_000 });
    expect(rated.foreign[0]).toMatchObject({
      currency: 'USD',
      nativeCents: 2_000,
      eurCents: 1_800,
    });
  });

  it('never writes', async () => {
    contract('Stromvertrag', 'strom', 'monthly', 9_500);
    const count = () =>
      opened.sqlite.prepare('select count(*) n from audit_log').get() as { n: number };
    const before = count().n;
    await get(app, '/reports/spending/contracts');
    expect(count().n).toBe(before);
  });
});

describe('2.3 Verträge und Abos on the sample ledger', () => {
  let db: Db;
  let app: Hono;
  beforeAll(() => {
    db = createTestDatabase().db;
    seedDatabase(db);
    app = api(db, '2026-09-17');
  });

  it('bound amounts are the numerator of rule R10 (one calculation)', async () => {
    const body = (await get(app, '/reports/spending/contracts')).body;
    const inputs = ruleInputs(db, '2026-09-17');
    expect(body.fixedMonthlyCents).toBe(inputs.fixedCosts?.fixedMonthlyCents);
    expect(body.periodicAnnualCents).toBe(inputs.fixedCosts?.periodicAnnualCents);
    expect(body.r10.netIncomeMonthlyCents).toBe(inputs.netIncomeMonthlyCents);
    expect(body.r10.ratioBp).toBe(
      fixedCostRatio({
        ...inputs.fixedCosts!,
        netIncomeCents: inputs.netIncomeMonthlyCents!,
      }),
    );
    expect(body.r10).toMatchObject({
      fixedMonthlyCents: body.fixedMonthlyCents,
      periodicAnnualCents: body.periodicAnnualCents,
      maxBp: 5_500,
    });
    expect(body.boundMonthlyCents).toBe(
      body.fixedMonthlyCents + Math.round(body.periodicAnnualCents / 12),
    );
  });

  it('shows the two USD subscriptions with their original amount and the EUR actually paid', async () => {
    const body = (await get(app, '/reports/spending/contracts')).body;
    expect(body.foreign.map((f: any) => f.name)).toEqual(['KI-Assistent', 'KI-Bildtool']);
    const [assistant, image] = body.foreign;
    expect(assistant).toMatchObject({ currency: 'USD', nativeCents: 2_000, paymentCount: 12 });
    expect(image).toMatchObject({ currency: 'USD', nativeCents: 1_000, paymentCount: 12 });
    expect(assistant.paidNativeCents).toBe(12 * 2_000);
    expect(assistant.averageRateMicro).toBe(
      Math.round((assistant.paidEurCents * 1_000_000) / assistant.paidNativeCents),
    );
    expect(body.foreignFrom).toBe('2025-09-01');
    expect(body.foreignTo).toBe('2026-08-31');
  });

  it('draws the monthly contract cost since the start with markers for price changes', async () => {
    const body = (await get(app, '/reports/spending/contracts')).body;
    expect(body.series[0].month).toBe('2023-10');
    expect(body.series.at(-1).month).toBe('2026-08');
    const markerMonths = body.markers.map((m: any) => m.month);
    expect(markerMonths).toContain('2025-07'); // Internet 55 -> 60 EUR
    expect(markerMonths).toContain('2026-01'); // Strom 95 -> 105 EUR
    expect(markerMonths).toContain('2024-06'); // KI-Assistent starts
    const feb = body.items.find((i: any) => i.name === 'Strom');
    expect(feb.recentIncrease).toMatchObject({ from: '2026-01-01' });
  });
});

describe('2.6 Bank- und Zinskosten on a small ledger', () => {
  let opened: OpenedDatabase;
  let app: Hono;
  const ctx = { actor: 'test' };
  beforeEach(() => {
    opened = createTestDatabase();
    seedBasics(opened.db);
    createEntity(opened.db, schema.categoryGroup, { id: 'bank', name: 'Bank und Gebühren' }, ctx);
    categories.create(
      opened.db,
      { id: 'gebuehr', name: 'Kontoführung', groupId: 'bank', class: 'need', kind: 'fixed' },
      ctx,
    );
    accounts.create(
      opened.db,
      {
        id: 'kredit',
        name: 'Kredit',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: '2023-10-01',
        openingBalanceCents: -1_000_000,
        interestRateBp: 600,
      },
      ctx,
    );
    app = api(opened.db, '2026-09-17');
  });
  afterEach(() => opened.close());

  const charge = (date: string, cents: number) =>
    createBooking(
      opened.db,
      {
        accountId: 'kredit',
        date,
        amountCents: -cents,
        splits: [{ categoryId: 'gebuehr', amountCents: -cents }],
      },
      ctx,
    );

  it('excludes loan opening, disbursement, principal and split transfers; counts only explicit cost splits', async () => {
    for (const [categoryId, payeeId] of [
      ['gebuehr', 'payee-opening-balance'],
      [null, null],
      ['miete', null],
    ] as const)
      createBooking(
        opened.db,
        {
          accountId: 'kredit',
          date: '2026-08-01',
          amountCents: -720_000,
          payeeId,
          splits: [{ categoryId, amountCents: -720_000 }],
        },
        ctx,
      );
    createBooking(
      opened.db,
      {
        accountId: 'kredit',
        date: '2026-08-15',
        amountCents: -10_000,
        splits: [
          { categoryId: 'gebuehr', amountCents: -800 },
          { categoryId: null, amountCents: -9_200 },
        ],
      },
      ctx,
    );
    const body = (await get(app, '/reports/spending/costs')).body;
    expect(body.rows.find((r: any) => r.key === 'interest').cents).toBe(800);
    expect(body.totalCents).toBe(800);
    expect(body.creditLines.find((r: any) => r.id === 'kredit').interest12Cents).toBe(800);
  });

  it('counts interest charges of full months only, never transfers, and bank fees of the group', async () => {
    charge('2026-07-31', 5_000);
    charge('2026-08-31', 4_900);
    charge('2026-09-10', 4_800); // running month: not a full month
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-20',
        amountCents: -690,
        splits: [{ categoryId: 'gebuehr', amountCents: -690 }],
      },
      ctx,
    );
    createTransfer(
      opened.db,
      { fromAccountId: 'giro', toAccountId: 'kredit', date: '2026-08-03', amountCents: 41_200 },
      ctx,
    );
    const { status, body } = await get(app, '/reports/spending/costs');
    expect(status).toBe(200);
    const by = Object.fromEntries(body.rows.map((r: any) => [r.key, r]));
    expect(by.interest.cents).toBe(9_900);
    expect(by.account.cents).toBe(690);
    expect(body.totalCents).toBe(9_900 + 690);
    expect(body.to).toBe('2026-08-31');
    expect(body.rows.reduce((a: number, r: any) => a + r.shareBp, 0)).toBe(10_000);
    expect(body.creditLines.find((l: any) => l.id === 'kredit')).toMatchObject({
      type: 'loan',
      rateBp: 600,
      interest12Cents: 9_900,
    });
  });

  it('reads the loan terms from Konten: installment, fee, kind and term in the scenario', async () => {
    // Without an installment the expected payments (none here) give a payment of 0 that does not cover interest.
    expect((await get(app, '/reports/spending/costs')).body.loan).toMatchObject({
      paymentCents: 0,
      paymentSource: 'contracts',
      belowInterest: true,
    });
    accounts.update(
      opened.db,
      'kredit',
      {
        installmentCents: 30_000,
        interestKind: 'fixed',
        termStart: '2023-10-01',
        termEnd: '2033-10-01',
        originalAmountCents: 1_200_000,
        monthlyFeeCents: 500,
      },
      ctx,
    );
    const body = (await get(app, '/reports/spending/costs')).body;
    expect(body.loan).toMatchObject({
      rateBp: 600,
      paymentCents: 30_000,
      paymentSource: 'terms',
      interestKind: 'fixed',
      belowInterest: false,
    });
    expect(body.loan.plan.base.totalFeeCents).toBeGreaterThan(0);
    expect(body.creditLines.find((l: any) => l.id === 'kredit')).toMatchObject({
      interestKind: 'fixed',
      installmentCents: 30_000,
      termStart: '2023-10-01',
      termEnd: '2033-10-01',
      originalAmountCents: 1_200_000,
    });
  });

  it('shows interest and dividends apart as earnings, not as household income', async () => {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-15',
        amountCents: 4_000,
        splits: [{ categoryId: null, amountCents: 4_000, incomeTypeId: INCOME_TYPES.capital.id }],
      },
      ctx,
    );
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-05',
        amountCents: 300_000,
        splits: [{ categoryId: null, amountCents: 300_000, incomeTypeId: INCOME_TYPES.salary.id }],
      },
      ctx,
    );
    const body = (await get(app, '/reports/spending/costs')).body;
    expect(body.earningsCents).toBe(4_000);
    expect(body.netCents).toBe(4_000 - body.totalCents);
    // The income base of the cost share is the salary alone.
    expect(body.incomeShareBp).toBe(Math.round((body.totalCents * 10_000) / 300_000));
  });

  it('dates current terms separately from the historical report period', async () => {
    const { body } = await get(app, '/reports/spending/costs');
    expect(body).toMatchObject({ asOf: '2026-09-17', to: '2026-08-31' });
  });

  it('includes currently used checking and loan accounts with unknown rates', async () => {
    accounts.create(
      opened.db,
      {
        id: 'unknown-checking',
        name: 'Synthetic negative checking',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-09-01',
        openingBalanceCents: -5_000,
      },
      ctx,
    );
    accounts.create(
      opened.db,
      {
        id: 'unknown-loan',
        name: 'Synthetic loan without rate',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: '2026-08-01',
        openingBalanceCents: -50_000,
      },
      ctx,
    );

    const { body } = await get(app, '/reports/spending/costs');
    expect(body.creditLines.find((line: any) => line.id === 'unknown-checking')).toMatchObject({
      type: 'checking',
      usedCents: 5_000,
      limitCents: null,
      rateBp: null,
    });
    expect(body.creditLines.find((line: any) => line.id === 'unknown-loan')).toMatchObject({
      usedCents: 50_000,
      rateBp: null,
    });
  });

  it('counts nonzero modeled interest months without an FX rate on the valuation date', async () => {
    accounts.create(
      opened.db,
      {
        id: 'usd-loan',
        name: 'Synthetic USD loan',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: '2026-08-01',
        openingBalanceCents: -100_000,
        currency: 'USD',
        originalAmountCents: 100_000,
        termStart: '2026-08-01',
        interestRateBp: 1_200,
        installmentCents: 2_000,
      },
      ctx,
    );
    accounts.create(
      opened.db,
      {
        id: 'usd-zero-rate-loan',
        name: 'Synthetic zero-rate USD loan',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: '2026-08-01',
        openingBalanceCents: -25_000,
        currency: 'USD',
        originalAmountCents: 25_000,
        termStart: '2026-08-01',
        interestRateBp: 0,
        installmentCents: 2_000,
      },
      ctx,
    );
    opened.db
      .insert(schema.fxRate)
      .values({
        currency: 'USD',
        date: '2026-08-16',
        rateMicro: 900_000,
        source: 'synthetic',
      } as never)
      .run();

    const { body } = await get(app, '/reports/spending/costs');
    expect(body.modeledInterestMissingFxPeriods).toBe(1);
    expect(body.creditLines.find((line: any) => line.id === 'usd-zero-rate-loan')?.rateBp).toBe(0);
    expect(
      body.monthly.find((month: any) => month.month === '2026-08')?.parts.modeledInterest,
    ).toBe(0);
  });

  it('is empty and calm without a loan, and the fund costs have their own request', async () => {
    const body = (await get(app, '/reports/spending/costs')).body;
    expect(body.loan).not.toBeNull();
    const empty = createTestDatabase();
    const answer = (await get(api(empty.db, '2026-09-17'), '/reports/spending/costs')).body;
    expect(answer).toMatchObject({ totalCents: 0, rows: expect.any(Array), loan: null, years: [] });
    const fund = (await get(app, '/reports/spending/costs/fund')).body;
    expect(fund).toEqual({ fundCosts: null, unavailable: false });
    empty.close();
  });
});

describe('2.6 Bank- und Zinskosten on the sample ledger', () => {
  let db: Db;
  let app: Hono;
  beforeAll(() => {
    db = createTestDatabase().db;
    seedDatabase(db);
    app = api(db, '2026-09-17');
  }, 60_000);

  it('interest is exactly what is booked on the loan in the last twelve full months', async () => {
    const body = (await get(app, '/reports/spending/costs')).body;
    const booked = db
      .select()
      .from(schema.booking)
      .all()
      .filter(
        (b) =>
          b.accountId === 'acc-kredit' &&
          b.deletedAt === null &&
          b.transferId === null &&
          b.amountCents < 0 &&
          b.date >= '2025-09-01' &&
          b.date <= '2026-08-31',
      )
      .reduce((a, b) => a - b.amountCents, 0);
    expect(body.rows.find((r: any) => r.key === 'interest').cents).toBe(booked);
    expect(body.rows.find((r: any) => r.key === 'account').cents).toBe(12 * 690);
    expect(body.rows.reduce((a: number, r: any) => a + r.cents, 0)).toBe(body.totalCents);
    expect(body.netCents).toBe(body.earningsCents - body.totalCents);
    expect(body.months).toHaveLength(12);
    expect(body.previousMonths).toHaveLength(12);
    expect(body.years.map((y: any) => [y.year, y.months])).toEqual([
      [2023, 3],
      [2024, 12],
      [2025, 12],
      [2026, 8],
    ]);
    const yearSum = body.years.reduce((a: number, y: any) => a + y.totalCents, 0);
    const monthSum = body.rows.reduce((a: number, r: any) => a + r.cents, 0);
    expect(yearSum).toBeGreaterThanOrEqual(monthSum);
  }, 60_000);

  it('projects the single loan with and without the planned extra repayment', async () => {
    const body = (await get(app, '/reports/spending/costs')).body;
    expect(body.loanCount).toBe(1);
    expect(body.loan).toMatchObject({
      accountId: 'acc-kredit',
      rateBp: 632,
      paymentCents: 41_200,
      extraCents: 30_000,
      belowInterest: false,
    });
    const plan = body.loan.plan;
    expect(plan.interestSavedCents).toBe(
      plan.base.totalInterestCents - plan.withExtra.totalInterestCents,
    );
    expect(plan.monthsEarlier).toBeGreaterThan(0);
    expect(body.creditLines.map((l: any) => l.id)).toEqual(['acc-giro', 'acc-karte', 'acc-kredit']);
  }, 60_000);

  it('fund costs come from the shared portfolio summary and stay out of the sums', async () => {
    const fund = (await get(app, '/reports/spending/costs/fund')).body;
    const summary = portfolioSummary(db, { today: '2026-09-17', period: '1J' });
    expect(fund.unavailable).toBe(false);
    expect(fund.fundCosts).toMatchObject({
      terCents: summary.costs.terCents,
      feesCents: summary.costs.feesCents,
    });
    const body = (await get(app, '/reports/spending/costs')).body;
    expect(body.rows.map((r: any) => r.key)).not.toContain('ter');
  }, 60_000);
});

describe('2.4 Persönliche Inflation', () => {
  let db: Db;
  let app: Hono;
  beforeAll(() => {
    db = createTestDatabase().db;
    seedDatabase(db);
    app = api(db, '2026-09-17');
  });

  it('indexes the fixed contracts with their stored prices and attributes the change', async () => {
    const body = (await get(app, '/reports/spending/inflation')).body;
    expect(body).toMatchObject({
      status: 'ok',
      baseMonth: '2023-10',
      fromMonth: '2025-08',
      toMonth: '2026-08',
      // The synthetic consumer price series of the seed runs through the last full month.
      referenceAvailable: true,
    });
    expect(body.reference).toMatchObject({ series: 'fixture', lastMonth: '2026-08' });
    expect(body.latestComparison.month).toBe('2026-08');
    expect(body.latestComparison.differenceBp).toBe(
      body.latestComparison.ownBp - body.latestComparison.referenceBp,
    );
    const last = body.monthly.at(-1);
    expect(last.month).toBe('2026-08');
    expect(body.monthly.every((m: any) => m.referenceBp !== null)).toBe(true);
    // With the series running through the window, the headline compares the window itself.
    expect(body.referenceBp).not.toBeNull();
    expect(body.differenceBp).toBe(body.inflationBp - body.referenceBp);
    const years = Object.fromEntries(body.years.map((y: any) => [y.year, y]));
    expect(years[2025]).toMatchObject({ ownMonths: 12, referenceMonths: 12 });
    expect(years[2025].ownChangeBp).not.toBeNull();
    expect(years[2025].referenceChangeBp).not.toBeNull();
    expect(years[2026]).toMatchObject({
      ownMonths: 8,
      referenceMonths: 8,
      throughMonth: '2026-08',
    });
    // Only need-class contracts enter automatically; want subscriptions require Always.
    expect(body.derivedContracts.map((c: any) => c.name).sort()).toEqual(['Mobilfunk']);
    expect(body.basket.every((c: any) => c.class === 'need')).toBe(true);
    expect(body.points[0].index).toBe(100);
    const by = Object.fromEntries(body.contributions.map((c: any) => [c.name, c]));
    // Strom 95 -> 105 EUR in January 2026; Internet was raised before the window starts.
    expect(by['Strom'].changeBp).toBe(Math.round((10_500 / 9_500 - 1) * 10_000));
    expect(by['Internet'].changeBp).toBe(0);
    expect(by['Miete'].changeBp).toBe(0);
    expect(body.contributions[0].name).toBe('Strom');
    // The index uses the weights of the first year, the attribution those of the year before the
    // window (as in the prototype): they differ a little, never by a different story.
    expect(Math.abs(body.contributionSumBp - body.inflationBp)).toBeLessThanOrEqual(25);
    expect(Math.sign(body.contributionSumBp)).toBe(Math.sign(body.inflationBp));
    expect(body.coverageBp).toBeGreaterThan(0);
    expect(body.coverageBp).toBeLessThan(10_000);
    expect(body.excludedCategories).toBeGreaterThan(5);
  }, 60_000);

  it('derives the price history of a contract from its matched bookings', async () => {
    const small = createTestDatabase();
    seedBasics(small.db);
    const ctx = { actor: 'test' };
    categories.create(
      small.db,
      { id: 'wohnen', name: 'Wohnen', groupId: 'g', class: 'need', kind: 'fixed' },
      ctx,
    );
    categories.create(
      small.db,
      { id: 'strom', name: 'Strom', groupId: 'g', class: 'need', kind: 'fixed' },
      ctx,
    );
    const asOf = '2026-09-17';
    const pay = (id: string, categoryId: string, versions: string[]) => {
      createExpectedPayment(
        small.db,
        { id, name: id, kind: 'outflow', rhythm: 'monthly', dueDay: 3, categoryId },
        { validFrom: versions[0] as string, amountCents: 1_000 },
        ctx,
        asOf,
      );
      for (const [i, from] of versions.slice(1).entries())
        addExpectedVersion(small.db, id, { validFrom: from, amountCents: 1_100 + i }, ctx, asOf);
    };
    // Wohnen: one stored version only; Strom: a stored history that must win.
    pay('miete-vertrag', 'wohnen', ['2023-10-01']);
    pay('strom-vertrag', 'strom', ['2023-10-01', '2025-01-01']);
    const charge = (id: string, category: string, date: string, cents: number) => {
      const b = createBooking(
        small.db,
        {
          accountId: 'giro',
          date,
          amountCents: cents,
          splits: [{ categoryId: category, amountCents: cents }],
        },
        ctx,
      );
      small.db
        .insert(schema.expectedOccurrence)
        .values({
          id: `${id}-${date}`,
          expectedPaymentId: id,
          dueDate: date,
          expectedAmountCents: cents,
          status: 'received',
          bookingId: b,
        })
        .onConflictDoUpdate({
          target: [schema.expectedOccurrence.expectedPaymentId, schema.expectedOccurrence.dueDate],
          set: { status: 'received', bookingId: b },
        })
        .run();
    };
    for (let i = 0; i < 35; i++) {
      const date = `${2023 + Math.floor((i + 9) / 12)}-${String(((i + 9) % 12) + 1).padStart(2, '0')}-03`;
      // 500 EUR, 550 EUR from February 2026 on, one 800 EUR outlier in November 2025.
      const cents = date >= '2026-02' ? -55_000 : date.startsWith('2025-11') ? -80_000 : -50_000;
      charge('miete-vertrag', 'wohnen', date, cents);
      charge('strom-vertrag', 'strom', date, -9_000 - (i % 2));
    }
    const body = (await get(api(small.db, asOf), '/reports/spending/inflation')).body;
    expect(body.status).toBe('ok');
    expect(body.derivedContracts).toEqual([
      {
        id: 'miete-vertrag',
        name: 'miete-vertrag',
        source: 'bookings',
        prices: [
          { validFrom: '2023-10-03', amountCents: 50_000, currency: 'EUR' },
          { validFrom: '2026-02-03', amountCents: 55_000, currency: 'EUR' },
        ],
      },
    ]);
    const by = Object.fromEntries(body.contributions.map((c: any) => [c.name, c]));
    expect(by['Wohnen'].changeBp).toBe(1_000);
    small.close();
  });

  it('derives the history of an imported contract from the bookings of its payee and category', async () => {
    const small = createTestDatabase();
    seedBasics(small.db);
    const ctx = { actor: 'test' };
    categories.create(
      small.db,
      { id: 'handy', name: 'Handy', groupId: 'g', class: 'need', kind: 'fixed' },
      ctx,
    );
    // An account opened the day before the first spending month: its month holds no prices.
    accounts.create(
      small.db,
      {
        id: 'alt',
        name: 'Altkonto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2023-09-30',
        openingBalanceCents: 10_000,
      },
      ctx,
    );
    const asOf = '2026-09-17';
    // Imported contract: starts in the future, no occurrence is linked to a past booking.
    createExpectedPayment(
      small.db,
      {
        id: 'handy-vertrag',
        name: 'Handyvertrag',
        kind: 'outflow',
        rhythm: 'monthly',
        dueDay: 20,
        categoryId: 'handy',
        payeeId: 'p1',
        startDate: '2026-10-01',
      },
      { validFrom: '2026-10-01', amountCents: 3_300 },
      ctx,
      asOf,
    );
    for (let i = 0; i < 35; i++) {
      const date = `${2023 + Math.floor((i + 9) / 12)}-${String(((i + 9) % 12) + 1).padStart(2, '0')}-20`;
      const phone = date >= '2026-01' ? 3_300 : 3_000;
      // The phone share is a split of a mixed booking: only that split is the price.
      createBooking(
        small.db,
        {
          accountId: 'giro',
          date,
          payeeId: 'p1',
          amountCents: -(phone + 1_200),
          splits: [
            { categoryId: 'handy', amountCents: -phone },
            { categoryId: 'essen', amountCents: -1_200 },
          ],
        },
        ctx,
      );
    }
    // Same payee, other category only: never part of the contract.
    createBooking(
      small.db,
      {
        accountId: 'giro',
        date: '2026-06-05',
        payeeId: 'p1',
        amountCents: -99_900,
        splits: [{ categoryId: 'essen', amountCents: -99_900 }],
      },
      ctx,
    );
    const body = (await get(api(small.db, asOf), '/reports/spending/inflation')).body;
    expect(body.derivedContracts).toEqual([
      {
        id: 'handy-vertrag',
        name: 'Handyvertrag',
        source: 'bookings',
        prices: [
          { validFrom: '2023-10-20', amountCents: 3_000, currency: 'EUR' },
          { validFrom: '2026-01-20', amountCents: 3_300, currency: 'EUR' },
        ],
      },
    ]);
    expect(body.insufficientReason).toBeNull();
    expect(body.status).toBe('ok');
    expect(body.baseMonth).toBe('2023-10');
    const by = Object.fromEntries(body.contributions.map((c: any) => [c.name, c]));
    // The raise falls inside the window, so the whole 10 % is the price change of the basket.
    expect(by['Handy'].changeBp).toBe(1_000);
    small.close();
  });

  it('says why there is no own index and still shows the stored consumer price index alone', async () => {
    const small = createTestDatabase();
    seedBasics(small.db);
    const asOf = '2026-09-17';
    // A long enough ledger but no contract with a price version: nothing to put in the basket.
    const none = (await get(api(small.db, asOf), '/reports/spending/inflation')).body;
    expect(none).toMatchObject({
      status: 'insufficient',
      insufficientReason: 'basket',
      referenceAvailable: false,
      referenceLatest: null,
    });
    storeCpi(
      small.db,
      'vpi',
      [
        { month: '2025-08', indexMicro: 120_000_000 },
        { month: '2026-08', indexMicro: 123_600_000 },
      ],
      '2026-09-01T00:00:00.000Z',
    );
    const withIndex = (await get(api(small.db, asOf), '/reports/spending/inflation')).body;
    expect(withIndex).toMatchObject({
      status: 'insufficient',
      insufficientReason: 'basket',
      referenceAvailable: true,
      referenceLatest: { month: '2026-08', changeBp: 300 },
    });
    small.close();
  });

  it('says "insufficient" for a short ledger and never writes', async () => {
    const short = createTestDatabase();
    seedBasics(short.db);
    const body = (await get(api(short.db, '2024-03-10'), '/reports/spending/inflation')).body;
    expect(body.status).toBe('insufficient');
    expect(body.points).toEqual([]);
    expect(body.referenceAvailable).toBe(false);
    expect(body.reference).toBeNull();
    expect(body.insufficientReason).toBe('months');
    expect(body.referenceLatest).toBeNull();
    const before = short.sqlite.prepare('select count(*) n from audit_log').get() as { n: number };
    await get(api(short.db, '2026-09-17'), '/reports/spending/inflation');
    const after = short.sqlite.prepare('select count(*) n from audit_log').get() as { n: number };
    expect(after.n).toBe(before.n);
    short.close();
  });
});
