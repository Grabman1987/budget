import { addMonths } from '../date';
import { allocation, type AllocMonth, type Allocation } from '../ledger/alloc';

/**
 * Ratio KPIs of the rule book (concept §3.5 and §8). Ratios are integers in basis points
 * (10.000 bp = 100 %); a ratio is `null` when its denominator is 0 (or negative, where a ratio is
 * meaningless, e.g. a negative net income). Money is integer cents.
 */

/** `num / den` in basis points, rounded half away from zero; `null` without a positive denominator. */
export function ratioBp(num: number, den: number): number | null {
  if (den <= 0) return null;
  const v = Math.round((Math.abs(num) * 10_000) / den);
  return num < 0 ? -v : v;
}

/**
 * R10 Fixkostenquote: (fixed monthly costs + periodic costs as twelfths) / net income.
 * Fixed and net income are per month, the periodic amount is what falls due in a year.
 */
export function fixedCostRatio(input: {
  fixedMonthlyCents: number;
  periodicAnnualCents: number;
  netIncomeCents: number;
}): number | null {
  // Twelfths keep the periodic share exact: (fixed * 12 + annual) / (income * 12).
  return ratioBp(
    input.fixedMonthlyCents * 12 + input.periodicAnnualCents,
    input.netIncomeCents * 12,
  );
}

/** R08 Schuldenquote: loan payments (rate incl. interest) / net income. */
export function debtServiceRatio(input: {
  loanPaymentsCents: number;
  netIncomeCents: number;
}): number | null {
  return ratioBp(input.loanPaymentsCents, input.netIncomeCents);
}

/** Sparquote: (income - consumption) / income. Negative when more is consumed than earned. */
export function savingsRate(input: {
  incomeCents: number;
  consumptionCents: number;
}): number | null {
  return ratioBp(input.incomeCents - input.consumptionCents, input.incomeCents);
}

export interface EmergencyCoverageInput {
  /** Sum of the balances of the accounts with the reserve role. Negative balances count as 0. */
  reserveCents: number;
  /** Bedarf spending per month (positive cents); months without an entry count as 0. */
  needSpending: ReadonlyArray<{ month: string; cents: number }>;
  /** The current month; the window is the 12 full months before it. */
  currentMonth: string;
  /** First month of the data; the window starts there when the history is shorter than 12 months. */
  firstMonth?: string;
}

export interface EmergencyCoverage {
  /** Reserve / average monthly Bedarf, in tenths of a month (24 = 2,4 months); `null` without spending. */
  tenthsOfMonth: number | null;
  /** Average monthly Bedarf spending of the window. */
  averageNeedCents: number;
  /** Months in the window. */
  months: number;
}

/** R02 Notgroschen: reserve balances / average monthly Bedarf spending of the last 12 full months. */
export function emergencyCoverage(input: EmergencyCoverageInput): EmergencyCoverage {
  const last = addMonths(input.currentMonth, -1);
  const from12 = addMonths(input.currentMonth, -12);
  const from = input.firstMonth && input.firstMonth > from12 ? input.firstMonth : from12;
  const months: string[] = [];
  for (let m = from; m <= last; m = addMonths(m, 1)) months.push(m);
  const total = input.needSpending
    .filter((s) => s.month >= from && s.month <= last)
    .reduce((a, s) => a + s.cents, 0);
  const n = months.length;
  const reserve = Math.max(0, input.reserveCents);
  return {
    tenthsOfMonth: n === 0 || total <= 0 ? null : Math.round((reserve * 10 * n) / total),
    averageNeedCents: n === 0 ? 0 : Math.round(total / n),
    months: n,
  };
}

export interface ClassShares {
  /** The month itself. */
  month: Allocation;
  /** The 12 months up to and including it (months without data are left out). */
  rolling12: Allocation;
}

/** R01 50/30/20: class shares of the month and rolling 12 months, from `allocation`. */
export function classShares(
  byMonth: Readonly<Record<string, AllocMonth>>,
  month: string,
): ClassShares {
  const empty: AllocMonth = { incomeCents: 0, annualIncomeCents: 0, items: [] };
  const window: AllocMonth[] = [];
  for (let i = -11; i <= 0; i++) {
    const m = byMonth[addMonths(month, i)];
    if (m) window.push(m);
  }
  return {
    month: allocation([byMonth[month] ?? empty]),
    rolling12: allocation(window),
  };
}

export interface MonthFlow {
  month: string;
  incomeCents: number;
  /** Consumption (Bedarf and Wunsch spending), positive. */
  spendingCents: number;
}

export interface LifestyleInflation {
  /** Growth of spending, last 12 months against the 12 before, in bp; `null` without a base. */
  spendingGrowthBp: number | null;
  incomeGrowthBp: number | null;
  /** Spending grew faster than income; `null` when one of the growths is unknown. */
  exceeds: boolean | null;
}

/** R11 Lifestyle-Inflation: spending growth against income growth, rolling 12 months against the 12 before. */
export function lifestyleInflation(
  flows: ReadonlyArray<MonthFlow>,
  lastMonth: string,
): LifestyleInflation {
  const curFrom = addMonths(lastMonth, -11);
  const prevFrom = addMonths(lastMonth, -23);
  const prevTo = addMonths(lastMonth, -12);
  const sum = (from: string, to: string, pick: (f: MonthFlow) => number) =>
    flows.filter((f) => f.month >= from && f.month <= to).reduce((a, f) => a + pick(f), 0);
  const growth = (pick: (f: MonthFlow) => number): number | null => {
    const prev = sum(prevFrom, prevTo, pick);
    const cur = sum(curFrom, lastMonth, pick);
    return ratioBp(cur - prev, prev);
  };
  const spendingGrowthBp = growth((f) => f.spendingCents);
  const incomeGrowthBp = growth((f) => f.incomeCents);
  return {
    spendingGrowthBp,
    incomeGrowthBp,
    exceeds:
      spendingGrowthBp === null || incomeGrowthBp === null
        ? null
        : spendingGrowthBp > incomeGrowthBp,
  };
}
