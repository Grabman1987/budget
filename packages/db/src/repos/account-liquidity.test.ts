import {
  accountLiquidityForecast,
  evaluateRule,
  evaluate,
  daysBetween,
  addDays,
} from '@budget/domain';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { expectedOccurrence, expectedPayment } from '../schema';
import { createBooking, createTransfer } from './bookings';
import { accounts, categories } from './entities';
import { createExpectedPayment, linkOccurrence } from './expected';
import { heute } from './heute';
import { liquidityReportView } from './liquidity-report';
import { forecastInputs, loadFacts, forecastBudgetValues, ruleInputs } from './rule-inputs';
import { scenarioBaseline } from './scenario-baseline';
import { seedBasics, testCtx } from './test-helpers';

const today = '2026-10-10';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  accounts.update(
    opened.db,
    'giro',
    { openingBalanceCents: 1000, overdraftLimitCents: 5000 },
    testCtx,
  );
  accounts.create(
    opened.db,
    {
      id: 'second',
      name: 'Zweitkonto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 10_000,
    },
    testCtx,
  );
});
afterEach(() => opened.close());

it('leaves the per-account forecast unavailable without payment accounts', () => {
  accounts.update(opened.db, 'giro', { type: 'credit_card' }, testCtx);
  accounts.update(opened.db, 'second', { type: 'credit_card' }, testCtx);
  expect(heute(opened.db, { today }).accountLiquidity).toBeNull();
  const view = liquidityReportView(opened.db, today, { horizon: '35d', levers: [] });
  expect(view.accountLiquidity).toBeNull();
  // The wider legacy household report is kept intact; no payment-account zero path is invented.
  expect(view.available).toBe(true);
});

function payment(
  id: string,
  day: string,
  cents: number,
  accountId: string | null,
  kind: 'outflow' | 'inflow' = 'outflow',
  categoryId = 'miete',
) {
  createExpectedPayment(
    opened.db,
    {
      id,
      name: id,
      accountId,
      categoryId: kind === 'outflow' ? categoryId : null,
      kind,
      rhythm: 'monthly',
      startDate: day,
      endDate: day,
      dueDay: Number(day.slice(8)),
      dateWindowDays: 3,
    },
    { validFrom: today, amountCents: cents },
    testCtx,
    today,
  );
  return opened.db
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.expectedPaymentId, id))
    .get()!;
}

it('exposes one account shortfall despite positive household cash, income and overdraft', () => {
  payment('Erwarteter Eingang', '2026-10-11', 2000, 'giro', 'inflow');
  payment('Abbuchung', '2026-10-12', 1500, 'giro');
  const result = heute(opened.db, { today }).accountLiquidity!;
  // 1,000 - 1,500 = -500; household 11,000 - 1,500 = 9,500.
  expect(result.withoutExpectedInflows.accounts.find((a) => a.accountId === 'giro')).toMatchObject({
    firstBelowZero: { day: '2026-10-12', cents: -500 },
    low: { day: '2026-10-12', cents: -500 },
  });
  expect(result.withoutExpectedInflows.household.low?.cents).toBe(9500);
  expect(result.withExpectedInflows.accounts.find((a) => a.accountId === 'giro')?.low?.cents).toBe(
    1000,
  );
  const report = liquidityReportView(opened.db, today, { horizon: '35d', levers: [] });
  expect(report.accountLiquidity).toEqual(result);
  expect(report.lastResortCents).toBe(5000);
});

it('a prepared own-account transfer changes account cash and leaves household cash unchanged', () => {
  payment('Abbuchung', '2026-10-12', 1500, 'giro');
  const before = heute(opened.db, { today }).accountLiquidity!;
  createTransfer(
    opened.db,
    { fromAccountId: 'second', toAccountId: 'giro', date: today, amountCents: 500 },
    testCtx,
  );
  const after = heute(opened.db, { today }).accountLiquidity!;
  expect(
    after.withoutExpectedInflows.accounts.find((a) => a.accountId === 'giro')?.firstBelowZero,
  ).toBeNull();
  // 1,500 - 1,500 = 0, funded by the other account's 500-cent decrease.
  expect(after.withoutExpectedInflows.household.days).toEqual(
    before.withoutExpectedInflows.household.days,
  );
});

it('counts a future linked booking once and reconciles every daily path including unassigned cash', () => {
  const occurrence = payment('Verknüpft', '2026-10-11', 1500, 'giro');
  const booked = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-12',
      amountCents: -1500,
      splits: [{ categoryId: 'miete', amountCents: -1500 }],
    },
    testCtx,
  );
  linkOccurrence(opened.db, occurrence.id, booked, testCtx);
  payment('Ohne Konto', '2026-10-13', 300, null);
  categories.update(opened.db, 'reise', { class: 'future' }, testCtx);
  payment('Zukunftszahlung', '2026-10-14', 200, 'second', 'outflow', 'reise');
  const result = heute(opened.db, { today }).accountLiquidity!;
  expect(result.unassignedPayments).toMatchObject([
    { label: 'Ohne Konto', day: '2026-10-13', cents: -300 },
  ]);
  for (const variant of [result.withExpectedInflows, result.withoutExpectedInflows]) {
    for (const [index, day] of variant.household.days.entries()) {
      expect(
        variant.accounts.reduce((sum, a) => sum + a.days[index]!.balanceCents, 0) +
          variant.unassigned.days[index]!.balanceCents,
      ).toBe(day.balanceCents);
    }
    // 11,000 - 1,500 - 300 - 200 = 9,000. Linked booking and occurrence are one debit.
    expect(variant.household.days.at(-1)?.balanceCents).toBe(9000);
    expect(variant.accounts.find((a) => a.accountId === 'giro')?.low?.cents).toBe(-500);
    expect(variant.accounts.find((a) => a.accountId === 'second')?.low?.cents).toBe(9800);
  }
});

it('includes unrelated future bookings and a future own transfer without inventing income', () => {
  const { db } = opened;
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-10-12',
      amountCents: -1500,
      splits: [{ categoryId: 'miete', amountCents: -1500 }],
    },
    testCtx,
  );
  const before = heute(db, { today });
  // Standalone future cash is forecast evidence; the existing lead selection stays unchanged.
  expect(before.lead.openCents).toBe(0);
  expect(
    before.accountLiquidity!.withoutExpectedInflows.accounts.find((a) => a.accountId === 'giro')
      ?.firstBelowZero?.day,
  ).toBe('2026-10-12');
  createTransfer(
    db,
    { fromAccountId: 'second', toAccountId: 'giro', date: '2026-10-11', amountCents: 500 },
    testCtx,
  );
  const after = heute(db, { today });
  // Future transfer: Giro 1,000 + 500 - 1,500 = 0, second account 10,000 - 500 = 9,500.
  expect(
    after.accountLiquidity!.withoutExpectedInflows.accounts.find((a) => a.accountId === 'giro'),
  ).toMatchObject({ firstBelowZero: null, nextSafeInflowDay: null });
  expect(
    after.accountLiquidity!.withoutExpectedInflows.household.days.map((d) => [
      d.day,
      d.balanceCents,
    ]),
  ).toEqual(
    before.accountLiquidity!.withoutExpectedInflows.household.days.map((d) => [
      d.day,
      d.balanceCents,
    ]),
  );
  expect(after.lead.freeCents).toBe(before.lead.freeCents);
});

it('marks account liquidity incomplete rather than omitting an unpriced payment', () => {
  createExpectedPayment(
    opened.db,
    {
      id: 'foreign-payment',
      name: 'Synthetic foreign obligation',
      accountId: 'giro',
      categoryId: 'miete',
      kind: 'outflow',
      rhythm: 'monthly',
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      dueDay: 12,
      dateWindowDays: 3,
    },
    { validFrom: today, amountCents: 123, currency: 'USD' },
    testCtx,
    today,
  );
  expect(heute(opened.db, { today }).accountLiquidity).toMatchObject({
    incomplete: true,
    missingFx: [{ paymentId: 'foreign-payment', dueDate: '2026-10-12', currency: 'USD' }],
  });
});

it('keeps a credit card in legacy household cash but never treats it as a payment account', () => {
  accounts.create(
    opened.db,
    {
      id: 'card',
      name: 'Testkarte',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 0,
    },
    testCtx,
  );
  createBooking(
    opened.db,
    {
      accountId: 'card',
      date: '2026-10-12',
      amountCents: -1234,
      splits: [{ categoryId: 'miete', amountCents: -1234 }],
    },
    testCtx,
  );
  const result = heute(opened.db, { today }).accountLiquidity!.withoutExpectedInflows;
  // Card purchase: card -1,234, bank unchanged 1,000; legacy household 11,000 - 1,234 = 9,766.
  expect(result.accounts.find((a) => a.accountId === 'card')).toMatchObject({
    paymentAccount: false,
    low: { cents: -1234 },
  });
  expect(result.accounts.find((a) => a.accountId === 'giro')).toMatchObject({
    paymentAccount: true,
    low: { cents: 1000 },
  });
  expect(result.household.low.cents).toBe(9766);
  const baseline = scenarioBaseline(opened.db, today);
  const outcome = evaluate(baseline, { through: '2026-10-14' }).outcomes[0]!;
  expect(
    outcome.withoutExpectedInflows.accounts.find((a) => a.accountId === 'card')?.paymentAccount,
  ).toBe(false);
  expect(outcome.withoutExpectedInflows.firstBelowZero).toEqual([]);
});

it('shares literal daily cents between Heute, report, R07 and scenario baseline', () => {
  payment('Need', '2026-10-11', 1200, 'giro');
  payment('Forecast', '2026-10-12', 2000, 'giro', 'inflow');
  const result = heute(opened.db, { today }).accountLiquidity!;
  const report = liquidityReportView(opened.db, today, { horizon: '35d', levers: [] });
  expect(report.accountLiquidity).toEqual(result);
  const snapshot = scenarioBaseline(opened.db, today);
  const through = result.withoutExpectedInflows.household.days.at(-1)!.day;
  const scenario = evaluate(snapshot, { through }).outcomes[0]!;
  for (const name of ['withoutExpectedInflows', 'withExpectedInflows'] as const) {
    const path = result[name];
    for (const [index, row] of path.household.days.entries()) {
      // Start 11,000; day 1 subtracts 1,200; day 2 adds 2,000 only in the forecast.
      const expected =
        index === 0 ? 11000 : name === 'withExpectedInflows' && index >= 2 ? 11800 : 9800;
      expect(row.balanceCents).toBe(expected);
      expect(
        path.accounts.reduce((sum, a) => sum + a.days[index]!.balanceCents, 0) +
          path.unassigned.days[index]!.balanceCents,
      ).toBe(expected);
      expect(scenario[name].household.series[index]!.cents).toBe(expected);
    }
  }
  expect(evaluateRule('R07', {}, ruleInputs(opened.db, today))).toMatchObject({
    status: 'ok',
    detail: { lowCents: 9800 },
  });
});

it('retains unassigned cash separately on every day and excludes ineligible source accounts', () => {
  payment('Unassigned', '2026-10-12', 123, null);
  accounts.update(opened.db, 'second', { closedAt: today }, testCtx);
  accounts.update(opened.db, 'spar', { openingBalanceCents: 50000 }, testCtx);
  accounts.create(
    opened.db,
    {
      id: 'future-account',
      name: 'Test Zukunft',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-10-11',
      openingBalanceCents: 9999,
    },
    testCtx,
  );
  accounts.create(
    opened.db,
    {
      id: 'loan-account',
      name: 'Test Kredit',
      type: 'loan',
      role: 'debt',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: -9999,
    },
    testCtx,
  );
  const path = heute(opened.db, { today }).accountLiquidity!.withoutExpectedInflows;
  expect(path.accounts.map((a) => a.accountId)).toEqual(['giro']);
  for (const [index, row] of path.household.days.entries()) {
    // Only open EUR budget cash: 1,000; unassigned 123 leaves 877 from October 12.
    expect(row.balanceCents).toBe(index < 2 ? 1000 : 877);
    expect(
      path.accounts[0]!.days[index]!.balanceCents + path.unassigned.days[index]!.balanceCents,
    ).toBe(row.balanceCents);
  }
});

it('charges the bank only on the card settlement day and keeps the transfer neutral in total', () => {
  accounts.create(
    opened.db,
    {
      id: 'card',
      name: 'Testkarte',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
    },
    testCtx,
  );
  createBooking(
    opened.db,
    {
      accountId: 'card',
      date: '2026-10-11',
      amountCents: -1234,
      splits: [{ categoryId: 'miete', amountCents: -1234 }],
    },
    testCtx,
  );
  createTransfer(
    opened.db,
    { fromAccountId: 'giro', toAccountId: 'card', date: '2026-10-13', amountCents: 1234 },
    testCtx,
  );
  const path = heute(opened.db, { today }).accountLiquidity!.withoutExpectedInflows;
  // Card purchase leaves bank at 1,000; settlement debits 1,234 on the 13th, leaving -234.
  expect(
    path.accounts
      .find((a) => a.accountId === 'giro')!
      .days.slice(0, 5)
      .map((d) => d.balanceCents),
  ).toEqual([1000, 1000, 1000, -234, -234]);
  // Household loses only the purchase: 11,000 - 1,234 = 9,766; settlement nets to zero.
  expect(path.household.days.slice(0, 5).map((d) => d.balanceCents)).toEqual([
    11000, 9766, 9766, 9766, 9766,
  ]);
});

it('loads ten account paths in a bounded statement count and performs no per-day reads', () => {
  for (let index = 0; index < 8; index++)
    accounts.create(
      opened.db,
      {
        id: `cash-${index}`,
        name: `Testkonto ${index}`,
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
        openingBalanceCents: 100,
      },
      testCtx,
    );
  const facts = loadFacts(opened.db, today);
  const byAccount = forecastBudgetValues(
    opened.db,
    today,
    facts.accounts.map((a) => a.id),
  );
  const prepare = vi.spyOn(opened.sqlite, 'prepare');
  const input = forecastInputs(facts, today, { byAccount });
  const statementCount = prepare.mock.calls.length;
  const result = accountLiquidityForecast(input.accountLiquidity, 60);
  expect(result.withoutExpectedInflows.accounts).toHaveLength(10);
  expect(result.withoutExpectedInflows.household.days).toHaveLength(61);
  expect(prepare.mock.calls.length).toBe(statementCount);
  expect(statementCount).toBeLessThanOrEqual(12);
  expect(daysBetween(today, result.withoutExpectedInflows.household.days.at(-1)!.day)).toBe(60);
  prepare.mockRestore();
});

it.each([
  ['2026-10-14', '2026-11-14'], // Payday tomorrow (October 15) plus 30 calendar days.
  ['2026-10-15', '2026-11-14'], // Payday today keeps the same inclusive horizon.
  ['2026-10-31', '2026-12-13'], // Month end: November 15 shifts back to Friday 13.
  ['2028-02-14', '2028-03-16'], // Leap February: 30 calendar days after February 15.
  ['2028-02-29', '2028-04-14'], // Leap day: next payday March 15 plus 30 days.
])('uses the literal payday-plus-30 horizon from %s', (asOf, through) => {
  payment('Boundary', through, 100, 'giro');
  payment('Outside boundary', addDays(through!, 1), 200, 'giro');
  const result = heute(opened.db, { today: asOf }).accountLiquidity!;
  expect(result.withoutExpectedInflows.household.days[0]?.day).toBe(asOf);
  expect(result.withoutExpectedInflows.household.days.at(-1)?.day).toBe(through);
  expect(result.withExpectedInflows.household.days.at(-1)?.day).toBe(through);
  // Inclusive last-day debit 100 counts; the next-day debit 200 does not: 11,000 - 100 = 10,900.
  expect(result.withoutExpectedInflows.household.days.at(-1)?.balanceCents).toBe(10900);
});

// Alert bounds are separate from the full-horizon table and household R07 forecast.
it.each([
  ['after salary', '2026-10-15', '2026-10-16', false],
  ['before salary', '2026-10-15', '2026-10-14', true],
  ['salary today', today, '2026-10-11', false],
  ['salary tomorrow', '2026-10-11', today, true],
])('bounds the account alert: %s', (_label, payday, debitDay, alerts) => {
  payment('Salary', payday!, 2000, 'giro', 'inflow');
  // An open-ended monthly payment is recurring; helper defaults to a one-date schedule.
  opened.db
    .update(expectedPayment)
    .set({ endDate: null })
    .where(eq(expectedPayment.id, 'Salary'))
    .run();
  payment('Debit', debitDay!, 1500, 'giro');
  const result = heute(opened.db, { today }).accountLiquidity!;
  const account = result.withoutExpectedInflows.accounts.find((a) => a.accountId === 'giro')!;
  // Known cash 1,000 - 1,500 = -500. Salary 2,000 is never available in this path.
  // Debit after/on payday is outside the alert window, yet remains in the full table.
  expect(account).toMatchObject({
    name: 'Giro',
    nextSafeInflowDay: payday,
    low: { cents: -500 },
  });
  expect((account.lowBeforeSafeInflow?.cents ?? 0) < 0).toBe(alerts);
  if (payday === today) {
    expect(account.lowBeforeSafeInflow).toBeNull();
    // Forecast only: 1,000 + 2,000 today - 1,500 tomorrow = 1,500 at its low.
    expect(result.withExpectedInflows.accounts.find((a) => a.accountId === 'giro')!.low.cents).toBe(
      1500,
    );
    // Scenario snapshots keep their pre-existing day-zero obligation convention.
    expect(() => scenarioBaseline(opened.db, today)).not.toThrow();
  }
  if (alerts) expect(account.firstBelowZero).toMatchObject({ day: debitDay, cents: -500 });
});

it('does not bound the alert by one-off income and alerts on another account without income', () => {
  payment('One-off', '2026-10-11', 2000, 'giro', 'inflow');
  payment('Debit', '2026-10-12', 1500, 'giro');
  payment('Second debit', '2026-10-13', 10_100, 'second');
  const result = heute(opened.db, { today }).accountLiquidity!;
  // Giro 1,000 - 1,500 = -500 despite the one-off expected 2,000.
  // Second 10,000 - 10,100 = -100; no receipt bounds its horizon.
  for (const [id, day, cents] of [
    ['giro', '2026-10-12', -500],
    ['second', '2026-10-13', -100],
  ] as const) {
    expect(result.withoutExpectedInflows.accounts.find((a) => a.accountId === id)).toMatchObject({
      nextSafeInflowDay: null,
      firstBelowZero: { day, cents },
      lowBeforeSafeInflow: { day, cents },
    });
  }
});

it('treats a finite schedule with only one due date as one-off even with unequal bounds', () => {
  payment('Finite receipt', '2026-10-11', 2000, 'giro', 'inflow');
  opened.db
    .update(expectedPayment)
    .set({ startDate: '2026-10-01', endDate: '2026-10-20' })
    .where(eq(expectedPayment.id, 'Finite receipt'))
    .run();
  payment('Debit', '2026-10-12', 1500, 'giro');
  // Only October 11 is scheduled; 1,000 - 1,500 = -500 still raises the alert.
  expect(
    heute(opened.db, { today }).accountLiquidity!.withoutExpectedInflows.accounts.find(
      (a) => a.accountId === 'giro',
    ),
  ).toMatchObject({ nextSafeInflowDay: null, lowBeforeSafeInflow: { cents: -500 } });
});

it('retains standalone future bookings in account and scenario forecasts without changing R07', () => {
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-11',
      amountCents: -1500,
      splits: [{ categoryId: 'miete', amountCents: -1500 }],
    },
    testCtx,
  );
  const account = heute(opened.db, {
    today,
  }).accountLiquidity!.withoutExpectedInflows.accounts.find((a) => a.accountId === 'giro')!;
  // Account: 1,000 - 1,500 = -500. Household scenario: 11,000 - 1,500 = 9,500.
  expect(account.low).toMatchObject({ day: '2026-10-11', cents: -500 });
  const scenario = evaluate(scenarioBaseline(opened.db, today), { through: '2026-10-12' })
    .outcomes[0]!;
  expect(scenario.withoutExpectedInflows.household.series.map((row) => row.cents)).toEqual([
    11000, 9500, 9500,
  ]);
  expect(evaluateRule('R07', {}, ruleInputs(opened.db, today))).toMatchObject({
    status: 'ok',
    detail: { lowCents: 11000 },
  });
});
