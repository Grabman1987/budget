import { addDays, lastDayOfMonth } from '../date';
import {
  dailyReturns,
  monthBoundaries,
  returnWindows,
  windowPerformance,
  type PerformanceInput,
  type Window,
} from './performance';
import { benchmarkQuoteResolver, type BenchmarkGap, type ReportQuote } from './benchmark-quotes';
export type { BenchmarkGap, ReportQuote } from './benchmark-quotes';

/** Report 4.4: one calendar partition of the existing daily TTWROR; no second return formula. */
export function performanceReportSeries(
  input: PerformanceInput,
  window: Window,
  quotes?: readonly ReportQuote[],
) {
  const effective = windowPerformance(input, window);
  const { from, to } = effective;
  const bounds = monthBoundaries(from, to);
  const quoteOn = benchmarkQuoteResolver(quotes ?? []);
  let portfolioLevel = 100;
  const dailySeries = input.series.filter((v) => v.date >= from && v.date <= to);
  const dailyRateByDate = new Map(
    dailyReturns(
      dailySeries,
      (input.returnFlows ?? input.flows).filter((flow) => flow.date > from && flow.date <= to),
    ).map(({ date, rate }) => [date, rate] as const),
  );
  const firstReturn = dailyRateByDate.keys().next().value;
  const baseDate = firstReturn ? addDays(firstReturn, -1) : from;
  const base = quoteOn(baseDate);
  const baseLevel = base.level !== null && base.level > 0 ? base.level : null;
  const dailyValues = dailySeries.map((valuation) => {
    const flows = input.flows.filter((f) => f.date === valuation.date && f.date > from);
    return {
      ...valuation,
      depositsCents: flows.reduce((sum, f) => sum + (f.cents > 0 || f.atStart ? f.cents : 0), 0),
      withdrawalsCents: flows.reduce(
        (sum, f) => sum + (f.cents <= 0 && !f.atStart ? -f.cents : 0),
        0,
      ),
    };
  });
  const dailyIndex: { date: string; portfolio: number | null }[] = [
    { date: from, portfolio: effective.startValueCents > 0 ? 100 : null },
  ];
  let dailyLevel = 100;
  for (const valuation of dailySeries) {
    if (valuation.date === from) continue;
    const rate = dailyRateByDate.get(valuation.date);
    if (rate !== undefined) dailyLevel *= 1 + rate;
    dailyIndex.push({ date: valuation.date, portfolio: rate === undefined ? null : dailyLevel });
  }
  let benchmarkBase = baseLevel;
  let lastBenchmarkLevel = 100;
  let previousDayValued = false;
  const dailyBenchmark = [
    {
      date: from,
      benchmark:
        dailyIndex[0]!.portfolio !== null &&
        baseDate === from &&
        baseLevel !== null &&
        firstReturn !== undefined
          ? 100
          : null,
    },
  ];
  for (const valuation of dailySeries) {
    if (valuation.date === from) continue;
    const valued = dailyRateByDate.has(valuation.date);
    if (valued && !previousDayValued) {
      const start = addDays(valuation.date, -1);
      const quote = quoteOn(start);
      benchmarkBase =
        quote.level !== null && quote.level > 0 && lastBenchmarkLevel > 0
          ? (100 * quote.level) / lastBenchmarkLevel
          : null;
    }
    const quote = quoteOn(valuation.date);
    const benchmark =
      valued && benchmarkBase !== null && quote.level !== null && quote.level >= 0
        ? (100 * quote.level) / benchmarkBase
        : null;
    dailyBenchmark.push({ date: valuation.date, benchmark });
    if (benchmark !== null) lastBenchmarkLevel = benchmark;
    previousDayValued = valued;
  }
  const benchmarkByDate = new Map(dailyBenchmark.map((point) => [point.date, point.benchmark]));
  const index: { date: string; portfolio: number | null; benchmark: number | null }[] = [
    { ...dailyIndex[0]!, benchmark: dailyBenchmark[0]!.benchmark },
  ];
  const months = bounds.slice(1).map((end, i) => {
    const start = bounds[i] as string;
    const segment = { from: start, to: end };
    const daily = [...dailyRateByDate]
      .filter(([date]) => date > start && date <= end)
      .map(([date, rate]) => ({ date, rate }));
    const valued = daily.length > 0;
    const rate = valued ? windowPerformance(input, segment).ttwror : null;
    const segments = returnWindows(daily);
    const a = quoteOn(segments[0]?.from ?? start),
      b = quoteOn(segments.at(-1)?.to ?? end);
    let benchmarkGap: BenchmarkGap | null = quotes === undefined ? 'not_selected' : null;
    let benchmarkLevel = 1;
    for (const part of segments) {
      const opening = quoteOn(part.from),
        closing = quoteOn(part.to);
      // Only the funded return days enter the comparison; later quotes never backfill a base.
      const gap: BenchmarkGap | null =
        opening.gap === 'missing_fx' || closing.gap === 'missing_fx'
          ? 'missing_fx'
          : opening.level === null ||
              closing.level === null ||
              opening.level <= 0 ||
              closing.level < 0
            ? 'missing_price'
            : null;
      benchmarkGap ??= gap;
      if (gap === null) benchmarkLevel *= closing!.level! / opening!.level!;
    }
    const benchmarkRate = valued && benchmarkGap === null ? benchmarkLevel - 1 : null;
    if (rate !== null) portfolioLevel *= 1 + rate;
    index.push({
      date: end,
      portfolio: rate === null ? null : portfolioLevel,
      benchmark: benchmarkByDate.get(end) ?? null,
    });
    return {
      month: end.slice(0, 7),
      from: start,
      to: end,
      partial: addDays(start, 1).slice(8) !== '01' || end !== lastDayOfMonth(end.slice(0, 7)),
      rate,
      benchmarkRate,
      benchmarkGap,
      startQuoteDate: a.quote?.date ?? null,
      endQuoteDate: b.quote?.date ?? null,
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
      rate: compound(mine.map((m) => m.rate).filter((rate) => rate !== null)),
      benchmarkRate: compound(mine.filter((m) => m.rate !== null).map((m) => m.benchmarkRate)),
    };
  });
  return {
    from,
    to,
    months,
    years,
    index,
    dailyIndex,
    dailyValues,
    dailyBenchmark,
    benchmarkReturn: compound(months.filter((m) => m.rate !== null).map((m) => m.benchmarkRate)),
  };
}

export type PerformanceReportSeries = ReturnType<typeof performanceReportSeries>;
