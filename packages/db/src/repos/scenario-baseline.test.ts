import { applyAssumptions, budgetLiquidityForecast, evaluate } from '@budget/domain';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, expectedOccurrence, plannedEvent } from '../schema';
import { createBooking } from './bookings';
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
  expect(h.lead.freeCents).toBe(118_000);
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
