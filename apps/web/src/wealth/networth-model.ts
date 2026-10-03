import { privateAmount } from '@budget/ui';
import type { ChainTerm, NetWorthWindow, Period } from '@budget/domain';
import { cents } from '@budget/domain';

const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monthShort = (day: string) => MONTHS[Number(day.slice(5, 7)) - 1] ?? '';

/** "seit Jahresbeginn", "letzte 3 Monate", ... next to the change in the head of the page. */
export function periodText(period: Period, from: string): string {
  switch (period) {
    case 'YTD':
      return 'seit Jahresbeginn';
    case '1M':
      return 'letzter Monat';
    case '3M':
      return 'letzte 3 Monate';
    case '1J':
      return 'letzte 12 Monate';
    case '3J':
      return 'letzte 3 Jahre';
    default:
      if (period.includes('..')) return period.replace('..', ' bis ');
      return `seit ${monthShort(from)} ${from.slice(0, 4)}`;
  }
}

/** Maßkette of the window: Anfang + Eigenleistung + Markt = jetzt (a loss is subtracted). */
export function chainTerms(window: Omit<NetWorthWindow, 'deltaCents'>, from: string): ChainTerm[] {
  const part = (label: string, value: number): ChainTerm => ({
    label,
    value: cents(Math.abs(value)),
    op: value >= 0 ? '+' : '-',
  });
  return [
    { label: `Anfang ${monthShort(from)} ${from.slice(0, 4)}`, value: cents(window.startCents) },
    part('Eigenleistung', window.ownCents),
    part('Markt', window.marketCents),
    { label: 'jetzt', value: cents(window.nowCents), op: '=', result: true },
  ];
}

/** Round axis values between `lo` and `hi` (about `n` of them), as the prototype picks them. */
export function yTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((x) => x >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) out.push(v);
  return out;
}

const whole = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });

/** Axis label: thousands as "80 T". */
export const kfmt = (v: number): string =>
  privateAmount(Math.abs(v) >= 1000 ? `${whole.format(v / 1000)} T` : whole.format(v));

/** Month starts on the x axis (index into `days`, never the first day), thinned to fit `width`. */
export function monthTicks(
  days: ReadonlyArray<string>,
  width: number,
): { index: number; day: string }[] {
  const starts = days
    .map((day, index) => ({ day, index }))
    .filter(({ day, index }) => index > 0 && day.endsWith('-01'));
  const step = Math.max(1, Math.ceil(starts.length / Math.max(2, Math.floor(width / 70))));
  return starts.filter((_, j) => j % step === 0);
}

/** Label of a month tick: "Mai", January with the year ("Jän 26"). */
export const monthTickLabel = (day: string): string =>
  `${monthShort(day)}${day.slice(5, 7) === '01' ? ` ${day.slice(2, 4)}` : ''}`;
