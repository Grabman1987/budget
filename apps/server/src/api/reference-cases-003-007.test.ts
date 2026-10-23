import { createTestDatabase, schema, type planMonthViews, type portfolioSummary } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const directory = mkdtempSync(join(tmpdir(), 'budget-public-509-'));
writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Synthetic reference</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  app = createApp({
    webDir: directory,
    auth: signedIn,
    ledger: { db: opened.db, today: () => '2026-10-02' },
  });
});
afterEach(() => opened.close());
afterAll(() => rmSync(directory, { recursive: true, force: true }));

type Account = { id: string; balanceCents: number };
type Booking = {
  id: string;
  accountId: string;
  amountCents: number;
  status: string;
  splits: { categoryId: string | null; amountCents: number; incomeTypeId: string | null }[];
};
type Mutation = { groupId: string };
type CreatedBooking = Mutation & { id: string };
type Transfer = Mutation & { bookings: Booking[] };
type Budget = ReturnType<typeof planMonthViews>[string];
type Portfolio = ReturnType<typeof portfolioSummary>;
async function request<T>(method: string, path: string, body?: unknown, status = 200): Promise<T> {
  const response = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(status);
  return result as T;
}
async function account(name: string, openingBalanceCents: number, type = 'checking') {
  return (
    await request<{ account: Account }>(
      'POST',
      '/accounts',
      { name, type, openingDate: '2026-08-01', openingBalanceCents },
      201,
    )
  ).account;
}
async function categories() {
  const { group } = await request<{ group: { id: string } }>(
    'POST',
    '/categories/groups',
    { name: 'Synthetic reference group' },
    201,
  );
  const ids: string[] = [];
  for (const name of ['Synthetic A', 'Synthetic B', 'Synthetic C'])
    ids.push(
      (
        await request<{ category: { id: string } }>(
          'POST',
          '/categories',
          { name, groupId: group.id, class: 'need' },
          201,
        )
      ).category.id,
    );
  return { group: group.id, ids };
}
const balance = async (id: string) =>
  (await request<{ account: Account }>('GET', `/accounts/${id}`)).account.balanceCents;
const booking = async (id: string) =>
  (await request<{ booking: Booking }>('GET', `/bookings/${id}`)).booking;
const months = async () =>
  (
    await request<{ months: Record<string, Budget> }>(
      'GET',
      '/budget/months?months=2026-09,2026-10',
    )
  ).months;
const reverse = (groupId: string) => request<Mutation>('POST', '/undo', { groupId });
const raw = () =>
  Object.fromEntries(
    ['booking', 'booking_split', 'transfer', 'audit_log'].map((table) => [
      table,
      opened.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
    ]),
  );
async function card(foodAssigned: number, opening: number, reserveAssigned: number, carry = false) {
  const cash = await account('Synthetic cash', 100_000);
  const credit = await account('Synthetic card', opening, 'credit_card');
  const { group, ids } = await categories();
  if (carry) await request('PATCH', `/categories/${ids[0]}`, { rolloverOverspending: true });
  const { category: reserve } = await request<{ category: { id: string } }>(
    'POST',
    '/categories',
    {
      name: 'Synthetic payment reserve',
      groupId: group,
      kind: 'card_payment',
      cardAccountId: credit.id,
    },
    201,
  );
  await request('PUT', '/budget/2026-09/assigned', {
    items: [
      { categoryId: ids[0], assignedCents: foodAssigned },
      { categoryId: reserve.id, assignedCents: reserveAssigned },
    ],
  });
  return { cash: cash.id, card: credit.id, food: ids[0]!, reserve: reserve.id };
}
function envelope(view: Budget, id: string) {
  return view.summary.envelopes.find((row) => row.categoryId === id)!;
}

describe('WP-001 public reference API evidence', () => {
  it.each([
    {
      assigned: 2_000,
      available: 0,
      reserve: 12_000,
      credit: 0,
      free: 88_000,
      cash: 88_000,
      debt: 0,
    },
    {
      assigned: 1_000,
      available: -1_000,
      reserve: 11_000,
      credit: 1_000,
      free: 89_000,
      cash: 89_000,
      debt: -1_000,
    },
  ])(
    'CASE-003 funded=$assigned preserves reserve, exact payment and BOTH-leg undo through real API',
    async (e) => {
      const ids = await card(e.assigned, -10_000, 10_000);
      const initial = await months();
      const expense = await request<CreatedBooking>(
        'POST',
        '/bookings',
        {
          type: 'booking',
          accountId: ids.card,
          date: '2026-09-15',
          amountCents: -2_000,
          status: 'confirmed',
          categoryId: ids.food,
        },
        201,
      );
      const spent = await months(),
        september = spent['2026-09']!,
        october = spent['2026-10']!;
      expect(await balance(ids.cash)).toBe(100_000);
      expect(await balance(ids.card)).toBe(-12_000);
      expect(envelope(september, ids.food)).toMatchObject({
        activityCents: -2_000,
        availableCents: e.available,
        fundedCardCents: e.assigned,
        creditOverspentCents: e.credit,
        cashOverspentCents: 0,
      });
      expect(envelope(september, ids.reserve).availableCents).toBe(e.reserve);
      expect(september.summary.cards).toEqual([
        { accountId: ids.card, cardDebtGrowthCents: e.credit },
      ]);
      expect([september.summary.toBeAssignedCents, october.summary.toBeAssignedCents]).toEqual([
        e.free,
        e.free,
      ]);
      expect(envelope(october, ids.food)).toMatchObject({
        carryCents: 0,
        assignedCents: 0,
        activityCents: 0,
        availableCents: 0,
      });
      expect(october.summary.uncoveredCents).toBe(0);
      const paid = await request<Transfer>(
        'POST',
        '/bookings',
        {
          type: 'transfer',
          fromAccountId: ids.cash,
          toAccountId: ids.card,
          date: '2026-09-20',
          amountCents: e.reserve,
          status: 'confirmed',
        },
        201,
      );
      expect(paid.bookings).toHaveLength(2);
      expect(await balance(ids.cash)).toBe(e.cash);
      expect(await balance(ids.card)).toBe(e.debt);
      const paidMonths = await months();
      expect(envelope(paidMonths['2026-09']!, ids.reserve).availableCents).toBe(0);
      expect(envelope(paidMonths['2026-09']!, ids.food).activityCents).toBe(-2_000);
      expect([
        paidMonths['2026-09']!.summary.toBeAssignedCents,
        paidMonths['2026-10']!.summary.toBeAssignedCents,
      ]).toEqual([e.free, e.free]);
      await reverse(paid.groupId);
      for (const leg of paid.bookings) await request('GET', `/bookings/${leg.id}`, undefined, 404);
      expect(await months()).toEqual(spent);
      expect(await balance(ids.cash)).toBe(100_000);
      expect(await balance(ids.card)).toBe(-12_000);
      await reverse(expense.groupId);
      expect(await months()).toEqual(initial);
      expect(await balance(ids.card)).toBe(-10_000);
    },
  );

  it.each([
    { carry: false, reserve: 0, credit: 2_500, cashOverspent: 0, next: 0 },
    { carry: true, reserve: 2_500, credit: 0, cashOverspent: 2_500, next: -2_500 },
  ])('CASE-002 YNAB carry=$carry: card debt never also reduces next-month free cash', async (e) => {
    const ids = await card(0, 0, 0, e.carry),
      initial = await months();
    const expense = await request<CreatedBooking>(
      'POST',
      '/bookings',
      {
        type: 'booking',
        accountId: ids.card,
        date: '2026-09-15',
        amountCents: -2_500,
        categoryId: ids.food,
      },
      201,
    );
    const result = await months(),
      september = result['2026-09']!,
      october = result['2026-10']!;
    expect(await balance(ids.cash)).toBe(100_000);
    expect(await balance(ids.card)).toBe(-2_500);
    expect(september.summary.toBeAssignedCents).toBe(100_000);
    expect(envelope(september, ids.food)).toMatchObject({
      availableCents: -2_500,
      creditOverspentCents: e.credit,
      cashOverspentCents: e.cashOverspent,
    });
    expect(envelope(september, ids.reserve).availableCents).toBe(e.reserve);
    expect(october.summary).toMatchObject({
      toBeAssignedCents: 100_000,
      uncoveredCents: 0,
      creditOverspentCents: 0,
    });
    expect(envelope(october, ids.food)).toMatchObject({
      carryCents: e.next,
      assignedCents: 0,
      activityCents: 0,
      availableCents: e.next,
    });
    await reverse(expense.groupId);
    expect(await months()).toEqual(initial);
    expect(await balance(ids.card)).toBe(0);
  });

  it('CASE-004 validates three ordered signed splits, exact reversal and both undo groups', async () => {
    const cash = await account('Synthetic split account', 100_000),
      { ids } = await categories();
    const initial = await months();
    const lines = [
      { categoryId: ids[0], amountCents: -334 },
      { categoryId: ids[1], amountCents: -333 },
      { categoryId: ids[2], amountCents: -333 },
    ];
    const before = raw();
    await request(
      'POST',
      '/bookings',
      {
        type: 'booking',
        accountId: cash.id,
        date: '2026-09-15',
        amountCents: -1_000,
        splits: lines.slice(0, 2),
      },
      422,
    );
    expect(raw()).toEqual(before);
    const expense = await request<CreatedBooking>(
      'POST',
      '/bookings',
      {
        type: 'booking',
        accountId: cash.id,
        date: '2026-09-15',
        amountCents: -1_000,
        splits: lines,
      },
      201,
    );
    expect((await booking(expense.id)).splits.map((s) => [s.categoryId, s.amountCents])).toEqual([
      [ids[0], -334],
      [ids[1], -333],
      [ids[2], -333],
    ]);
    expect(await balance(cash.id)).toBe(99_000);
    const reversal = await request<CreatedBooking>(
      'POST',
      '/bookings',
      {
        type: 'booking',
        accountId: cash.id,
        date: '2026-09-16',
        amountCents: 1_000,
        splits: [
          { categoryId: ids[0], amountCents: 334 },
          { categoryId: ids[1], amountCents: 333 },
          { categoryId: ids[2], amountCents: 333 },
        ],
      },
      201,
    );
    expect((await booking(reversal.id)).splits.map((s) => s.amountCents)).toEqual([334, 333, 333]);
    expect(await balance(cash.id)).toBe(100_000);
    const net = await months();
    for (const id of ids) expect(envelope(net['2026-09']!, id).activityCents).toBe(0);
    await reverse(reversal.groupId);
    expect(await balance(cash.id)).toBe(99_000);
    expect((await booking(expense.id)).amountCents).toBe(-1_000);
    await reverse(expense.groupId);
    expect(await balance(cash.id)).toBe(100_000);
    expect(await months()).toEqual(initial);
  });

  it('CASE-005 fails after the first INSERT without partial money/audit, then undoes both real legs', async () => {
    const a = await account('Synthetic transfer A', 100_000),
      b = await account('Synthetic transfer B', 25_000);
    const initial = await months(),
      before = raw();
    let firstLegReached = 0;
    opened.sqlite.function('synthetic_first_leg_api_509', () => {
      firstLegReached++;
      return 0;
    });
    opened.sqlite
      .exec(`CREATE TRIGGER synthetic_509_api_first AFTER INSERT ON booking WHEN NEW.account_id = '${a.id}' BEGIN SELECT synthetic_first_leg_api_509(); END;
      CREATE TRIGGER synthetic_509_api_second BEFORE INSERT ON booking WHEN NEW.account_id = '${b.id}' BEGIN SELECT RAISE(ABORT, 'synthetic second transfer leg'); END;`);
    const input = {
      type: 'transfer',
      fromAccountId: a.id,
      toAccountId: b.id,
      date: '2026-09-15',
      amountCents: 20_000,
    };
    expect(await request('POST', '/bookings', input, 422)).toMatchObject({ error: 'constraint' });
    expect(firstLegReached).toBe(1);
    expect(raw()).toEqual(before);
    expect(await balance(a.id)).toBe(100_000);
    expect(await balance(b.id)).toBe(25_000);
    opened.sqlite.exec(
      'DROP TRIGGER synthetic_509_api_first; DROP TRIGGER synthetic_509_api_second;',
    );
    const transfer = await request<Transfer>('POST', '/bookings', input, 201);
    expect(transfer.bookings.map((row) => row.amountCents).sort((x, y) => x - y)).toEqual([
      -20_000, 20_000,
    ]);
    expect(await balance(a.id)).toBe(80_000);
    expect(await balance(b.id)).toBe(45_000);
    const actual = await months();
    expect(actual['2026-09']!.summary).toMatchObject({
      incomeCents: 0,
      activityCents: 0,
      toBeAssignedCents: 125_000,
    });
    const total = await request<{ portfolio: Portfolio }>(
      'GET',
      `/portfolio?view=depot&period=Alles&reference=${a.id},${b.id}`,
    );
    expect(total.portfolio.performance).toMatchObject({
      startValueCents: 125_000,
      endValueCents: 125_000,
      contributionsCents: 0,
      gainCents: 0,
    });
    const single = await request<{ portfolio: Portfolio }>(
      'GET',
      `/portfolio?view=depot&period=Alles&reference=${a.id}`,
    );
    expect(single.portfolio.performance).toMatchObject({
      startValueCents: 100_000,
      endValueCents: 80_000,
      contributionsCents: -20_000,
      gainCents: 0,
    });
    const auditBeforeUndo = opened.db.select().from(schema.auditLog).all();
    await reverse(transfer.groupId);
    for (const leg of transfer.bookings)
      await request('GET', `/bookings/${leg.id}`, undefined, 404);
    expect(await balance(a.id)).toBe(100_000);
    expect(await balance(b.id)).toBe(25_000);
    expect(await months()).toEqual(initial);
    const auditAfterUndo = opened.db.select().from(schema.auditLog).all();
    expect(auditAfterUndo).toEqual(expect.arrayContaining(auditBeforeUndo));
    for (const leg of transfer.bookings)
      expect(auditAfterUndo).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'undo', entityId: leg.id })]),
      );
  });

  async function investment(cash: number) {
    const depot = await account('Synthetic investment cash', cash, 'brokerage');
    const { security } = await request<{ security: { id: string } }>(
      'POST',
      '/securities',
      { name: 'Synthetic reference fund', kind: 'etf', currency: 'EUR' },
      201,
    );
    await request('PUT', `/securities/${security.id}/prices/2026-08-01`, {
      priceMicro: 10_000_000,
    });
    return { depot: depot.id, fund: security.id };
  }
  type Trade = Mutation & { trade: { id: string }; bookingId: string | null };
  it('CASE-006 keeps buy/fee internal, values 19,800 and undoes trade plus settlement', async () => {
    const ids = await investment(20_000);
    const trade = await request<Trade>(
      'POST',
      '/trades',
      {
        accountId: ids.depot,
        securityId: ids.fund,
        date: '2026-09-15',
        kind: 'buy',
        unitsE8: 1_000_000_000,
        amountCents: 10_000,
        feeCents: 200,
      },
      201,
    );
    expect((await booking(trade.bookingId!)).amountCents).toBe(-10_200);
    expect(await balance(ids.depot)).toBe(9_800);
    const total = await request<{ portfolio: Portfolio }>(
      'GET',
      `/portfolio?period=Alles&view=depot&reference=${ids.depot}`,
    );
    expect(total.portfolio.classes.flatMap((c) => c.positions)).toEqual([
      expect.objectContaining({ unitsE8: 1_000_000_000, valueCents: 10_000 }),
    ]);
    expect(total.portfolio.performance).toMatchObject({
      startValueCents: 20_000,
      endValueCents: 19_800,
      contributionsCents: 0,
      gainCents: -200,
    });
    const securities = await request<{ portfolio: Portfolio }>(
      'GET',
      '/portfolio?period=Alles&view=securities',
    );
    expect(securities.portfolio.performance).toMatchObject({
      contributionsCents: 10_200,
      gainCents: -200,
    });
    await reverse(trade.groupId);
    await request('GET', `/trades/${trade.trade.id}`, undefined, 404);
    await request('GET', `/bookings/${trade.bookingId}`, undefined, 404);
    expect(await balance(ids.depot)).toBe(20_000);
  });

  it('CASE-007 books net 700 once and distinguishes included-cash contribution from security payout', async () => {
    const ids = await investment(0);
    await request(
      'POST',
      '/trades',
      {
        accountId: ids.depot,
        securityId: ids.fund,
        date: '2026-08-01',
        kind: 'delivery_in',
        unitsE8: 1_000_000_000,
        amountCents: 10_000,
      },
      201,
    );
    const dividend = await request<Trade>(
      'POST',
      '/trades',
      {
        accountId: ids.depot,
        securityId: ids.fund,
        date: '2026-09-15',
        kind: 'dividend',
        amountCents: 1_000,
        feeCents: 100,
        taxCents: 200,
      },
      201,
    );
    expect(await balance(ids.depot)).toBe(700);
    expect((await booking(dividend.bookingId!)).splits).toEqual([
      expect.objectContaining({ amountCents: 700, incomeTypeId: schema.INCOME_TYPES.capital.id }),
    ]);
    const total = await request<{ portfolio: Portfolio }>(
      'GET',
      `/portfolio?period=1M&view=depot&reference=${ids.depot}`,
    );
    expect(total.portfolio.performance).toMatchObject({
      startValueCents: 10_000,
      endValueCents: 10_700,
      contributionsCents: 0,
      gainCents: 700,
    });
    const securities = await request<{ portfolio: Portfolio }>(
      'GET',
      '/portfolio?period=1M&view=securities',
    );
    expect(securities.portfolio.performance).toMatchObject({
      contributionsCents: -700,
      gainCents: 700,
    });
    const list = () =>
      request<{ items: Booking[]; total: number }>('GET', `/bookings?accountId=${ids.depot}`);
    expect((await list()).items.map((row) => row.id)).toEqual([dividend.bookingId]);
    const undone = await reverse(dividend.groupId);
    expect(await balance(ids.depot)).toBe(0);
    expect((await list()).total).toBe(0);
    await reverse(undone.groupId);
    expect(await balance(ids.depot)).toBe(700);
    expect((await list()).items.map((row) => row.id)).toEqual([dividend.bookingId]);
  });

  it('AC-001-03 excludes pending and later records at statement date, preserves locks and undoes the check', async () => {
    const cash = await account('Synthetic statement account', 100_000);
    const post = (date: string, amountCents: number, status: string) =>
      request<CreatedBooking>(
        'POST',
        '/bookings',
        { type: 'booking', accountId: cash.id, date, amountCents, status },
        201,
      );
    const income = await post('2026-09-01', 20_000, 'confirmed');
    const expense = await post('2026-09-15', -3_000, 'confirmed');
    const pending = await post('2026-09-20', -500, 'pending');
    const later = await post('2026-10-01', -700, 'confirmed');
    const path = `/accounts/${cash.id}/reconciliation`,
      input = { date: '2026-09-30', statementBalanceCents: 117_000 };
    expect(await balance(cash.id)).toBe(115_800);
    const beforePreview = raw();
    expect(await request('POST', `${path}/preview`, input)).toMatchObject({
      preview: {
        bookedBalanceCents: 117_000,
        pendingCents: -500,
        differenceCents: 0,
        toReconcileCount: 2,
      },
    });
    expect(raw()).toEqual(beforePreview);
    const done = await request<{
      result: Mutation & { adjustmentBookingId: null };
      account: Account;
    }>('POST', path, input, 201);
    expect(done.result.adjustmentBookingId).toBeNull();
    expect((await booking(income.id)).status).toBe('reconciled');
    expect((await booking(expense.id)).status).toBe('reconciled');
    expect((await booking(pending.id)).status).toBe('pending');
    expect((await booking(later.id)).status).toBe('confirmed');
    expect(await balance(cash.id)).toBe(115_800);
    const locked = raw();
    expect(
      await request('PATCH', `/bookings/${expense.id}`, { amountCents: -3_001 }, 409),
    ).toMatchObject({ error: 'reconciled_locked' });
    await request('POST', path, { date: '2026-10-03', statementBalanceCents: 115_800 }, 422);
    expect(raw()).toEqual(locked);
    await reverse(done.result.groupId);
    expect((await booking(income.id)).status).toBe('confirmed');
    expect((await booking(expense.id)).status).toBe('confirmed');
    expect((await booking(pending.id)).status).toBe('pending');
    expect((await booking(later.id)).status).toBe('confirmed');
    expect(await balance(cash.id)).toBe(115_800);
    expect(await request('GET', `/accounts/${cash.id}/reconciliations`)).toMatchObject({
      reconciliations: [],
    });
  });
});
