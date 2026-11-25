import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { expectedOccurrence } from '../schema';
import { createBooking, createTransfer } from './bookings';
import { assignMany } from './budget';
import { accounts, categories } from './entities';
import { createExpectedPayment, linkOccurrence, updateExpectedPayment } from './expected';
import { heute, investableAmountAsOf } from './heute';
import { forecastInputs, healthBudgetInputs, loadFacts } from './rule-inputs';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());

it('rounds a negative annual-income half cent through the shared exact policy', () => {
  const facts = loadFacts(opened.db, '2026-10-14');
  facts.allocByMonth.set('2026-09', { items: [], incomeCents: 1000, annualIncomeCents: -6 });
  expect(healthBudgetInputs(facts, '2026-10-14').flows.at(-1)?.incomeCents).toBe(999);
});

it.each(['2026-08-10', '2026-10-14', '2026-10-15'])(
  'does not invent free cash when the obligation on %s lacks an exchange rate',
  (day) => {
    const { db } = opened;
    createExpectedPayment(
      db,
      {
        id: 'fx-obligation',
        name: 'Synthetic foreign obligation',
        accountId: 'giro',
        categoryId: 'miete',
        kind: 'outflow',
        rhythm: 'monthly',
        startDate: day,
        endDate: day,
        dueDay: Number(day.slice(8)),
        dateWindowDays: 3,
      },
      { validFrom: day, amountCents: 123, currency: 'USD' },
      testCtx,
      day,
    );
    expect(investableAmountAsOf(db, '2026-10-14')).toMatchObject({
      unavailable: { reason: 'missing_fx', asOf: '2026-10-14' },
    });
  },
);

it('uses the Heute cash and forecast outflows, extends the window and excludes credit and expected income', () => {
  const { db } = opened;
  const today = '2026-10-14';
  categories.create(
    db,
    { id: 'future', groupId: 'g', name: 'Synthetic future', class: 'future' },
    testCtx,
  );
  accounts.create(
    db,
    {
      id: 'excluded',
      name: 'Synthetic excluded',
      type: 'checking',
      role: 'budget',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: 43_333,
    },
    testCtx,
  );
  const payment = (
    id: string,
    day: string,
    amountCents: number,
    categoryId: string | null,
    accountId = 'giro',
  ) =>
    createExpectedPayment(
      db,
      {
        id,
        name: id,
        accountId,
        categoryId,
        kind: categoryId ? 'outflow' : 'inflow',
        rhythm: 'monthly',
        startDate: day,
        endDate: day,
        dueDay: Number(day.slice(8)),
        dateWindowDays: 3,
      },
      { validFrom: day, amountCents },
      testCtx,
      day,
    );

  payment('old-open', '2026-08-10', 123, 'miete');
  payment('future-class', today, 234, 'future');
  payment('linked', today, 345, 'reise');
  payment('payday', '2026-10-15', 456, 'auslagen');
  payment('last-day', '2026-11-14', 567, 'reise');
  payment('too-late', '2026-11-15', 678, 'miete');
  payment('other-account', today, 789, 'miete', 'excluded');
  const occurrence = db
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.expectedPaymentId, 'linked'))
    .get()!;
  const linked = createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-10-16',
      amountCents: -350,
      splits: [{ categoryId: 'reise', amountCents: -350 }],
    },
    testCtx,
  );
  linkOccurrence(db, occurrence.id, linked, testCtx);

  assignMany(
    db,
    '2026-10',
    [
      { categoryId: 'miete', assignedCents: 1111 },
      { categoryId: 'reise', assignedCents: 888 },
      { categoryId: 'future', assignedCents: 999 },
    ],
    testCtx,
  );
  const result = investableAmountAsOf(db, today);
  expect(result).toEqual({
    payday: '2026-10-15',
    through: '2026-11-14',
    cashCents: 100_000,
    obligationsCents: 1730,
    committedReservesCents: 999,
    needWantAvailableCents: 1649,
    rawCents: 95_622,
    investableCents: 95_622,
  });
  const { lead, stand } = heute(db, { today, period: 'payday' });
  const inputs = forecastInputs(loadFacts(db, today), today, { byAccount: { giro: 100_000 } });
  expect(lead.balanceCents).toBe(100_000);
  expect(lead.balanceCents).toBe(stand.budgetBalanceCents);
  expect(lead.items.accounts).toEqual(inputs.cashAccounts);
  expect(lead.openCents).toBe(357);
  expect(lead.items.open).toEqual(
    inputs.openOutflows.filter((item) => item.day < stand.payday.day),
  );
  expect(
    inputs.openOutflows.filter((item) => item.day <= '2026-11-14').map((item) => item.cents),
  ).toEqual([123, 234, 456, 350, 567]);

  updateExpectedPayment(db, 'old-open', { dueDay: 12 }, testCtx, today);
  expect(investableAmountAsOf(db, today)).toEqual(result);
  accounts.update(db, 'giro', { overdraftLimitCents: 39_999 }, testCtx);
  payment('expected-income', today, 80_000, null);
  expect(investableAmountAsOf(db, today)).toEqual(result);
  expect(heute(db, { today }).lead.lastResortCents).toBe(39_999);
});

it('counts a transfer in transit between two budget accounts once across the debit and receipt days', () => {
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
  const transfer = createTransfer(
    db,
    {
      fromAccountId: 'giro',
      toAccountId: 'second',
      date: '2026-10-12',
      amountCents: 1234,
    },
    testCtx,
    {
      bankLegs: {
        from: { date: '2026-10-12', status: 'confirmed' },
        to: { date: '2026-10-14', status: 'confirmed' },
      },
    },
  );
  createExpectedPayment(
    db,
    {
      id: 'linked-transfer',
      name: 'Synthetic linked transfer',
      accountId: 'giro',
      kind: 'outflow',
      rhythm: 'monthly',
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      dueDay: 12,
      dateWindowDays: 3,
    },
    { validFrom: '2026-10-12', amountCents: 1234 },
    testCtx,
    '2026-10-11',
  );
  const occurrence = db
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.expectedPaymentId, 'linked-transfer'))
    .get()!;
  linkOccurrence(db, occurrence.id, transfer.fromBookingId, testCtx);
  for (const today of ['2026-10-11', '2026-10-13', '2026-10-14']) {
    expect(heute(db, { today }).lead.balanceCents).toBe(105_432);
    expect(investableAmountAsOf(db, today)).toMatchObject({
      cashCents: 105_432,
      obligationsCents: 0,
      investableCents: 105_432,
    });
  }
});

it('uses the stored emergency target and nets overlapping reserve money outside Heute cash', () => {
  const { db, sqlite } = opened;
  sqlite
    .prepare('INSERT INTO rule(id,code,name,params_json) VALUES(?,?,?,?)')
    .run('synthetic-r02', 'R02', 'Synthetic reserve rule', '{"targetMonths":3}');
  categories.create(
    db,
    { id: 'future', groupId: 'g', name: 'Synthetic future', class: 'future' },
    testCtx,
  );
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-09-10',
      amountCents: -12000,
      splits: [{ categoryId: 'miete', amountCents: -12000 }],
    },
    testCtx,
  );
  accounts.create(
    db,
    {
      id: 'off-reserve',
      name: 'Synthetic off-budget reserve',
      type: 'savings',
      role: 'reserve',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: 2000,
    },
    testCtx,
  );
  assignMany(db, '2026-10', [{ categoryId: 'future', assignedCents: 4000 }], testCtx);
  expect(investableAmountAsOf(db, '2026-10-14')).toMatchObject({
    cashCents: 88000,
    committedReservesCents: 5000,
    investableCents: 83000,
  });
  accounts.update(db, 'spar', { openingBalanceCents: 5000 }, testCtx);
  expect(investableAmountAsOf(db, '2026-10-14')).toMatchObject({
    cashCents: 88000,
    committedReservesCents: 0,
    investableCents: 88000,
  });
});
