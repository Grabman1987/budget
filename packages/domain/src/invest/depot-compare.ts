import {
  dailyReturns,
  monthBoundaries,
  type BenchmarkLevel,
  type PerformanceInput,
  type Window,
} from './performance';

/**
 * Indexed lines for report 4.1 (Depots im Vergleich): the chained time-weighted level of a depot
 * and of the comparison security at every month boundary of a window, both starting at 100. The
 * depot line multiplies the same daily returns in the same order as `windowPerformance`, so its
 * last level equals `100 x (1 + ttwror)` of that window exactly. Levels are derived rates and are
 * never rounded here.
 */
export interface IndexPoint {
  date: string;
  /** 100 at the start of the window. */
  level: number;
}

/** Depot level: chain of the daily returns, read at the window start and at every month boundary. */
export function depotIndexLine(
  input: Pick<PerformanceInput, 'series' | 'flows'>,
  window: Window,
): IndexPoint[] {
  const first = input.series[0];
  const last = input.series[input.series.length - 1];
  if (!first || !last) return [];
  const from = window.from < first.date ? first.date : window.from;
  const to = window.to > last.date ? last.date : window.to;
  if (to < from) return [];
  const slice = input.series.filter((v) => v.date >= from && v.date <= to);
  const flows = input.flows.filter((f) => f.date > from && f.date <= to);
  const daily = dailyReturns(slice, flows);
  const bounds = monthBoundaries(from, to);
  const out: IndexPoint[] = [{ date: from, level: 100 }];
  let growth = 1;
  let next = 0;
  for (let i = 1; i < bounds.length; i++) {
    const boundary = bounds[i] as string;
    while (next < daily.length && (daily[next] as { date: string }).date <= boundary) {
      growth *= 1 + (daily[next] as { rate: number }).rate;
      next++;
    }
    out.push({ date: boundary, level: growth * 100 });
  }
  return out;
}

/**
 * Level of a comparison security on the same days, relative to its level on the first day.
 * `null` when a level is missing on or before any of the days (no invented comparison).
 */
export function benchmarkIndexLine(
  levels: ReadonlyArray<BenchmarkLevel>,
  days: ReadonlyArray<string>,
): IndexPoint[] | null {
  if (days.length === 0 || levels.length === 0) return null;
  const sorted = [...levels].sort((a, b) => a.date.localeCompare(b.date));
  const levelOn = (day: string): number | undefined => {
    let found: number | undefined;
    for (const l of sorted) {
      if (l.date > day) break;
      found = l.level;
    }
    return found;
  };
  const base = levelOn(days[0] as string);
  if (base === undefined || base === 0) return null;
  const out: IndexPoint[] = [];
  for (const date of days) {
    const level = levelOn(date);
    if (level === undefined) return null;
    out.push({ date, level: (level / base) * 100 });
  }
  return out;
}

/** Difference of two returns (0.012 = 1,2 percentage points); `null` without a comparison. */
export const returnGap = (own: number, other: number | null): number | null =>
  other === null ? null : own - other;
