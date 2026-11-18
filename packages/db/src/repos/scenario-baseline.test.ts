import { applyAssumptions, budgetLiquidityForecast, evaluate } from '@budget/domain';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, expectedOccurrence, plannedEvent } from '../schema';
import { createBooking, createTransfer } from './bookings';
import { accounts, categories } from './entities';
import { createExpectedPayment, linkOccurrence } from './expected';
import { heute } from './heute';
import { forecastInputs, loadFacts } from './rule-inputs';
import { scenarioBaseline } from './scenario-baseline';
import { seedBasics, testCtx } from './test-helpers';

const today = '2026-10-10';
const through = '2026-10-14';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());

it('retains an old persisted obligation on day zero exactly once', () => {
  const { db } = opened;
  createExpectedPayment(
    db,
    {
      id: 'old-open',
      name: 'Synthetic old obligation',
      accountId: 'giro',
      categoryId: 'miete',
      kind: 'outflow',
      rhythm: 'monthly',
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      dueDay: 10,
      dateWindowDays: 3,
    },
    { validFrom: '2026-08-10', amountCents: 123 },
    testCtx,
    '2026-08-10',
  );
  const snapshot = scenarioBaseline(db, today);
  expect(snapshot.items).toHaveLength(1);
  const result = evaluate(applyAssumptions(snapshot, []), { through }).outcomes[0]!;
  expect(result.withExpectedInflows.household.series.map((d) => d.cents)).toEqual([
    99_877, 99_877, 99_877, 99_877, 99_877,
  ]);
  expect(heute(db, { today }).lead.freeCents).toBe(99_877);
  expect(
    forecastInputs(loadFacts(db, today), today, { byAccount: { giro: 100_000 } }).startCents,
  ).toBe(99_877);
});

it('retains both actual linked transfer legs without creating a household obligation', () => {
  const { db } = opened;
  accounts.create(
    db,
    {
      id: 'second',
      name: 'Synthetic second',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 5432,
    },
    testCtx,
  );
  const linked = payment('linked-transfer', today, 1234, 'giro');
  const transfer = createTransfer(
    db,
    { fromAccountId: 'giro', toAccountId: 'second', date: '2026-10-11', amountCents: 1234 },
    testCtx,
  );
  linkOccurrence(db, linked.id, transfer.fromBookingId, testCtx);
  const snapshot = scenarioBaseline(db, today);
  const result = evaluate(applyAssumptions(snapshot, []), { through }).outcomes[0]!;
  expect(result.withExpectedInflows.household.series.map((d) => d.cents)).toEqual([
    105_432, 105_432, 105_432, 105_432, 105_432,
  ]);
  expect(result.withExpectedInflows.accounts.map((a) => a.series.at(-1)?.cents)).toEqual([
    98_766, 6666,
  ]);
  expect(heute(db, { today }).lead.freeCents).toBe(105_432);
});

it('keeps a linked transfer to a reserve account as an external obligation', () => {
  const { db } = opened;
  const linked = payment('reserve-transfer', today, 1234, 'giro');
  const transfer = createTransfer(
    db,
    { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-10-11', amountCents: 1234 },
    testCtx,
  );
  linkOccurrence(db, linked.id, transfer.fromBookingId, testCtx);
  const result = evaluate(scenarioBaseline(db, today), { through }).outcomes[0]!;
  expect(result.withExpectedInflows.household.series.at(-1)?.cents).toBe(98_766);
  expect(heute(db, { today }).lead.freeCents).toBe(98_766);
});

it('does not count the receipt of an already valued reserve transfer in transit twice', () => {
  const { db } = opened;
  accounts.update(db, 'spar', { openingBalanceCents: 5432 }, testCtx);
  const linked = payment('linked-receipt', today, 1234, 'giro', 'inflow');
  const transfer = createTransfer(
    db,
    { fromAccountId: 'spar', toAccountId: 'giro', date: '2026-10-09', amountCents: 1234 },
    testCtx,
    {
      bankLegs: {
        from: { date: '2026-10-09', status: 'confirmed' },
        to: { date: '2026-10-11', status: 'confirmed' },
      },
    },
  );
  linkOccurrence(db, linked.id, transfer.toBookingId, testCtx);
  const result = evaluate(scenarioBaseline(db, today), { through }).outcomes[0]!;
  expect(heute(db, { today }).lead.balanceCents).toBe(101_234);
  expect(result.withExpectedInflows.household.series.map((d) => d.cents)).toEqual([
    101_234, 101_234, 101_234, 101_234, 101_234,
  ]);
});

it('does not reject an unpriced inflow due today that the forecast omits', () => {
  const { db } = opened;
  createExpectedPayment(
    db,
    {
      id: 'fx-today',
      name: 'Synthetic foreign inflow',
      kind: 'inflow',
      accountId: 'giro',
      rhythm: 'monthly',
      startDate: today,
      endDate: today,
      dueDay: 10,
      dateWindowDays: 3,
    },
    { validFrom: today, amountCents: 123, currency: 'USD' },
    testCtx,
    today,
  );
  const result = evaluate(scenarioBaseline(db, today), { through }).outcomes[0]!;
  expect(result.withExpectedInflows.household.series.at(-1)?.cents).toBe(100_000);
});

function payment(
  id: string,
  day: string,
  amountCents: number,
  accountId: string | null,
  kind: 'inflow' | 'outflow' = 'outflow',
  categoryId = 'miete',
) {
  const db = opened.db;
  createExpectedPayment(
    db,
    {
      id,
      name: id,
      accountId,
      kind,
      categoryId: kind === 'outflow' ? categoryId : null,
      rhythm: 'monthly',
      startDate: day,
      endDate: day,
      dueDay: Number(day.slice(8)),
      dateWindowDays: 3,
    },
    { validFrom: '2026-10-01', amountCents },
    testCtx,
    today,
  );
  return db
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.expectedPaymentId, id))
    .get()!;
}

it('replays the same account cash legs and low points as Heute with zero assumptions', () => {
  const db = opened.db;
  accounts.create(
    db,
    {
      id: 'second',
      name: 'Synthetic second',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-10-01',
      openingBalanceCents: 21_000,
      overdraftLimitCents: 50_000,
    },
    testCtx,
  );
  categories.create(
    db,
    { id: 'future', groupId: 'g', name: 'Synthetic future', kind: 'fixed', class: 'future' },
    testCtx,
  );
  const overdue = payment('overdue', '2026-10-09', 1000, 'giro', 'outflow', 'future');
  const linked = payment('linked', today, 2000, 'second');
  const inflow = payment('expected-inflow', '2026-10-12', 5000, 'giro', 'inflow');
  const bookingId = createBooking(
    db,
    {
      accountId: 'second',
      date: '2026-10-11',
      amountCents: -2000,
      splits: [{ categoryId: 'miete', amountCents: -2000 }],
    },
    testCtx,
  );
  linkOccurrence(db, linked.id, bookingId, testCtx);
  db.insert(plannedEvent)
    .values({
      id: 'event',
      name: 'Synthetic planned debit',
      accountId: 'second',
      date: '2026-10-13',
      amountCents: -600,
    })
    .run();

  const snapshot = scenarioBaseline(db, today);
  expect(snapshot.accounts.map((a) => [a.id, a.balanceCents])).toEqual([
    ['giro', 100_000],
    ['second', 21_000],
  ]);
  expect(snapshot.items).toHaveLength(4);
  expect(snapshot.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        accountId: 'giro',
        day: today,
        cents: -1000,
        source: { kind: 'expectedOccurrence', id: overdue.id, dueDay: '2026-10-09' },
      }),
      expect.objectContaining({
        accountId: 'second',
        day: '2026-10-11',
        cents: -2000,
        source: { kind: 'expectedOccurrence', id: linked.id, dueDay: today, bookingId },
      }),
      expect.objectContaining({
        accountId: 'second',
        day: '2026-10-13',
        cents: -600,
        source: { kind: 'plannedEvent', id: 'event', dueDay: '2026-10-13' },
      }),
    ]),
  );

  const outcome = evaluate(applyAssumptions(snapshot, []), { through }).outcomes[0]!;
  const projected = outcome.withExpectedInflows;
  const byAccount = { giro: 100_000, second: 21_000 };
  const inputs = forecastInputs(loadFacts(db, today), today, { byAccount });
  expect(inputs.lastResortCents).toBe(50_000);
  const forecast = budgetLiquidityForecast(inputs, 4);
  expect(projected.household.series).toEqual(
    forecast.days.map(({ day, balanceCents }) => ({ day, cents: balanceCents })),
  );
  expect(projected.household.lowest).toEqual({
    day: forecast.low?.day,
    cents: forecast.low?.cents,
  });
  for (const projectedAccount of projected.accounts) {
    const id = projectedAccount.accountId as keyof typeof byAccount;
    const accountForecast = budgetLiquidityForecast(
      {
        ...inputs,
        startCents:
          byAccount[id] +
          inputs.dayZeroItems
            .filter((item) => item.accountId === id)
            .reduce((sum, item) => sum + item.cents, 0),
        items: inputs.items.filter((item) => item.accountId === id),
      },
      4,
    );
    expect(projectedAccount.series).toEqual(
      accountForecast.days.map(({ day, balanceCents }) => ({ day, cents: balanceCents })),
    );
    expect(projectedAccount.lowest).toEqual(accountForecast.low);
  }
  expect(projected.household.series.map((d) => d.cents)).toEqual([
    120_000, 118_000, 123_000, 122_400, 122_400,
  ]);
  expect(projected.accounts.map((a) => a.series.map((d) => d.cents))).toEqual([
    [99_000, 99_000, 104_000, 104_000, 104_000],
    [21_000, 19_000, 19_000, 18_400, 18_400],
  ]);
  expect(projected.accounts.map((a) => a.lowest)).toEqual([
    { day: today, index: 0, cents: 99_000 },
    { day: '2026-10-13', index: 3, cents: 18_400 },
  ]);
  expect(outcome.expectedInflows).toEqual([
    {
      inflowId: JSON.stringify(['expectedOccurrence', inflow.id, '2026-10-12']),
      accountId: 'giro',
      day: '2026-10-12',
      cents: 5000,
    },
  ]);
  expect(outcome.withoutExpectedInflows.household.series.map((d) => d.cents)).toEqual([
    120_000, 118_000, 118_000, 117_400, 117_400,
  ]);
  const h = heute(db, { today });
  expect(h.lead.balanceCents).toBe(121_000);
  // F6 shares every dated outflow with the lead, including the 600-cent planned event.
  expect(h.lead.freeCents).toBe(117_400);
  expect(h.balance.forecast.filter((d) => d.day <= through).map((d) => d.balanceCents)).toEqual([
    120_000, 118_000, 123_000, 122_400, 122_400,
  ]);
  db.update(account).set({ overdraftLimitCents: 0 }).where(eq(account.id, 'second')).run();
  expect(scenarioBaseline(db, today)).toEqual(snapshot);
});

it('rejects accountless cash legs that would require an invented routing', () => {
  payment('unassigned', '2026-10-11', 1000, null);
  expect(() => scenarioBaseline(opened.db, today)).toThrow('Unassigned forecast account');
});

it('rejects an aggregate variable spending estimate with no account allocation', () => {
  const db = opened.db;
  accounts.create(
    db,
    {
      id: 'second',
      name: 'Synthetic second',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 2000,
    },
    testCtx,
  );
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-09-10',
      amountCents: -300,
      splits: [{ categoryId: 'essen', amountCents: -300 }],
    },
    testCtx,
  );
  expect(() => scenarioBaseline(db, today)).toThrow('no per-account allocation');
});

it('rejects a future link whose booked amount disagrees with the forecast', () => {
  const db = opened.db;
  const linked = payment('linked', today, 2000, 'giro');
  const bookingId = createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-10-11',
      amountCents: -1900,
      splits: [{ categoryId: 'miete', amountCents: -1900 }],
    },
    testCtx,
  );
  linkOccurrence(db, linked.id, bookingId, testCtx);
  expect(() => scenarioBaseline(db, today)).toThrow('Linked booking disagrees with forecast');
});
