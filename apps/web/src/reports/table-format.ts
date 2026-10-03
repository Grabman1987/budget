import { formatPrivateEuro as formatEuro } from '@budget/ui';
import { cents, formatPercent, MINUS, type Period } from '@budget/domain';

/** Short month names of the table headers (de-AT). */
export const MONTH_SHORT = [
  'Jän',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
] as const;

const MONTH_LONG = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

const monthIndex = (month: string): number => Number(month.slice(5, 7)) - 1;

/** `Okt 23` (with the year) or `Okt`. */
export const monthShort = (month: string, withYear = true): string =>
  `${MONTH_SHORT[monthIndex(month)] ?? ''}${withYear ? ` ${month.slice(2, 4)}` : ''}`;

/** `Oktober 2023` */
export const monthLong = (month: string): string =>
  `${MONTH_LONG[monthIndex(month)] ?? ''} ${month.slice(0, 4)}`;

/** Whole euros as a plain figure for table cells: `1.234`, `−56`. The unit is in the heading. */
export const euroNumber = (valueCents: number): string =>
  formatEuro(cents(valueCents), { cents: false }).replace(/ €$/, '');

/** Basis points as a whole percent: `50 %`, `−12 %`; `sign` adds `+`. */
export function percentWhole(bp: number, sign = false): string {
  const n = Math.round(Math.abs(bp) / 100);
  return `${n === 0 ? '' : bp < 0 ? MINUS : sign ? '+' : ''}${n} %`;
}

/** Basis points with one decimal: `12,3 %`; `sign` adds `+`. */
export const percentTenth = (bp: number, sign = false): string => formatPercent(bp, sign);

/** The window of a Zeitraum in words, as the report heading shows it. */
export function periodName(period: Period, window: ReadonlyArray<string>): string {
  const first = window[0];
  const last = window[window.length - 1];
  if (first === undefined || last === undefined) return '';
  switch (period) {
    case '1M':
      return monthLong(last);
    case '3M':
      return 'letzte 3 Monate';
    case 'YTD':
      return first === last
        ? monthLong(last)
        : `${MONTH_SHORT[monthIndex(first)] ?? ''}–${MONTH_SHORT[monthIndex(last)] ?? ''} ${last.slice(0, 4)}`;
    case '1J':
      return 'letzte 12 Monate';
    case '3J':
      return 'letzte 3 Jahre';
    default:
      if (period.includes('..')) return `${monthLong(first)} bis ${monthLong(last)}`;
      return `seit ${monthShort(first)}`;
  }
}
