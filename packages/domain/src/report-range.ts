import type { Period } from './invest/performance';
import { addDays, addMonths, lastDayOfMonth, monthsBetween } from './date';

/** Inclusive calendar-month range, carried in the existing period parameter. */
export type CalendarRange = `${string}..${string}`;
export const LEGACY_REPORT_PERIODS = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'] as const;

export function isCalendarRange(value: unknown): value is CalendarRange {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])\.\.\d{4}-(0[1-9]|1[0-2])$/.test(value))
    return false;
  const [from, to] = value.split('..') as [string, string];
  return (
    from >= '1900-01' &&
    from <= to &&
    to <= '9999-12' &&
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
      Number(to.slice(5)) -
      Number(from.slice(5)) <
      1200
  );
}

export function isReportPeriod(value: unknown): value is Period {
  return (
    LEGACY_REPORT_PERIODS.includes(value as (typeof LEGACY_REPORT_PERIODS)[number]) ||
    isCalendarRange(value)
  );
}

export function calendarRangeMonths(range: CalendarRange, first: string, last: string): string[] {
  const [from, to] = range.split('..') as [string, string];
  return monthsBetween(from > first ? from : first, to < last ? to : last);
}

/** Close before the first month is the start valuation; flows start on its first day. */
export function calendarRangeWindow(range: CalendarRange, today: string) {
  const [from, to] = range.split('..') as [string, string];
  return {
    from: addDays(`${from}-01`, -1),
    to: lastDayOfMonth(to) < today ? lastDayOfMonth(to) : today,
  };
}

export const REPORT_QUICK_OPTIONS = [
  ['current', 'Dieser Monat'],
  ['previous', 'Letzter Monat'],
  ['3', '3 Monate'],
  ['6', '6 Monate'],
  ['12', '12 Monate'],
  ['year', 'Dieses Jahr'],
  ['previousYear', 'Letztes Jahr'],
  ['all', 'Alles'],
  ['custom', 'Benutzerdefiniert'],
] as const;
export type ReportQuick = (typeof REPORT_QUICK_OPTIONS)[number][0];

export function quickReportPeriod(quick: Exclude<ReportQuick, 'custom'>, today: string): Period {
  const month = today.slice(0, 7);
  const last = addMonths(month, -1);
  const year = Number(today.slice(0, 4));
  switch (quick) {
    case 'all':
      return 'Alles';
    case 'current':
      return `${month}..${month}`;
    case 'previous':
      return `${last}..${last}`;
    case 'year':
      return `${year}-01..${month}`;
    case 'previousYear':
      return `${year - 1}-01..${year - 1}-12`;
    default:
      return `${addMonths(last, -(Number(quick) - 1))}..${last}`;
  }
}

/** Least-squares fit. Geometry only; never used to book or forecast money. */
export function linearTrend(
  points: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  if (points.length < 2 || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)))
    return [];
  const x0 = points[0]![0];
  const xs = points.map(([x]) => x - x0);
  const meanX = xs.reduce((a, x) => a + x, 0) / points.length;
  const meanY = points.reduce((a, p) => a + p[1], 0) / points.length;
  const variance = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  if (variance === 0) return [];
  const slope = points.reduce((a, p, i) => a + (xs[i]! - meanX) * (p[1] - meanY), 0) / variance;
  const at = (x: number): [number, number] => [x, meanY + slope * (x - x0 - meanX)];
  return [at(points[0]![0]), at(points[points.length - 1]![0])];
}
