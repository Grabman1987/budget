import { isCalendarRange } from '../report-range';
import type { Period } from '../invest/performance';

/** Period of the spending reports: the same six ranges as Vermögen, counted in full months. */
export type SpendingPeriod = Period;

export const SPENDING_PERIODS: ReadonlyArray<SpendingPeriod> = [
  '1M',
  '3M',
  'YTD',
  '1J',
  '3J',
  'Alles',
];

/**
 * The months of `period` out of `available` (ascending `YYYY-MM`, the last one is the last full
 * month). Months before the first booked month do not exist, so a window can be shorter than
 * named: the report says which range it really covers.
 */
export function windowMonths(period: SpendingPeriod, available: ReadonlyArray<string>): string[] {
  if (isCalendarRange(period)) {
    const [from, to] = period.split('..') as [string, string];
    return available.filter((m) => m >= from && m <= to);
  }
  const last = available[available.length - 1];
  if (last === undefined) return [];
  if (period === 'YTD') return available.filter((m) => m.startsWith(`${last.slice(0, 4)}-`));
  const count = { '1M': 1, '3M': 3, '1J': 12, '3J': 36, Alles: Infinity }[
    period as '1M' | '3M' | '1J' | '3J' | 'Alles'
  ];
  return available.slice(Number.isFinite(count) ? -count : 0);
}

/**
 * The equally long window right before `selected`, or `null` when the ledger does not reach back
 * far enough: a comparison against a shorter window would be misleading, so there is none.
 */
export function previousWindow(
  selected: ReadonlyArray<string>,
  available: ReadonlyArray<string>,
): string[] | null {
  const first = selected[0];
  if (first === undefined) return null;
  const at = available.indexOf(first);
  if (at < selected.length) return null;
  return available.slice(at - selected.length, at);
}

/**
 * Whole percentages (largest remainder) that add up to exactly 100 for non-negative parts.
 * All zeros when there is nothing to divide.
 */
export function wholePercents(parts: ReadonlyArray<number>): number[] {
  const total = parts.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return parts.map(() => 0);
  const exact = parts.map((p) => (Math.max(0, p) / total) * 100);
  const floors = exact.map(Math.floor);
  let missing = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (missing <= 0) break;
    floors[i] = (floors[i] as number) + 1;
    missing -= 1;
  }
  return floors;
}
