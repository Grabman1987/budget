import { longDay } from '../ledger/format';

/** Formatting helpers shared by the Überblick reports (5.1, 5.2, 5.3, 5.5). German, de-AT. */

const MONTHS_SHORT = [
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
const MONTHS_LONG = [
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

const monthIndex = (month: string) => Number(month.slice(5, 7)) - 1;

/** `Sep` from `2026-09` or any day of it. */
export const monthShort = (month: string) => MONTHS_SHORT[monthIndex(month)] ?? '';
/** `Sep 26` */
export const monthShortYear = (month: string) => `${monthShort(month)} ${month.slice(2, 4)}`;
/** `September 2026` */
export const monthLong = (month: string) =>
  `${MONTHS_LONG[monthIndex(month)] ?? ''} ${month.slice(0, 4)}`;
/** `September` */
export const monthNameOnly = (month: string) => MONTHS_LONG[monthIndex(month)] ?? '';

/** `Q3 26` for a month. */
export const quarterLabel = (month: string) =>
  `Q${Math.floor(monthIndex(month) / 3) + 1} ${month.slice(2, 4)}`;

/** Percent from basis points with a decimal comma: 1250 → "12,5 %"; `null` → "–". */
export function bpText(bp: number | null, options: { sign?: boolean; decimals?: 0 | 1 } = {}) {
  if (bp === null) return '–';
  const decimals = options.decimals ?? 1;
  const abs = Math.abs(bp) / 100;
  const text = new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs);
  const sign = bp < 0 ? '−' : options.sign && bp > 0 ? '+' : '';
  return `${sign}${text} %`;
}

/** Whole numbers with thousands separator, real minus (tables without currency sign). */
export const wholeText = (value: number) =>
  `${value < 0 ? '−' : ''}${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 }).format(Math.abs(value))}`;

/** Whole euros from cents, grouped, without currency sign (compact table cells). */
export const euroCellText = (cents: number) => wholeText(Math.round(cents / 100));

export { longDay };
