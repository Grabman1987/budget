import { calendarRangeMonths, isCalendarRange } from '../report-range';
import { addMonths, lastDayOfMonth, monthOf, monthsBetween } from '../date';
import type { Period } from '../invest/performance';

/**
 * Report 3.2 Cashflow-Verlauf, calculated. Port of `R.cashflow` in
 * `design/prototype/reports-zukunft.js`. Per full month: household income minus consumption
 * (Bedarf and Wunsch) is the net cashflow; money that goes into the Zukunft class (ETF, reserves,
 * special repayments) is no expense, it stays part of the net cashflow ("davon in Zukunft").
 *
 * Owner decision 02.10.2026: dividends and interest (Kapitalerträge) are **not** household income.
 * They get their own column and series and are neither in the income nor in the net cashflow.
 * Transfers, refunds and contact repayments are no income either (the read model keeps them out).
 */

export interface CashflowMonthInput {
  month: string;
  /** Household income of the budget accounts, positive cents, without Kapitalerträge. */
  incomeCents: number;
  /** Spending in Bedarf categories, positive cents (refunds net). */
  needCents: number;
  /** Spending in Wunsch categories, positive cents (refunds net). */
  wantCents: number;
  /** Money moved into Zukunft categories, positive cents. */
  futureCents: number;
  /** Dividends and interest of the month, positive cents; separate from the income. */
  capitalCents: number;
}

export interface CashflowMonth extends CashflowMonthInput {
  consumptionCents: number;
  /** Income minus consumption. */
  netCents: number;
}

export function cashflowMonth(input: CashflowMonthInput): CashflowMonth {
  const consumptionCents = input.needCents + input.wantCents;
  return { ...input, consumptionCents, netCents: input.incomeCents - consumptionCents };
}

export interface CashflowTotals {
  months: number;
  incomeCents: number;
  needCents: number;
  wantCents: number;
  consumptionCents: number;
  netCents: number;
  futureCents: number;
  capitalCents: number;
  /** Months whose income exceeded the consumption. */
  positiveMonths: number;
}

export function cashflowTotals(months: ReadonlyArray<CashflowMonth>): CashflowTotals {
  const sum = (pick: (m: CashflowMonth) => number) => months.reduce((a, m) => a + pick(m), 0);
  return {
    months: months.length,
    incomeCents: sum((m) => m.incomeCents),
    needCents: sum((m) => m.needCents),
    wantCents: sum((m) => m.wantCents),
    consumptionCents: sum((m) => m.consumptionCents),
    netCents: sum((m) => m.netCents),
    futureCents: sum((m) => m.futureCents),
    capitalCents: sum((m) => m.capitalCents),
    positiveMonths: months.filter((m) => m.netCents > 0).length,
  };
}

/** The last month that is complete on `today` (the month itself on its last day). */
export function lastFullMonth(today: string): string {
  const month = monthOf(today);
  return today === lastDayOfMonth(month) ? month : addMonths(month, -1);
}

/**
 * The full months of a Zeitraum, never before `firstMonth`: 1M, 3M, 1J and 3J are the last 1, 3, 12
 * and 36 full months, YTD the full months of this year (the last full month alone in January),
 * Alles everything since `firstMonth`. The running month is never part of it.
 */
export function cashflowWindow(period: Period, today: string, firstMonth: string): string[] {
  if (isCalendarRange(period)) return calendarRangeMonths(period, firstMonth, today.slice(0, 7));
  const last = lastFullMonth(today);
  if (last < firstMonth) return [];
  const back = (n: number) => addMonths(last, -(n - 1));
  const start =
    period === '1M'
      ? back(1)
      : period === '3M'
        ? back(3)
        : period === '1J'
          ? back(12)
          : period === '3J'
            ? back(36)
            : period === 'YTD'
              ? monthOf(today).slice(0, 4) + '-01' <= last
                ? `${monthOf(today).slice(0, 4)}-01`
                : last
              : firstMonth;
  return monthsBetween(start < firstMonth ? firstMonth : start, last);
}

/** Months of the charts: the window, or the last 12 full months when the window is shorter than 6. */
export function cashflowChartMonths(
  window: ReadonlyArray<string>,
  today: string,
  firstMonth: string,
): string[] {
  if (window.length >= 6 || window.length === 0) return [...window];
  const last = lastFullMonth(today);
  const start = addMonths(last, -11);
  return monthsBetween(start < firstMonth ? firstMonth : start, last);
}
