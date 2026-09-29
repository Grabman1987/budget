import type { Cents } from './cents';

/** Real minus sign (U+2212). A hyphen-minus is never shown to the user. */
export const MINUS = '\u2212';

export interface FormatEuroOptions {
  /** Show cents. Default true; KPIs pass false, lists keep cents. */
  cents?: boolean;
  /** Prefix positive amounts with "+" (signed changes, incomes). */
  sign?: boolean;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** de-AT: `1.234,56 €`, real minus, optional `+`, optional no-cents (rounded half away from zero). */
export function formatEuro(value: Cents, options: FormatEuroOptions = {}): string {
  const { cents: showCents = true, sign = false } = options;
  const abs = Math.abs(value);
  let body: string;
  let isZero: boolean;
  if (showCents) {
    const whole = Math.trunc(abs / 100);
    const fraction = String(abs % 100).padStart(2, '0');
    body = `${group(String(whole))},${fraction}`;
    isZero = abs === 0;
  } else {
    const euros = Math.trunc(abs / 100) + (abs % 100 >= 50 ? 1 : 0);
    body = group(String(euros));
    isZero = euros === 0;
  }
  const prefix = isZero ? '' : value < 0 ? MINUS : sign ? '+' : '';
  return `${prefix}${body} €`;
}

/** Amount field text: German decimals with grouping, no currency sign (`1.234,56`, `−0,05`). */
export function formatDecimal(value: Cents): string {
  return formatEuro(value).replace(/ €$/, '');
}
