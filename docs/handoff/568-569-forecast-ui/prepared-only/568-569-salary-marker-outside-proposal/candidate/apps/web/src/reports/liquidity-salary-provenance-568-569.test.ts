import { expect, it } from 'vitest';
import { liquidityReport, type LiquidityReportInput } from '@budget/domain';
import { salaryDay } from './liquidity-selection';

it('marks the real 9000-cent salary independently of the movement display cutoff (#568/#569)', () => {
  const salary = {
    day: '2026-10-07',
    cents: 9_000,
    kind: 'income' as const,
    label: 'Synthetic salary',
    ref: { paymentId: 'salary-source', dueDate: '2026-10-07' },
  };
  const debit = {
    day: '2026-09-27',
    cents: -30_000,
    kind: 'fixed' as const,
    ref: { paymentId: 'debit-source', dueDate: '2026-09-27' },
  };
  const input: LiquidityReportInput = {
    startDay: '2026-09-17',
    startCents: 100_000,
    horizon: '35d',
    items: [
      { ...salary, day: '2026-09-17', ref: { ...salary.ref, dueDate: '2026-09-17' } },
      debit,
      salary,
      { ...salary, day: '2026-10-23', ref: { ...salary.ref, dueDate: '2026-10-23' } },
    ],
    events: [],
    variableMonthlyCents: 0,
    levers: [],
  };
  const ids = new Set(['salary-source']);
  const report = liquidityReport(input);
  expect(report.scheduledInflows).toEqual([
    { day: '2026-10-07', cents: 9_000, ref: salary.ref },
  ]);
  expect(salaryDay(report, ids)).toBe('2026-10-07');
  expect(salaryDay(report, new Set())).toBeNull();
  expect(salaryDay(report, new Set(['unknown-source']))).toBeNull();
  expect(report.low).toEqual({ day: '2026-09-27', index: 10, cents: 70_000 });
  expect(report.points.find((p) => p.day === '2026-10-07')?.balanceCents).toBe(79_000);
  expect(report.movements.flatMap((m) => m.rows).map((r) => [r.day, r.cents])).toEqual([
    ['2026-09-27', -30_000],
  ]);
  expect(report.movements.find((m) => m.month === '2026-10')?.restCents).toBe(9_000);

  const suppressed = liquidityReport({
    ...input,
    items: [
      debit,
      { ...salary, cents: 0 },
      { ...salary, day: '2026-09-20', ref: { paymentId: 'other-source', dueDate: '2026-09-20' } },
      { day: '2026-09-21', cents: 9_000, kind: 'income', label: 'Synthetic salary' },
      { ...salary, day: '2026-09-22', cents: -1 },
    ],
    // Even an event carrying the same ref must never masquerade as a scheduled salary.
    events: [{ ...salary, day: '2026-09-23', kind: 'event' }],
  });
  expect(suppressed.scheduledInflows).toEqual([
    { day: '2026-09-20', cents: 9_000, ref: { paymentId: 'other-source', dueDate: '2026-09-20' } },
  ]);
  expect(salaryDay(suppressed, ids)).toBeNull();
  expect(salaryDay(liquidityReport({ ...input, items: [debit] }), ids)).toBeNull();
  const boundary = liquidityReport({ ...input, items: [{
    ...salary, day: '2026-10-22', ref: { ...salary.ref, dueDate: '2026-10-22' },
  }] });
  expect(salaryDay(boundary, ids)).toBe('2026-10-22');
});
