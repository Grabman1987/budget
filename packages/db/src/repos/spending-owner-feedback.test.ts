import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { monthsBetween, incomeExpenseRows } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  category,
  categoryGroup,
  payee,
  security,
  trade,
  savingsPlan,
  INCOME_TYPES,
} from '../schema';
import { createEntity, accounts, categories } from './entities';
import { updateCategory } from './categories';
import { undo } from './audit';
import { createBooking, createTransfer } from './bookings';
import { createExpectedPayment } from './expected';
import { contractsReport } from './contracts-report';
import { inflationReport } from './inflation-report';
import { bankCostsReport } from './bank-costs-report';
import { incomeExpenseReport } from './report-tables';
import { readPaymentsPreview } from './payments-preview';
import { goalsReport, createGoal } from './goals';
import { seedBasics, testCtx as ctx } from './test-helpers';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const today = '2026-09-17';
function charge(
  date: string,
  categoryId: string,
  amountCents: number,
  payeeId = 'p1',
  accountId = 'giro',
) {
  return createBooking(
    opened.db,
    { accountId, date, payeeId, amountCents, splits: [{ categoryId, amountCents }] },
    ctx,
  );
}
function fixed(id: string) {
  categories.create(opened.db, { id, name: id, groupId: 'g', class: 'need', kind: 'fixed' }, ctx);
}

describe('synthetic owner report read models', () => {
  it('derived contract history keeps current schedule price, finds sustained rises, excludes end-dated payments', () => {
    fixed('phone');
    createExpectedPayment(
      opened.db,
      {
        id: 'phone-contract',
        name: 'Phone',
        kind: 'outflow',
        categoryId: 'phone',
        payeeId: 'p1',
        rhythm: 'monthly',
        dueDay: 20,
        startDate: '2026-10-01',
      },
      { validFrom: '2026-10-01', amountCents: 1_500 },
      ctx,
      today,
    );
    createExpectedPayment(
      opened.db,
      {
        name: 'One fee',
        kind: 'outflow',
        categoryId: 'phone',
        rhythm: 'monthly',
        dueDay: 20,
        startDate: '2026-09-20',
        endDate: '2026-09-20',
      },
      { validFrom: '2026-09-01', amountCents: 20_000 },
      ctx,
      today,
    );
    for (const m of monthsBetween('2025-01', '2026-08'))
      charge(`${m}-20`, 'phone', m < '2026-01' ? -1_000 : -1_500);
    const r = contractsReport(opened.db, today);
    expect(r.items).toHaveLength(1);
    expect(r.boundMonthlyCents).toBe(1_500);
    expect(r.items[0]?.recentIncrease?.changeBp).toBe(5_000);
    expect(r.series.at(-1)?.fixedMonthlyCents).toBe(1_500);
    expect(r.series.find((p) => p.month === '2025-01')?.fixedMonthlyCents).toBe(1_000);
    expect(r.derivedContracts).toContain('phone-contract');
  });
  it('implicit rent history remains in the basket through a successor and later price change', () => {
    fixed('rent');
    createEntity(opened.db, payee, { id: 'p2', name: 'Synthetic manager B' }, ctx);
    const months = monthsBetween('2023-10', '2026-08');
    months.forEach((m, i) =>
      charge(
        `${m}-03`,
        'rent',
        i < 27 ? -60_000 : i < 31 ? -54_000 : -59_400,
        i < 27 ? 'p1' : 'p2',
      ),
    );
    createExpectedPayment(
      opened.db,
      {
        name: 'Current rent',
        categoryId: 'rent',
        payeeId: 'p2',
        kind: 'outflow',
        rhythm: 'monthly',
        dueDay: 3,
        startDate: '2026-10-03',
      },
      { validFrom: '2026-10-03', amountCents: 59_400 },
      ctx,
      today,
    );
    const r = inflationReport(opened.db, today);
    expect(r.points[26]?.index).toBe(100);
    expect(r.points[27]?.index).toBe(90);
    expect(r.points[31]?.index).toBe(99);
    expect(r.contributions.map((c) => c.id)).toContain('rent');
    expect(r.basket).toHaveLength(1);
    expect(r.contributionSumBp).toBe(r.inflationBp);
    expect(r.derivedContracts).toHaveLength(2);
  });
  it('a new annual item does not replace an existing annual item before its next billing period', () => {
    fixed('annual');
    createEntity(opened.db, payee, { id: 'p2', name: 'Synthetic annual biller' }, ctx);
    for (const year of [2024, 2025, 2026]) charge(`${year}-01-03`, 'annual', -1_000);
    charge('2026-07-03', 'annual', -2_000, 'p2');
    for (const [payeeId, dueMonth, amountCents] of [
      ['p1', 1, 1_000],
      ['p2', 7, 2_000],
    ] as const)
      createExpectedPayment(
        opened.db,
        {
          name: `Annual ${payeeId}`,
          categoryId: 'annual',
          payeeId,
          kind: 'outflow',
          rhythm: 'yearly',
          dueDay: 3,
          dueMonth,
          startDate: '2026-10-01',
        },
        { validFrom: '2026-10-01', amountCents },
        ctx,
        today,
      );
    const r = inflationReport(opened.db, today);
    expect(r.basket).toHaveLength(2);
    expect(r.points.every((p) => p.index === 100)).toBe(true);
  });
  it('automatic utility method smooths settlements; explicit setting is audited and undoable', () => {
    fixed('utility');
    createEntity(opened.db, payee, { id: 'grid', name: 'Synthetic grid' }, ctx);
    for (const m of monthsBetween('2023-10', '2026-08')) {
      charge(`${m}-03`, 'utility', -6_000);
      charge(`${m}-10`, 'utility', -3_000, 'grid');
    }
    charge('2026-01-20', 'utility', -12_000);
    expect(inflationReport(opened.db, today).basket[0]?.source).toBe('trailing');
    updateCategory(
      opened.db,
      'utility',
      { inflationTrailingMean: false },
      { ...ctx, groupId: 'utility-method' },
    );
    expect(inflationReport(opened.db, today).basket.every((b) => b.source === 'bookings')).toBe(
      true,
    );
    undo(opened.db, { groupId: 'utility-method' }, ctx);
    expect(
      opened.db.select().from(category).where(eq(category.id, 'utility')).get()
        ?.inflationTrailingMean,
    ).toBeNull();
    expect(inflationReport(opened.db, today).basket[0]?.source).toBe('trailing');
  });
  it('bank-cost parts conserve sources, exclude principal and keep capital returns separate', () => {
    createEntity(opened.db, categoryGroup, { id: 'bank', name: 'Bank und Gebühren' }, ctx);
    for (const [id, name] of [
      ['fee', 'Kontoführung'],
      ['overdraft', 'Sollzinsen'],
      ['interest', 'Kreditzinsen'],
    ])
      categories.create(
        opened.db,
        { id: id!, name: name!, groupId: 'bank', class: 'need', kind: 'fixed' },
        ctx,
      );
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
      },
      ctx,
    );
    charge('2026-08-03', 'fee', -500);
    charge('2026-08-03', 'overdraft', -200);
    charge('2026-08-03', 'interest', -1_000, 'p1', 'loan');
    createBooking(
      opened.db,
      {
        accountId: 'loan',
        date: '2026-08-03',
        amountCents: 20_000,
        splits: [{ amountCents: 20_000 }],
      },
      ctx,
    );
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
        id: 'trade',
        securityId: 'instrument',
        accountId: 'giro',
        date: '2026-08-10',
        kind: 'buy',
        unitsE8: 100_000_000,
        amountCents: 10_000,
        feeCents: 100,
      },
      ctx,
    );
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-20',
        amountCents: 900,
        splits: [{ amountCents: 900, incomeTypeId: INCOME_TYPES.capital.id }],
      },
      ctx,
    );
    const r = bankCostsReport(opened.db, today);
    expect(Object.fromEntries(r.rows.map((row) => [row.key, row.cents]))).toEqual({
      interest: 1_000,
      account: 500,
      orders: 100,
      overdraft: 200,
    });
    expect(r.totalCents).toBe(1_800);
    expect(r.earningsCents).toBe(900);
    expect(r.sources.reduce((a, s) => a + s.cents, 0)).toBe(1_800);
    expect(r.monthly.reduce((a, s) => a + s.totalCents, 0)).toBe(1_800);
  });
  it('stored loan terms supply missing interest but explicit interest wins for a month', () => {
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
    createEntity(opened.db, categoryGroup, { id: 'bank', name: 'Bank und Gebühren' }, ctx);
    categories.create(
      opened.db,
      { id: 'interest', name: 'Interest', groupId: 'bank', class: 'need', kind: 'fixed' },
      ctx,
    );
    charge('2026-08-03', 'interest', -800, 'p1', 'loan');
    const r = bankCostsReport(opened.db, today);
    expect(r.monthly.find((m) => m.month === '2026-07')?.parts['interest']).toBe(1_200);
    expect(r.monthly.find((m) => m.month === '2026-08')?.parts['interest']).toBe(800);
    expect(r.sources.find((s) => s.kind === 'interest')).toMatchObject({
      cents: 2_000,
      derived: true,
    });
  });
  it('income/expense reads actual dates, nets refunds, excludes transfers and exposes exact subtotal bookings', () => {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-03',
        amountCents: 100_000,
        splits: [{ amountCents: 100_000, incomeTypeId: INCOME_TYPES.salary.id }],
      },
      ctx,
    );
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-04',
        amountCents: 2_000,
        splits: [{ amountCents: 2_000, incomeTypeId: INCOME_TYPES.capital.id }],
      },
      ctx,
    );
    charge('2026-08-05', 'essen', -30_000);
    charge('2026-08-06', 'essen', 5_000);
    createTransfer(
      opened.db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-08-10', amountCents: 10_000 },
      ctx,
    );
    const r = incomeExpenseReport(opened.db, today);
    const rows = incomeExpenseRows(
      r.months.filter((m) => m.month === '2026-08'),
      r,
      new Set(['g']),
    );
    expect(rows.find((s) => s.key === 'inc')?.vals).toEqual([100_000]);
    expect(rows.find((s) => s.key === 'exp')?.vals).toEqual([25_000]);
    expect(rows.find((s) => s.key === 'net')?.vals).toEqual([75_000]);
    expect(rows.find((s) => s.key === `inc:${INCOME_TYPES.capital.id}`)?.vals).toEqual([2_000]);
    expect(r.splits.filter((s) => s.date.startsWith('2026-08'))).toHaveLength(4);
  });
  it('annual preview includes savings and deduplicates their matching planned transfer', () => {
    createEntity(
      opened.db,
      security,
      { id: 'instrument', name: 'Synthetic instrument', kind: 'etf' },
      ctx,
    );
    createEntity(
      opened.db,
      savingsPlan,
      {
        id: 'plan',
        securityId: 'instrument',
        accountId: 'spar',
        sourceAccountId: 'giro',
        amountCents: 10_000,
        dayOfMonth: 3,
        validFrom: '2026-10-01',
      },
      ctx,
    );
    createTransfer(
      opened.db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-10-03', amountCents: 10_000 },
      ctx,
    );
    const r = readPaymentsPreview(opened.db, today);
    expect(r.currencies[0]?.total.baseCents).toBe(120_000);
    expect(r.rows.flatMap((row) => row.events)).toHaveLength(12);
    expect(r.rows).toHaveLength(2);
  });
  it('reserve reach uses closed Bedarf and only explicit Tagesgeld goal allocation', () => {
    charge('2026-08-03', 'essen', -12_000);
    createBooking(
      opened.db,
      {
        accountId: 'spar',
        date: '2026-08-05',
        amountCents: 24_000,
        splits: [{ amountCents: 24_000 }],
      },
      ctx,
    );
    createGoal(
      opened.db,
      { name: 'Emergency reserve', targetCents: 36_000, accountId: 'spar' },
      ctx,
    );
    const r = goalsReport(opened.db, today);
    expect(r.coverage).toMatchObject({ averageNeedCents: 1_000, tenthsOfMonth: 240, months: 12 });
    expect(r.cash[0]).toMatchObject({
      goal: 'Emergency reserve',
      ambiguous: false,
      balanceCents: 24_000,
    });
    createGoal(opened.db, { name: 'Second goal', targetCents: 50_000, accountId: 'spar' }, ctx);
    expect(goalsReport(opened.db, today).cash[0]).toMatchObject({ goal: null, ambiguous: true });
  });
});
