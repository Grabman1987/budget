import { privateAmount } from '@budget/ui';
import { MINUS } from '@budget/domain';
import { eur, longDay } from '../ledger/format';
import type { PositionQuote, PositionAccount } from '@budget/db';
export const basisReason = (accounts: readonly PositionAccount[]) =>
  accounts.some((account) => account.basisStatus === 'missing_fx')
    ? 'Wechselkurs für Einstand fehlt'
    : 'Einstand nicht vollständig dokumentiert';
/** Formatting at the edge only; all valuation, basis, gain and shares arrive from the server. */
function scaledText(value: number | bigint, digits: number, minimum = 0) {
  const raw = BigInt(value);
  const absolute = raw < 0n ? -raw : raw;
  const scale = 10n ** BigInt(digits);
  const whole = (absolute / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let fraction = (absolute % scale).toString().padStart(digits, '0');
  while (fraction.length > minimum && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return `${raw < 0n ? MINUS : ''}${whole}${fraction ? `,${fraction}` : ''}`;
}
export const unitsText = (value: number) => scaledText(value, 8);
/** Round only the list label; exact units and server valuation remain untouched. */
function compactScaledText(value: number, digits: number, shownDigits: number, minimum = 0) {
  const raw = BigInt(value);
  const absolute = raw < 0n ? -raw : raw;
  const quantum = 10n ** BigInt(digits - shownDigits);
  const rounded = ((absolute + quantum / 2n) / quantum) * quantum;
  if (absolute !== 0n && rounded === 0n) {
    const limit = scaledText(quantum, digits, shownDigits);
    return raw < 0n ? `>${MINUS}${limit}` : `<${limit}`;
  }
  return scaledText(raw < 0n ? -rounded : rounded, digits, minimum);
}
export const unitsDisplayText = (value: number) => privateAmount(compactScaledText(value, 8, 4));
export const percentText = (bp: number | null, signed = false) =>
  bp === null
    ? '—'
    : `${bp < 0 ? MINUS : signed && bp > 0 ? '+' : ''}${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(bp) / 100)} %`;
export const moneyText = (value: number | null) => (value === null ? '—' : eur(value));
export const quoteText = (quote: PositionQuote | null) =>
  quote
    ? `${privateAmount(scaledText(quote.priceMicro, 6, 2))} ${quote.currency === 'EUR' ? '€' : quote.currency}`
    : 'Kurs fehlt';
export const quoteDisplayText = (quote: PositionQuote | null) =>
  quote
    ? `${privateAmount(compactScaledText(quote.priceMicro, 6, 4, 2))} ${quote.currency === 'EUR' ? '€' : quote.currency}`
    : 'Kurs fehlt';
export const SOURCE_TEXT: Record<string, string> = {
  manual: 'manuell',
  import: 'übertragen',
  ariva: 'Kursabruf',
  coingecko: 'Kursabruf',
  cryptocalc: 'Ersatzquelle',
  yfinance: 'Ersatzquelle',
};
export const quoteStand = (quote: PositionQuote | null) =>
  quote
    ? `${longDay(quote.date)} · ${SOURCE_TEXT[quote.source] ?? 'gespeichert'}`
    : 'Kein gespeicherter Kurs';
