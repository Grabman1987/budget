import { addDays, lastDayOfMonth } from '../date';
import {
  dailyReturns,
  monthBoundaries,
  windowPerformance,
  type PerformanceInput,
  type Window,
} from './performance';

export type BenchmarkGap = 'missing_price' | 'missing_fx' | 'not_selected';
export interface ReportQuote {
  date: string;
  /** EUR price level, not stored money. Null means a stored quote lacks its historical FX. */
  level: number | null;
  reason: 'missing_fx' | null;
  /** Exchange-traded instruments can use Friday's close; daily/manual sources cannot. */
  weekendCarry?: boolean;
}

/** Report 4.4: one calendar partition of the existing daily TTWROR; no second return formula. */
export function performanceReportSeries(
  input: PerformanceInput,
  window: Window,
  quotes?: readonly ReportQuote[],
) {
  const effective = windowPerformance(input, window);
  const { from, to } = effective;
  const bounds = monthBoundaries(from, to);
  const ordered = [...(quotes ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const quoteOn = (day: string) => ordered.findLast((q) => q.date <= day);
  // Only a weekend can use Friday's close. No trading calendar is stored, so a missing
  // weekday/holiday close is an explicit gap, not an assumption of an unchanged price.
  const currentQuote = (day: string, quote: ReportQuote | undefined) => {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const closeDay = addDays(
      day,
      quote?.weekendCarry !== false ? (weekday === 0 ? -2 : weekday === 6 ? -1 : 0) : 0,
    );
    return quote !== undefined && quote.date >= closeDay;
  };
  const base = quoteOn(from);
  const baseLevel =
    currentQuote(from, base) && base?.level != null && base.level > 0 ? base.level : null;
  let portfolioLevel = 100;
  const index: { date: string; portfolio: number | null; benchmark: number | null }[] = [
    {
      date: from,
      portfolio: effective.startValueCents > 0 ? 100 : null,
      benchmark: baseLevel !== null ? 100 : null,
    },
  ];
  const months = bounds.slice(1).map((end, i) => {
    const start = bounds[i] as string;
    const segment = { from: start, to: end };
    const valued =
      dailyReturns(
        input.series.filter((v) => v.date >= start && v.date <= end),
        input.flows,
      ).length > 0;
    const rate = valued ? windowPerformance(input, segment).ttwror : null;
    const a = quoteOn(start),
      b = quoteOn(end);
    // Later quotes cannot backfill a missing start or end.
    const benchmarkGap: BenchmarkGap | null =
      quotes === undefined
        ? 'not_selected'
        : a?.reason === 'missing_fx' || b?.reason === 'missing_fx'
          ? 'missing_fx'
          : !currentQuote(start, a) ||
              !currentQuote(end, b) ||
              a?.level == null ||
              b?.level == null ||
              a.level <= 0 ||
              b.level < 0
            ? 'missing_price'
            : null;
    const benchmarkRate = benchmarkGap === null ? b!.level! / a!.level! - 1 : null;
    if (rate !== null) portfolioLevel *= 1 + rate;
    index.push({
      date: end,
      portfolio: rate === null ? null : portfolioLevel,
      benchmark: benchmarkGap === null && baseLevel !== null ? (100 * b!.level!) / baseLevel : null,
    });
    return {
      month: end.slice(0, 7),
      from: start,
      to: end,
      partial: addDays(start, 1).slice(8) !== '01' || end !== lastDayOfMonth(end.slice(0, 7)),
      rate,
      benchmarkRate,
      benchmarkGap,
      startQuoteDate: a?.date ?? null,
      endQuoteDate: b?.date ?? null,
    };
  });
  const compound = (values: (number | null)[]) =>
    values.length && values.every((v) => v !== null)
      ? values.reduce<number>((level, value) => level * (1 + value!), 1) - 1
      : null;
  const years = [...new Set(months.map((m) => Number(m.month.slice(0, 4))))].map((year) => {
    const mine = months.filter((m) => Number(m.month.slice(0, 4)) === year);
    return {
      year,
      from: mine[0]!.from,
      to: mine.at(-1)!.to,
      partial: mine.length !== 12 || mine.some((m) => m.partial),
      rate: compound(mine.map((m) => m.rate)),
      benchmarkRate: compound(mine.map((m) => m.benchmarkRate)),
    };
  });
  return {
    from,
    to,
    months,
    years,
    index,
    benchmarkReturn: compound(months.map((m) => m.benchmarkRate)),
  };
}

export type PerformanceReportSeries = ReturnType<typeof performanceReportSeries>;
