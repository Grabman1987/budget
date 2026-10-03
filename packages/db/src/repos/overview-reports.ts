import { overviewData } from './report-ledger';
export { overviewData } from './report-ledger';
import {
  addDays,
  allocation,
  bucketNetWorth,
  comparePeriods,
  explorerPivot,
  lastDayOfMonth,
  monthOf,
  monthsBetween,
  netWorthWindow,
  overviewMonthlyFigures,
  overviewRefMonth,
  overviewYearMonths,
  reportYears,
  yearReport,
  ExchangeRateUnavailableError,
  PriceUnavailableError,
  type ClassAmounts,
  type CompareMode,
  type ExplorerQuery,
  type ExplorerResult,
  type OverviewData,
  type PeriodComparison,
  type RuleStatus,
  type YearNetWorth,
  type YearReport,
} from '@budget/domain';
import { allocationMonth } from './allocation';
import { earliestAccountDate, netWorthAsOf, netWorthDaily } from './portfolio';
import { budget } from './queries';
import { ruleResults } from './rules';
import type { Executor } from './types';

/**
 * Read models of the Überblick reports 5.1 Jahresreport, 5.3 Explorer and 5.5 Zeitraumvergleich.
 * `overviewData` reads the live splits of the budget accounts once and classifies them (see
 * `overview/figures.ts` in the domain); the pure functions of the domain build the reports.
 */

/** Frame of every report: the last full month at `today` and the ledger's first month. */
export interface OverviewFrame {
  today: string;
  ref: string;
  firstMonth: string | null;
}

const frameOf = (data: OverviewData, today: string): OverviewFrame => ({
  today,
  ref: overviewRefMonth(today),
  firstMonth: data.firstMonth,
});

// ---------------------------------------------------------------------------------------------
// 5.5 Zeitraumvergleich
// ---------------------------------------------------------------------------------------------

export interface PeriodComparisonReport extends OverviewFrame {
  comparison: PeriodComparison;
}

export function periodComparisonReport(
  db: Executor,
  mode: CompareMode,
  today: string,
): PeriodComparisonReport {
  const data = overviewData(db);
  const frame = frameOf(data, today);
  return {
    ...frame,
    comparison: comparePeriods({
      mode,
      ref: frame.ref,
      firstMonth: data.firstMonth,
      figures: overviewMonthlyFigures(data),
      categories: data.categories,
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// 5.3 Explorer
// ---------------------------------------------------------------------------------------------

export interface ExplorerReport extends OverviewFrame {
  result: ExplorerResult;
}

export function explorerReport(db: Executor, query: ExplorerQuery, today: string): ExplorerReport {
  const data = overviewData(db);
  data.splits = data.splits.filter((s) => s.date <= today);
  const frame = frameOf(data, today);
  if (query.period.includes('..')) frame.ref = today.slice(0, 7);
  return { ...frame, result: explorerPivot(data, query, frame.ref) };
}

// ---------------------------------------------------------------------------------------------
// 5.1 Jahresreport
// ---------------------------------------------------------------------------------------------

export interface YearRules {
  /** The month end the stored results are from. */
  asOf: string;
  okCount: number;
  total: number;
  cells: { code: string; name: string; status: RuleStatus }[];
}

export interface YearReportRead extends OverviewFrame {
  years: number[];
  report: YearReport;
  /** Why the net worth chain is missing (a price or exchange rate is missing), or `null`. */
  netWorthUnavailable: string | null;
  /** Stored Finanz-Check of the last included month end; `null` when none was stored. */
  rules: YearRules | null;
  specialIncomeTypeIds: string[];
}

/** Net worth chain and month ends of the included months, from the same series as Vermögen. */
function yearNetWorth(db: Executor, months: string[]): YearNetWorth | null {
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) return null;
  const earliest = earliestAccountDate(db) ?? `${first}-01`;
  const dayBefore = addDays(`${first}-01`, -1);
  const from = dayBefore < earliest ? earliest : dayBefore;
  const to = lastDayOfMonth(last);
  const startCents = netWorthAsOf(db, from).totalCents;
  const rows = from < to ? netWorthDaily(db, addDays(from, 1), to) : [];
  const chain = netWorthWindow(rows, startCents);
  const buckets = bucketNetWorth(rows, 'month');
  const endOf = new Map<string, number>();
  for (const r of rows) endOf.set(monthOf(r.date), r.netWorthCents);
  return {
    startCents: chain.startCents,
    endCents: chain.nowCents,
    ownCents: chain.ownCents,
    marketCents: chain.marketCents,
    months: months.map((month) => {
      const bucket = buckets.find((b) => monthOf(b.to) === month);
      return {
        month,
        endCents: endOf.get(month) ?? (month < monthOf(from) ? 0 : startCents),
        ownCents: bucket?.ownCents ?? 0,
        marketCents: bucket?.marketCents ?? 0,
      };
    }),
  };
}

/** 50/30/20 amounts of the months as the rules count them (periodic costs as twelfths). */
function classAmountsOf(db: Executor, months: string[]): ClassAmounts | null {
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) return null;
  const budgetMonths = budget(db, monthsBetween(first, last));
  if (budgetMonths.length === 0) return null;
  const alloc = allocation(
    budgetMonths.map((m) => {
      const a = allocationMonth(db, m.month, m.envelopes);
      // Only the class amounts are used; income is the report's own household income.
      return { incomeCents: 0, annualIncomeCents: 0, items: a.items };
    }),
  );
  return {
    needCents: alloc.needCents,
    wantCents: alloc.wantCents,
    futureCents: alloc.futureCents,
  };
}

export function yearReportRead(db: Executor, year: number, today: string): YearReportRead {
  const data = overviewData(db);
  const frame = frameOf(data, today);
  const months = overviewYearMonths(year, frame.ref, data.firstMonth);
  let netWorth: YearNetWorth | null = null;
  let netWorthUnavailable: string | null = null;
  try {
    netWorth = yearNetWorth(db, months);
  } catch (error) {
    if (!(error instanceof PriceUnavailableError || error instanceof ExchangeRateUnavailableError))
      throw error;
    netWorthUnavailable = error.message;
  }
  const specialIncomeTypeIds = data.incomeTypes.filter((t) => t.special).map((t) => t.id);
  const report = yearReport({
    year,
    ref: frame.ref,
    data,
    figures: overviewMonthlyFigures(data),
    netWorth,
    classAmounts: classAmountsOf(db, months),
    specialIncomeTypeIds: new Set(specialIncomeTypeIds),
  });
  let rules: YearRules | null = null;
  const lastMonth = months[months.length - 1];
  if (lastMonth !== undefined) {
    const day = lastDayOfMonth(lastMonth);
    const matrix = ruleResults(db, day, day);
    const cells = matrix.rules.flatMap((r) => {
      const cell = r.cells.find((c) => c.asOf === day);
      return cell ? [{ code: r.code, name: r.name, status: cell.status }] : [];
    });
    if (cells.length > 0)
      rules = {
        asOf: day,
        okCount: cells.filter((c) => c.status === 'ok').length,
        total: matrix.rules.length,
        cells,
      };
  }
  return {
    ...frame,
    years: reportYears(data.firstMonth, frame.ref),
    report,
    netWorthUnavailable,
    rules,
    specialIncomeTypeIds,
  };
}
