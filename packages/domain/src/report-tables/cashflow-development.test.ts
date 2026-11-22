import { describe, expect, it } from 'vitest';
import {
  cashflowDevelopment,
  cashflowStatement,
  cashflowThroughDay,
  incomeExpenseNet,
} from './income-expense';
import type { TableMeta } from './tables';

const meta = {
  incomeTypes: [{ id: 'salary', role: 'income' }],
  categories: [],
} as never as TableMeta;
const month = (m: string, income: number, spending: number) => ({
  month: m,
  income: { salary: income },
  spending: { rent: spending },
});

describe('cashflow development', () => {
  const all = [
    month('2025-01', 100_000, 70_000),
    month('2025-02', 100_000, 130_000),
    month('2026-01', 110_000, 60_000),
    month('2026-02', 110_000, 90_000),
  ];
  it('cumulative is the running sum of the existing monthly net', () => {
    const rows = cashflowDevelopment(all, meta);
    expect(rows.map((r) => r.cashflow)).toEqual(all.map((m) => incomeExpenseNet(m, meta)));
    expect(rows.map((r) => r.cumulative)).toEqual([30_000, 0, 50_000, 70_000]);
  });
  it('statement compares with the previous year when all months exist', () => {
    const s = cashflowStatement(all, ['2026-01', '2026-02'], meta)!;
    expect(s).toEqual({
      total: 70_000,
      averagePerMonth: 35_000,
      comparison: { kind: 'previous-year', total: 0, delta: 70_000 },
    });
  });
  it('falls back to the previous period, then to none', () => {
    const s = cashflowStatement(all, ['2025-02', '2026-01'], meta)!;
    expect(s.comparison).toBeNull();
    const p = cashflowStatement(all.slice(2), ['2026-02'], meta)!;
    expect(p.comparison).toEqual({ kind: 'previous-period', total: 50_000, delta: -30_000 });
  });
  it('removes only later household receipts and spending from a comparison month', () => {
    const shared = {
      bookingId: 'synthetic',
      categoryId: null,
      payeeId: null,
      payeeName: null,
      incomeTypeId: null,
      incomeGroup: null,
    };
    const splits = [
      { ...shared, date: '2025-02-15', kind: 'spend', amountCents: 111 },
      { ...shared, date: '2025-02-16', kind: 'spend', amountCents: 1_003 },
      {
        ...shared,
        date: '2025-02-16',
        kind: 'income',
        amountCents: 2_005,
        incomeTypeId: 'salary',
        incomeGroup: 'household',
      },
      {
        ...shared,
        date: '2025-02-16',
        kind: 'income',
        amountCents: 999,
        incomeTypeId: 'capital',
        incomeGroup: 'capital',
      },
    ] as const;
    expect(cashflowThroughDay(all[1]!, meta, splits, '2025-02-15')).toBe(-31_002);
  });
});
