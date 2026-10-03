import { calendarRangeWindow, isCalendarRange, type CalendarRange } from '../report-range';
import { addMonths, daysBetween, lastDayOfMonth } from '../date';
import { irr, modifiedDietz, type CashFlow, type Valuation } from './returns';

/**
 * Portfolio performance per window (P5.2, SPEC §6). Inputs are integer cents (values, flows); the
 * outputs are
 * - money: integer cents, computed from the integer inputs only;
 * - rates (0,1 = 10 %): IEEE doubles, NEVER rounded here. Rates are derived figures that are not
 *   stored or summed; the formatter rounds once at the edge (`1,2 %`). Money is never derived from
 *   a rate.
 *
 * Which return each page shows
 * - `ttwror`: Vermögen header, Portfolio page, Reports 4.4 (window return, not annualised; the
 *   annualised value is `ttwrorAnnualised`).
 * - `moneyWeighted` (Modified Dietz, annualised beyond 12 months): the prototype's "IRR" column,
 *   so the pages match the prototype and its PERF figures.
 * - `xirr` (actual/365, annualised): the figure Portfolio Performance calls IRR; the Gate 3
 *   report compares this one.
 */

export type Period = '1M' | '3M' | 'YTD' | '1J' | '3J' | 'Alles' | CalendarRange;

export interface Window {
  /** Day of the start value (the close of this day); flows count from the day after. */
  from: string;
  to: string;
}

/** Same day `n` months earlier, clamped to the month length (31.03. minus 1 month = 28.02.). */
export function sameDayMonthsBack(day: string, n: number): string {
  const month = addMonths(day.slice(0, 7), -n);
  const last = lastDayOfMonth(month);
  return `${month}-${String(Math.min(Number(day.slice(8, 10)), Number(last.slice(8, 10)))).padStart(2, '0')}`;
}

/**
 * Window of a period ending on `today` (Vienna day): 1M/3M/1J/3J start on the same day of the
 * earlier month, YTD on 31.12. of the previous year, Alles on `earliest` (default: as early as
 * possible; `windowPerformance` clamps the start to the first day of the series).
 */
export function periodWindow(period: Period, today: string, earliest = '0000-01-01'): Window {
  if (isCalendarRange(period)) return calendarRangeWindow(period, today);
  switch (period) {
    case '1M':
      return { from: sameDayMonthsBack(today, 1), to: today };
    case '3M':
      return { from: sameDayMonthsBack(today, 3), to: today };
    case '1J':
      return { from: sameDayMonthsBack(today, 12), to: today };
    case '3J':
      return { from: sameDayMonthsBack(today, 36), to: today };
    case 'YTD':
      return { from: `${Number(today.slice(0, 4)) - 1}-12-31`, to: today };
    default:
      return { from: earliest, to: today };
  }
}

export interface DailyReturn {
  date: string;
  /** Return of the day: `(value − flow) / previous value − 1`. */
  rate: number;
}

/**
 * Daily sub-period returns of consecutive valuations. A flow of a day counts at its end (the value
 * already contains it). A sub-period that starts at a value of 0 or less is skipped (before the
 * first buy, after a full sale), exactly like `ttwror`.
 */
export function dailyReturns(
  series: ReadonlyArray<Valuation>,
  flows: ReadonlyArray<CashFlow>,
): DailyReturn[] {
  const flowOn = new Map<string, number>();
  for (const f of flows) flowOn.set(f.date, (flowOn.get(f.date) ?? 0) + f.cents);
  const out: DailyReturn[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1] as Valuation;
    const cur = series[i] as Valuation;
    if (prev.valueCents <= 0) continue;
    out.push({
      date: cur.date,
      rate: (cur.valueCents - (flowOn.get(cur.date) ?? 0)) / prev.valueCents - 1,
    });
  }
  return out;
}

/** The monthly boundaries of a window: `from`, every month end before `to`, `to`. */
export function monthBoundaries(from: string, to: string): string[] {
  const out = [from];
  for (let m = from.slice(0, 7); ; m = addMonths(m, 1)) {
    const end = lastDayOfMonth(m);
    if (end >= to) break;
    if (end > from) out.push(end);
  }
  if (to > from) out.push(to);
  return out;
}

const chain = (rates: ReadonlyArray<number>) => rates.reduce((g, r) => g * (1 + r), 1) - 1;

/** Sample standard deviation (n − 1, like the prototype). */
function stdev(xs: ReadonlyArray<number>): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1));
}

/** Largest fall from a peak of the chained index (≤ 0); the index starts at 1. */
export function maxDrawdown(rates: ReadonlyArray<number>): number {
  let peak = 1;
  let index = 1;
  let worst = 0;
  for (const r of rates) {
    index *= 1 + r;
    peak = Math.max(peak, index);
    worst = Math.min(worst, index / peak - 1);
  }
  return worst;
}

export interface SeriesFigures {
  /** Chained return of the window. */
  ttwror: number;
  /** Monthly standard deviation × √12. */
  volatility: number;
  maxDrawdown: number;
  /** (annualised return − risk-free rate) / volatility; 0 without volatility. */
  sharpe: number;
  /** Covariance with the benchmark over its variance; null without a benchmark. */
  beta: number | null;
  bestMonth: number;
  worstMonth: number;
  positiveMonthShare: number;
  benchmarkTtwror: number | null;
}

export const RISK_FREE_RATE = 0.025;

/**
 * The risk figures of a list of monthly returns (port of `stats()` in `reports-portfolio.js`).
 * `years` is the length of the window in years (default `months / 12`, the prototype's rule);
 * the return is annualised over it for Sharpe.
 */
export function monthlyFigures(
  months: ReadonlyArray<number>,
  benchmark?: ReadonlyArray<number>,
  options: { years?: number | undefined; riskFree?: number | undefined } = {},
): SeriesFigures {
  const n = months.length;
  const tw = chain(months);
  const vol = stdev(months) * Math.sqrt(12);
  const years = options.years ?? n / 12;
  const annualised = years > 0 ? Math.pow(1 + tw, 1 / years) - 1 : 0;
  let beta: number | null = null;
  if (benchmark && benchmark.length === n && n > 1) {
    const mean = months.reduce((a, b) => a + b, 0) / n;
    const bmean = benchmark.reduce((a, b) => a + b, 0) / n;
    const cov =
      months.reduce((a, r, i) => a + (r - mean) * ((benchmark[i] as number) - bmean), 0) / (n - 1);
    const variance = stdev(benchmark) ** 2;
    beta = variance ? cov / variance : 0;
  }
  return {
    ttwror: tw,
    volatility: vol,
    maxDrawdown: maxDrawdown(months),
    sharpe: vol ? (annualised - (options.riskFree ?? RISK_FREE_RATE)) / vol : 0,
    beta,
    bestMonth: n ? Math.max(...months) : 0,
    worstMonth: n ? Math.min(...months) : 0,
    positiveMonthShare: n ? months.filter((r) => r > 0).length / n : 0,
    benchmarkTtwror: benchmark ? chain(benchmark) : null,
  };
}

/**
 * The prototype's money-weighted return (`stats()`): Modified Dietz over monthly contributions
 * (a contribution of month k weighs `(last − k + 0.5) / n`), annualised beyond 12 months.
 * `contributionsCents[i]` belongs to month i of the window.
 */
export function dietzMonthly(
  startValueCents: number,
  endValueCents: number,
  contributionsCents: ReadonlyArray<number>,
): number {
  const n = contributionsCents.length;
  const net = contributionsCents.reduce((a, b) => a + b, 0);
  const weighted = contributionsCents.reduce((a, c, i) => a + (c * (n - 1 - i + 0.5)) / n, 0);
  const gain = endValueCents - startValueCents - net;
  const md = gain / Math.max(100, startValueCents + weighted);
  return n > 12 ? Math.pow(1 + md, 12 / n) - 1 : md;
}

export interface BenchmarkLevel {
  date: string;
  level: number;
}

export interface PerformanceInput {
  /** Daily valuations, ascending, one per day without gaps (see `valuationSeries`). */
  series: ReadonlyArray<Valuation>;
  /** External flows in EUR cents (positive = in). */
  flows: ReadonlyArray<CashFlow>;
  /** Index levels (daily or monthly, carried forward); enables beta and the benchmark return. */
  benchmark?: ReadonlyArray<BenchmarkLevel>;
  riskFree?: number;
}

export interface WindowPerformance extends SeriesFigures {
  /** Effective window: `from` is clamped to the first day of the series. */
  from: string;
  to: string;
  days: number;
  startValueCents: number;
  endValueCents: number;
  /** Net money put in during the window (flows after `from` up to `to`). */
  contributionsCents: number;
  /** End − start − contributions. */
  gainCents: number;
  ttwrorAnnualised: number;
  /** Modified Dietz, annualised beyond 12 months (the prototype's IRR). */
  moneyWeighted: number;
  /** XIRR, actual/365 annualised; null when no rate exists. */
  xirr: number | null;
  monthCount: number;
}

function valueOn(series: ReadonlyArray<Valuation>, day: string): number {
  // The series is daily and gapless, so the index is a date difference; fall back to a search.
  const first = series[0] as Valuation;
  const guess = series[daysBetween(first.date, day)];
  if (guess && guess.date === day) return guess.valueCents;
  let found = 0;
  for (const v of series) if (v.date <= day) found = v.valueCents;
  return found;
}

function levelOn(levels: ReadonlyArray<BenchmarkLevel>, day: string): number | undefined {
  let found: number | undefined;
  for (const l of levels) if (l.date <= day) found = l.level;
  return found;
}

/**
 * All figures of one window. The series must cover `from … to`; `from` is moved to the first day
 * of the series when it starts later. Monthly returns chain the daily returns of each calendar
 * month of the window (the first and the last month may be partial).
 */
export function windowPerformance(input: PerformanceInput, window: Window): WindowPerformance {
  const first = input.series[0];
  const last = input.series[input.series.length - 1];
  if (!first || !last) throw new RangeError('The valuation series is empty');
  const from = window.from < first.date ? first.date : window.from;
  const to = window.to > last.date ? last.date : window.to;
  if (to < from) throw new RangeError('The window ends before the series starts');
  const days = daysBetween(from, to);
  const slice = input.series.filter((v) => v.date >= from && v.date <= to);
  const flows = input.flows.filter((f) => f.date > from && f.date <= to);
  const startValueCents = valueOn(input.series, from);
  const endValueCents = valueOn(input.series, to);
  const contributionsCents = flows.reduce((a, f) => a + f.cents, 0);

  const daily = dailyReturns(slice, flows);
  const bounds = monthBoundaries(from, to);
  const months: number[] = [];
  const benchmarkMonths: number[] = [];
  let benchmarkOk = input.benchmark !== undefined && input.benchmark.length > 0;
  for (let i = 1; i < bounds.length; i++) {
    const a = bounds[i - 1] as string;
    const b = bounds[i] as string;
    months.push(chain(daily.filter((d) => d.date > a && d.date <= b).map((d) => d.rate)));
    if (benchmarkOk) {
      const la = levelOn(input.benchmark ?? [], a);
      const lb = levelOn(input.benchmark ?? [], b);
      if (la === undefined || lb === undefined || la === 0) benchmarkOk = false;
      else benchmarkMonths.push(lb / la - 1);
    }
  }
  const years = days / 365;
  const figures = monthlyFigures(months, benchmarkOk ? benchmarkMonths : undefined, {
    years: years > 0 ? years : undefined,
    riskFree: input.riskFree,
  });
  // Window return and drawdown from the daily chain (more exact than the monthly one).
  const dailyRates = daily.map((d) => d.rate);
  const ttwror = chain(dailyRates);

  let xirr: number | null = null;
  let moneyWeighted = 0;
  if (days > 0) {
    const start = { date: from, valueCents: startValueCents };
    const end = { date: to, valueCents: endValueCents };
    try {
      xirr = irr(start, end, flows);
    } catch {
      xirr = null;
    }
    const md = modifiedDietz(start, end, flows);
    moneyWeighted = days > 365 ? Math.pow(1 + md, 365 / days) - 1 : md;
  }
  return {
    ...figures,
    ttwror,
    maxDrawdown: maxDrawdown(dailyRates),
    from,
    to,
    days,
    startValueCents,
    endValueCents,
    contributionsCents,
    gainCents: endValueCents - startValueCents - contributionsCents,
    ttwrorAnnualised: days > 0 ? Math.pow(1 + ttwror, 365 / days) - 1 : 0,
    moneyWeighted,
    xirr,
    monthCount: months.length,
  };
}

/** `windowPerformance` for a named period ending `today` (Alles starts at the series start). */
export function periodPerformance(
  input: PerformanceInput,
  period: Period,
  today: string,
): WindowPerformance {
  return windowPerformance(input, periodWindow(period, today, input.series[0]?.date));
}
