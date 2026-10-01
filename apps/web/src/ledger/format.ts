import { cents, formatEuro, MINUS, type FormatEuroOptions } from '@budget/domain';

export { MINUS };

/** Money at the edge: `1.234,56 €` with the real minus sign. */
export const eur = (value: number, options?: FormatEuroOptions) =>
  formatEuro(cents(value), options);

/** Whole-euro figure without cents, for overview sums. */
export const eurWhole = (value: number, sign = false) =>
  formatEuro(cents(value), { cents: false, sign });

/** Exact lead figure split into grouped whole euros and cents, from one de-AT formatting pass. */
export const eurParts = (value: number) => {
  const [whole = '0', fraction = '00'] = eur(value).replace(/ €$/, '').split(',');
  return { whole, fraction };
};

const WEEKDAY = new Intl.DateTimeFormat('de-AT', { weekday: 'short', timeZone: 'UTC' });
const at = (day: string) => new Date(`${day}T00:00:00Z`);

/** `17.09.` */
export const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
/** `17.09.2026` */
export const longDay = (day: string) => `${shortDay(day)}${day.slice(0, 4)}`;
/** `Do 17.09.` — heading of a day group. */
export const dayHeading = (day: string) =>
  `${WEEKDAY.format(at(day)).replace('.', '')} ${shortDay(day)}`;

const MONTHS = [
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
];
export const monthName = (day: string) => MONTHS[Number(day.slice(5, 7)) - 1] ?? '';

/** Tick label `1. Juli` for a month start on a chart axis. */
export const monthStartLabel = (day: string) => `1. ${monthName(day)}`;

export const pluralBookings = (n: number) => `${n} ${n === 1 ? 'Buchung' : 'Buchungen'}`;
