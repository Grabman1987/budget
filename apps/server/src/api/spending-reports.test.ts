/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  allocationMonth,
  budget,
  categories,
  createBooking,
  createExpectedPayment,
  ruleInputs,
  createTestDatabase,
  INCOME_TYPES,
  schema,
  setAssigned,
  type Db,
  type OpenedDatabase,
} from '@budget/db';
import { allocation, fixedCostRatio } from '@budget/domain';
import { referenceModel } from '@budget/fixtures';
import { seedDatabase } from '@budget/fixtures/seed';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

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
    expect(Math.abs(year.consumptionCents - Math.round(expected * 100))).toBeLessThanOrEqual(30);
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
    // The shared default (R01) is untouched and still counts them.
    expect(allocationMonth(opened.db, '2026-08').incomeCents).toBe(307_000);
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

  it('keeps the prototype class amounts of the shared allocation; only the income base differs', async () => {
    const body = (await get(app, '/reports/spending/adherence?month=2026-08')).body;
    expect(body.allocation).toHaveLength(12);
    const august = body.allocation.at(-1);
    expect(august.month).toBe('2026-08');
    expect(august).toMatchObject({ needCents: 310103, wantCents: 192865, futureCents: 150888 });
    const excluded = db
      .select()
      .from(schema.bookingSplit)
      .innerJoin(schema.booking, eq(schema.booking.id, schema.bookingSplit.bookingId))
      .all()
      .filter(
        (r) =>
          r.booking.date.startsWith('2026-08') &&
          (r.booking_split.incomeTypeId === INCOME_TYPES.capital.id ||
            r.booking_split.incomeTypeId === INCOME_TYPES.refund.id) &&
          r.booking_split.amountCents > 0,
      )
      .reduce((a, r) => a + r.booking_split.amountCents, 0);
    expect(excluded).toBeGreaterThan(0);
    const shared = allocation([allocationMonth(db, '2026-08')]);
    expect(Math.abs(shared.incomeCents - excluded - august.incomeCents)).toBeLessThanOrEqual(1);
    for (const row of body.allocation) {
      const s = row.shares;
      expect(s.need + s.want + s.future + s.rest, row.month).toBe(100);
    }
  });

  it('lists the plan of August 2026 in a chain that adds up and a rolling 12-month deviation', async () => {
    const body = (await get(app, '/reports/spending/adherence?month=2026-08')).body;
    expect(body.planCents - body.istCents).toBe(body.restCents);
    expect(body.items.length).toBeGreaterThan(10);
    expect(body.deviation.from).toBe('2025-09-01');
    expect(body.deviation.to).toBe('2026-08-31');
    for (const row of body.deviation.rows) expect(row.planCents).toBeGreaterThan(0);
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
