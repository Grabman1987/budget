import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { expectedOccurrence } from '../schema';
import { createBooking, createTransfer } from './bookings';
import { accounts, categories } from './entities';
import { createExpectedPayment, linkOccurrence } from './expected';
import { heute } from './heute';
import { liquidityReportView } from './liquidity-report';
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
  const result = heute(opened.db, { today }).accountLiquidity;
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
  const before = heute(opened.db, { today }).accountLiquidity;
  createTransfer(
    opened.db,
    { fromAccountId: 'second', toAccountId: 'giro', date: today, amountCents: 500 },
    testCtx,
  );
  const after = heute(opened.db, { today }).accountLiquidity;
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
  const result = heute(opened.db, { today }).accountLiquidity;
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
    before.accountLiquidity.withoutExpectedInflows.accounts.find((a) => a.accountId === 'giro')
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
    after.accountLiquidity.withoutExpectedInflows.accounts.find((a) => a.accountId === 'giro'),
  ).toMatchObject({ firstBelowZero: null, nextSafeInflowDay: null });
  expect(
    after.accountLiquidity.withoutExpectedInflows.household.days.map((d) => [
      d.day,
      d.balanceCents,
    ]),
  ).toEqual(
    before.accountLiquidity.withoutExpectedInflows.household.days.map((d) => [
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

it.each([
  ['2026-10-14', '2026-11-14'], // Payday tomorrow (October 15) plus 30 calendar days.
  ['2026-10-15', '2026-11-14'], // Payday today keeps the same inclusive horizon.
  ['2026-10-31', '2026-12-13'], // Month end: November 15 shifts back to Friday 13.
])('uses the literal payday-plus-30 horizon from %s', (asOf, through) => {
  const result = heute(opened.db, { today: asOf }).accountLiquidity;
  expect(result.withoutExpectedInflows.household.days[0]?.day).toBe(asOf);
  expect(result.withoutExpectedInflows.household.days.at(-1)?.day).toBe(through);
  expect(result.withExpectedInflows.household.days.at(-1)?.day).toBe(through);
});
