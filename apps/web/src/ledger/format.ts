import { cents, formatEuro, MINUS, type FormatEuroOptions } from '@budget/domain';

export { MINUS };

/** Money at the edge: `1.234,56 €` with the real minus sign. */
export const eur = (value: number, options?: FormatEuroOptions) =>
  formatEuro(cents(value), options);

/** Whole-euro figure without cents, for overview sums. */
export const eurWhole = (value: number, sign = false) =>
  formatEuro(cents(value), { cents: false, sign });

/** Native money display only: no exchange-rate calculation. */
const nativeMoney = (valueCents: number, currency: string, sign: boolean, whole: boolean) => {
  if (currency === 'EUR') return eur(valueCents, { cents: !whole, sign });
  const amount = new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(Math.abs(valueCents) / 100);
  const prefix = valueCents < 0 ? MINUS : sign ? '+' : '';
  return `${prefix}${amount}`;
};
/** Exact native currency with cents for individual movements. */
export const nativeCurrency = (valueCents: number, currency: string, sign = false) =>
  nativeMoney(valueCents, currency, sign, false);
/** Whole-unit native currency for overview side values such as a limit or account movement. */
export const nativeCurrencyWhole = (valueCents: number, currency: string, sign = false) =>
  nativeMoney(valueCents, currency, sign, true);

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
