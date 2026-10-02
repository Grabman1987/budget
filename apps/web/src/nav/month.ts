/** Month selection of the Heute and Plan pages: a `YYYY-MM` string in the URL (`?monat=`). */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const isMonth = (value: unknown): value is string =>
  typeof value === 'string' && MONTH.test(value);

export const monthOf = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** `delta` months before or after `month` (crosses year boundaries). */
export function shiftMonth(month: string, delta: number): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const label = new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' });

/** "September 2026". */
export function monthLabel(month: string): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  return label.format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
}

const short = new Intl.DateTimeFormat('de-AT', { month: 'short' });
const monthDate = (month: string) => {
  const match = MONTH.exec(month);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : null;
};

/** "Sep. – Nov. 2026" for `count` months from `month`; one month reads as `monthLabel`. */
export function monthRangeLabel(month: string, count: number): string {
  if (count <= 1) return monthLabel(month);
  const first = monthDate(month);
  const last = monthDate(shiftMonth(month, count - 1));
  if (!first || !last) return month;
  const year = (d: Date) => String(d.getFullYear());
  return first.getFullYear() === last.getFullYear()
    ? `${short.format(first)} – ${short.format(last)} ${year(last)}`
    : `${short.format(first)} ${year(first)} – ${short.format(last)} ${year(last)}`;
}
