import {
  addMonths,
  lastDayOfMonth,
  MAX_FREEDOM_MONTHS,
  type FreedomProjection,
} from '@budget/domain';
import type { FreedomHistoryPoint, FreedomInvestedHistory } from '@budget/db';

/** Drawing geometry only. Values remain the exact dated repository/projector samples. */
export function freedomHistoryModel(
  history: FreedomInvestedHistory | undefined,
  projection: FreedomProjection | null,
  startMonth: string,
) {
  const actual = history
    ? [
        ...history.monthEnds.filter((point) => point.date !== history.current.date),
        {
          ...history.current,
          investedCents:
            history.availableFrom !== null && history.current.date >= history.availableFrom
              ? history.current.investedCents
              : null,
        },
      ]
    : [];
  const segments: FreedomHistoryPoint[][] = [];
  let segment: FreedomHistoryPoint[] = [];
  for (const point of actual) {
    if (point.investedCents === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push(point);
  }
  if (segment.length) segments.push(segment);
  const months = projection?.months ?? MAX_FREEDOM_MONTHS;
  const forecast =
    projection?.yearlyPath.map((investedCents, i) => ({
      date:
        i === 0 && history
          ? history.current.date
          : lastDayOfMonth(addMonths(startMonth, Math.min(i * 12, months))),
      investedCents,
    })) ?? [];
  const dates = [...new Set([...actual, ...forecast].map((point) => point.date))].sort();
  const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const first = time(dates[0] ?? `${startMonth}-01`);
  const last = time(dates.at(-1) ?? `${startMonth}-01`);
  return {
    actual,
    segments,
    forecast,
    dates,
    position: (date: string) => (time(date) - first) / Math.max(86400000, last - first),
  };
}
