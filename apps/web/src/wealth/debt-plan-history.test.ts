import { describe, expect, it } from 'vitest';
import { simulateLoan } from '@budget/domain';
import type { LoanPlanView } from './loan-planning-api';
import {
  completedDebtMonthEnds,
  matchingDebtHistory,
  parseLiveMeasures,
} from './debt-plan-history';

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

describe('local Sondertilgung inputs', () => {
  it('matches the independently calculated V16 cent and payoff oracle', () => {
    const draft = parseLiveMeasures('0', '500', '2026-11', '2026-10');
    expect(draft.error).toBeNull();
    const terms = {
      balanceCents: 420_000,
      installmentCents: 20_000,
      rateBp: 400,
      monthlyFeeCents: 0,
      startMonth: '2026-10',
    };
    const baseline = simulateLoan(terms);
    const scenario = simulateLoan(terms, draft.measures);
    expect(baseline).toMatchObject({
      months: 22,
      payoffMonth: '2028-07',
      totalInterestCents: 16_157,
    });
    expect(scenario).toMatchObject({
      months: 20,
      payoffMonth: '2028-05',
      totalInterestCents: 12_894,
    });
    expect(baseline.totalInterestCents - scenario.totalInterestCents).toBe(3_263);
    expect(baseline.months - scenario.months).toBe(2);
  });

  it('requires an explicit valid one-off month and safe nonnegative cents', () => {
    expect(parseLiveMeasures('0', '500', '', '2026-10').error).toContain('Monat');
    expect(parseLiveMeasures('0', '500', '2026-09', '2026-10').error).toContain('Monat');
    expect(parseLiveMeasures('-1', '0', '', '2026-10').error).toContain('gültige');
    expect(parseLiveMeasures('100000001', '0', '', '2026-10').error).toContain('Modellbetrag');
  });
});
