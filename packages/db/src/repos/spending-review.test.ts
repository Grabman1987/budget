import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  buildTableRows,
  incomeExpenseRows,
  incomeExpenseSources,
  monthHouseholdIncome,
} from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { INCOME_TYPES, categoryGroup, expectedOccurrence, security, trade } from '../schema';
import { accounts, categories, createEntity } from './entities';
import { createBooking } from './bookings';
import { incomeExpenseReport, reportTables } from './report-tables';
import { monthOnePager, monthFlowReport } from './month-reports';
import { allocationMonth } from './allocation';
import { bankCostsReport } from './bank-costs-report';
import { contractsReport } from './contracts-report';
import { createExpectedPayment } from './expected';
import { ruleInputs } from './rule-inputs';
import { matchedCharges } from './contract-history';
import { inflationReport } from './inflation-report';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
const today = '2026-09-17';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());

it('shares household income and category spending including depot transfers; discloses unassigned flows', () => {
  accounts.create(
    opened.db,
    {
      id: 'depot',
      name: 'Synthetic depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2023-10-01',
    },
    ctx,
  );
  categories.create(
    opened.db,
    { id: 'future', name: 'Synthetic future', groupId: 'g', class: 'future', kind: 'invest' },
    ctx,
  );
  for (const [amountCents, incomeTypeId] of [
    [100_000, INCOME_TYPES.salary.id],
    [2_000, INCOME_TYPES.capital.id],
    [3_000, INCOME_TYPES.refund.id],
    [4_000, undefined],
  ] as const)
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-03',
        amountCents,
        splits: [{ amountCents, incomeTypeId: incomeTypeId ?? null }],
      },
      ctx,
    );
  const transfer = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-08-05',
      amountCents: -10_000,
      splits: [{ amountCents: -10_000, categoryId: 'future', transferAccountId: 'depot' }],
    },
    ctx,
  );
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-08-06',
      amountCents: -20_000,
      splits: [{ amountCents: -20_000, categoryId: 'essen' }],
    },
    ctx,
  );
  createBooking(
    opened.db,
    { accountId: 'giro', date: '2026-08-07', amountCents: -500, splits: [{ amountCents: -500 }] },
    ctx,
  );
  const tables = reportTables(opened.db, { today });
  const report = incomeExpenseReport(opened.db, today);
  const month = tables.months.find((m) => m.month === '2026-08')!;
  const rows = incomeExpenseRows(
    report.months.filter((m) => m.month === '2026-08'),
    report,
    new Set(['g']),
  );
  const overview = buildTableRows([month], tables, true);
  expect(monthHouseholdIncome(month, tables)).toBe(100_000);
  expect(rows.find((r) => r.key === 'inc')?.vals).toEqual([100_000]);
  expect(monthOnePager(opened.db, today, '2026-08').result.earnedCents).toBe(100_000);
  expect(monthFlowReport(opened.db, today, '2026-08', 'month').flow.earnedCents).toBe(100_000);
  expect(allocationMonth(opened.db, '2026-08').incomeCents).toBe(100_000);
  expect(month.spending['future']).toBe(10_000);
  expect(rows.find((r) => r.key === 'cat:future')?.vals).toEqual([10_000]);
  expect(
    incomeExpenseSources(report.splits, report, 'cat:future', ['2026-08']).map((s) => s.bookingId),
  ).toEqual([transfer]);
  expect(rows.find((r) => r.label === 'Ohne Kategorie')?.vals).toEqual([500]);
  expect(rows.find((r) => r.key === 'net')?.vals).toEqual([69_500]);
  // 1.8 rest is already after Zukunft: 1.10 net = 1.8 rest - uncategorised spending.
  expect(overview.find((r) => r.key === 'rest')?.vals).toEqual([70_000]);
  for (const list of [overview, rows])
    expect(
      list.find((r) => r.label === 'Zuflüsse ohne Einkommensart (nicht gezählt)')?.vals,
    ).toEqual([4_000]);
});

function payment(
  id: string,
  categoryId: string,
  startDate: string,
  endDate: string | null,
  amountCents = 10_000,
) {
  return createExpectedPayment(
    opened.db,
    {
      id,
      name: 'Synthetic contract',
      kind: 'outflow',
      categoryId,
      rhythm: 'monthly',
      dueDay: 3,
      startDate,
      endDate,
    },
    { validFrom: startDate, amountCents },
    ctx,
    today,
  );
}
function bankCategory() {
  createEntity(opened.db, categoryGroup, { id: 'bank', name: 'Bank und Gebühren' }, ctx);
  categories.create(
    opened.db,
    { id: 'interest', name: 'Kreditzinsen', groupId: 'bank', class: 'need', kind: 'fixed' },
    ctx,
  );
}

it('future-ended contracts bind identically in 2.3/R10 and supply the loan payment; ended history remains', () => {
  accounts.create(
    opened.db,
    {
      id: 'loan',
      name: 'Synthetic loan',
      type: 'loan',
      role: 'debt',
      onBudget: false,
      openingDate: '2023-10-01',
      openingBalanceCents: -100_000,
      interestRateBp: 1_200,
    },
    ctx,
  );
  categories.create(
    opened.db,
    {
      id: 'minimum',
      name: 'Synthetic minimum',
      groupId: 'g',
      class: 'need',
      kind: 'debt',
      stage: 1,
    },
    ctx,
  );
  categories.create(
    opened.db,
    { id: 'fixed', name: 'Synthetic fixed', groupId: 'g', class: 'need', kind: 'fixed' },
    ctx,
  );
  payment('minimum', 'minimum', '2025-01-01', '2027-01-31');
  payment('ended', 'fixed', '2025-01-01', '2026-08-05', 2_000);
  payment('once', 'fixed', '2026-09-01', '2026-09-30', 50_000);
  const r = contractsReport(opened.db, today);
  expect(r.items.map((i) => i.id)).toEqual(['minimum']);
  expect(r.fixedMonthlyCents).toBe(10_000);
  expect(ruleInputs(opened.db, today).fixedCosts).toEqual({
    fixedMonthlyCents: 10_000,
    periodicAnnualCents: 0,
  });
  expect(r.series.find((p) => p.month === '2026-08')?.fixedMonthlyCents).toBe(12_000);
  expect(bankCostsReport(opened.db, today).loan).toMatchObject({
    paymentCents: 10_000,
    belowInterest: false,
  });
});

it('discloses each unconverted foreign booking once without adding native cents to costs or earnings', () => {
  bankCategory();
  createBooking(
    opened.db,
    {
      accountId: 'usd',
      date: '2026-08-03',
      amountCents: -100,
      splits: [
        { amountCents: -60, categoryId: 'interest' },
        { amountCents: -40, categoryId: 'interest' },
      ],
    },
    ctx,
  );
  createBooking(
    opened.db,
    {
      accountId: 'usd',
      date: '2026-08-04',
      amountCents: 200,
      splits: [{ amountCents: 200, incomeTypeId: INCOME_TYPES.capital.id }],
    },
    ctx,
  );
  expect(bankCostsReport(opened.db, today)).toMatchObject({
    skippedForeignBookings: 2,
    totalCents: 0,
    earningsCents: 0,
  });
});

it('checking-account loan interest suppresses modelled interest for that month; estimates stay labelled', () => {
  bankCategory();
  accounts.create(
    opened.db,
    {
      id: 'loan',
      name: 'Synthetic loan',
      type: 'loan',
      role: 'debt',
      onBudget: false,
      openingDate: '2026-07-01',
      originalAmountCents: 120_000,
      termStart: '2026-07-01',
      interestRateBp: 1_200,
      installmentCents: 10_000,
    },
    ctx,
  );
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-08-03',
      amountCents: -800,
      splits: [{ amountCents: -800, categoryId: 'interest' }],
    },
    ctx,
  );
  const r = bankCostsReport(opened.db, today);
  expect(r.monthly.find((m) => m.month === '2026-08')?.parts).toMatchObject({
    interest: 800,
    modeledInterest: 0,
  });
  expect(r.rows.find((p) => p.key === 'modeledInterest')).toMatchObject({
    name: 'Kreditzinsen · aus Konditionen geschätzt',
    cents: 1_200,
  });
  expect(r.totalCents).toBe(2_000);
  expect(r.sources.reduce((sum, p) => sum + p.cents, 0)).toBe(2_000);
});

it('an unlinked capital booking and its dividend settlement count once; different amounts remain separate', () => {
  createEntity(
    opened.db,
    security,
    { id: 'instrument', name: 'Synthetic instrument', kind: 'etf' },
    ctx,
  );
  createEntity(
    opened.db,
    trade,
    {
      id: 'dividend',
      securityId: 'instrument',
      accountId: 'giro',
      date: '2026-08-03',
      kind: 'dividend',
      amountCents: 2_000,
      feeCents: 100,
      taxCents: 300,
    },
    ctx,
  );
  for (const amountCents of [1_600, 900])
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-03',
        amountCents,
        splits: [{ amountCents, incomeTypeId: INCOME_TYPES.capital.id }],
      },
      ctx,
    );
  expect(bankCostsReport(opened.db, today)).toMatchObject({
    totalCents: 100,
    earningsCents: 2_600,
    netCents: 2_500,
  });
});

it.each([null, 'p1'])(
  'inflation attributes matched booking ids once for shared payee %s',
  (payeeId) => {
    categories.create(
      opened.db,
      {
        id: 'fixed',
        name: 'Synthetic fixed',
        groupId: 'g',
        class: 'need',
        kind: 'fixed',
        inflationTrailingMean: false,
      },
      ctx,
    );
    const months = [
      '2023-10',
      '2023-11',
      '2023-12',
      '2024-01',
      '2024-02',
      '2024-03',
      '2024-04',
      '2024-05',
      '2024-06',
      '2024-07',
      '2024-08',
      '2024-09',
      '2024-10',
    ];
    for (const [id, amountCents, dueDay] of [
      ['a', 1_000, 3],
      ['b', 3_000, 10],
    ] as const) {
      createExpectedPayment(
        opened.db,
        {
          id,
          name: `Synthetic ${id}`,
          categoryId: 'fixed',
          payeeId,
          kind: 'outflow',
          rhythm: 'monthly',
          dueDay,
          startDate: '2023-10-01',
        },
        { validFrom: '2023-10-01', amountCents },
        ctx,
        today,
      );
      for (const month of months) {
        const date = `${month}-${String(dueDay).padStart(2, '0')}`;
        const bookingId = createBooking(
          opened.db,
          {
            accountId: 'giro',
            date,
            payeeId,
            amountCents: -amountCents,
            splits: [{ amountCents: -amountCents, categoryId: 'fixed' }],
          },
          ctx,
        );
        createEntity(
          opened.db,
          expectedOccurrence,
          {
            expectedPaymentId: id,
            dueDate: date,
            status: 'received',
            bookingId,
            expectedAmountCents: amountCents,
          },
          ctx,
        );
      }
    }
    for (const month of months)
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date: `${month}-20`,
          payeeId,
          amountCents: -1_000,
          splits: [{ amountCents: -1_000, categoryId: 'fixed' }],
        },
        ctx,
      );
    const r = inflationReport(opened.db, '2024-11-17');
    expect(r.basket.map((b) => b.shareBp)).toEqual([2_500, 7_500]);
    expect(r.coverageBp).toBe(8_000);
  },
);

it('foreign contract refunds are not payments', () => {
  categories.create(
    opened.db,
    { id: 'fixed', name: 'Synthetic fixed', groupId: 'g', class: 'need', kind: 'fixed' },
    ctx,
  );
  createExpectedPayment(
    opened.db,
    {
      name: 'Synthetic foreign',
      kind: 'outflow',
      categoryId: 'fixed',
      rhythm: 'monthly',
      dueDay: 3,
      startDate: '2025-01-01',
    },
    { validFrom: '2025-01-01', amountCents: 1_000, currency: 'USD' },
    ctx,
    today,
  );
  for (const amountCents of [-1_000, 500])
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-03',
        amountCents,
        originalCurrency: 'USD',
        originalAmountCents: amountCents,
        fxRateMicro: 1_000_000,
        splits: [{ amountCents, categoryId: 'fixed' }],
      },
      ctx,
    );
  expect(contractsReport(opened.db, today).foreign[0]).toMatchObject({
    paymentCount: 1,
    paidEurCents: 1_000,
    paidNativeCents: 1_000,
  });
});

it('ambiguous unlinked schedules never each claim the same payee spending', () => {
  categories.create(
    opened.db,
    { id: 'fixed', name: 'Synthetic fixed', groupId: 'g', class: 'need', kind: 'fixed' },
    ctx,
  );
  for (const id of ['a', 'b'])
    createExpectedPayment(
      opened.db,
      {
        id,
        name: `Synthetic ${id}`,
        categoryId: 'fixed',
        payeeId: 'p1',
        kind: 'outflow',
        rhythm: 'monthly',
        dueDay: 3,
        startDate: '2025-01-01',
      },
      { validFrom: '2025-01-01', amountCents: 1_000 },
      ctx,
      today,
    );
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      payeeId: 'p1',
      date: '2026-08-03',
      amountCents: -1_000,
      splits: [{ amountCents: -1_000, categoryId: 'fixed' }],
    },
    ctx,
  );
  expect(matchedCharges(opened.db, 'a', 'EUR')).toEqual([]);
  expect(matchedCharges(opened.db, 'b', 'EUR')).toEqual([]);
});
