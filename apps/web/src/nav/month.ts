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
