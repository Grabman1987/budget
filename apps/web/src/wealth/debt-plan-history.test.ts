import { describe, expect, it } from 'vitest';
import type { LoanPlanView } from './loan-planning-api';
import { completedDebtMonthEnds, matchingDebtHistory } from './debt-plan-history';

const plan = {
  accountId: 'loan-1',
  currency: 'EUR',
  asOf: '2026-10-26',
  balanceCents: 12_345,
} as LoanPlanView;
const loan = { id: 'loan-1', currency: 'EUR', balanceCents: -12_345 };
const series = {
  accountId: 'loan-1',
  currency: 'EUR',
  points: [
    { date: '2025-10-31', balanceCents: -14_000 },
    { date: '2025-12-31', balanceCents: -13_001 },
    { date: '2026-10-26', balanceCents: -12_345 },
  ],
};

describe('selected loan history basis', () => {
  it('selects exactly twelve completed month ends and does not create a missing November observation', () => {
    const ends = completedDebtMonthEnds('2026-10-26', '2023-10-01');
    expect(ends).toHaveLength(12);
    expect(ends[0]).toBe('2025-10-31');
    expect(ends.at(-1)).toBe('2026-09-30');
    expect(matchingDebtHistory(loan, plan, series, '2026-10-26', ends)).toEqual([
      { date: '2025-10-31', balanceCents: -14_000 },
      { date: '2025-12-31', balanceCents: -13_001 },
    ]);
  });

  it('fails closed for stale selected-loan cents or currency even if the two GETs agree', () => {
    const ends = completedDebtMonthEnds('2026-10-26', '2023-10-01');
    expect(
      matchingDebtHistory({ ...loan, balanceCents: -12_344 }, plan, series, plan.asOf, ends),
    ).toBeNull();
    expect(
      matchingDebtHistory({ ...loan, currency: 'USD' }, plan, series, plan.asOf, ends),
    ).toBeNull();
    expect(
      matchingDebtHistory(loan, plan, { ...series, currency: 'USD' }, plan.asOf, ends),
    ).toBeNull();
    expect(
      matchingDebtHistory(
        loan,
        plan,
        { ...series, points: series.points.slice(0, 2) },
        plan.asOf,
        ends,
      ),
    ).toBeNull();
  });
});
