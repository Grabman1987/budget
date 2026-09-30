/**
 * Exact decimal text to scaled integers, for market data (prices and FX rates in micro-units).
 * Hand-written on BigInt: a quote never passes through a float, so what the provider printed is
 * what is stored (rounded once, half away from zero, when it has more decimals than the scale).
 */

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** Integer division of `n >= 0` by `d > 0`, rounded half up. */
const divRound = (n: bigint, d: bigint): bigint => (2n * n + d) / (2n * d);

/**
 * `text` (plain decimal point, optional sign and exponent: `85.12`, `-0.5`, `1e-05`) times
 * 10^`decimals` as a safe integer, rounded half away from zero. Throws a `RangeError` for text
 * that is not a decimal number or does not fit a safe integer.
 */
export function parseScaledDecimal(text: string, decimals: number): number {
  const match = DECIMAL.exec(text.trim());
  if (!match) throw new RangeError('Not a decimal number');
  const [, sign = '', whole = '0', fraction = '', exponent = '0'] = match;
  const shift = Number(exponent) - fraction.length + decimals;
  if (!Number.isSafeInteger(shift) || Math.abs(shift) > 60)
    throw new RangeError('Exponent too large');
  const digits = BigInt(whole + fraction);
  const scaled =
    shift >= 0 ? digits * 10n ** BigInt(shift) : divRound(digits, 10n ** BigInt(-shift));
  const value = Number(sign === '-' ? -scaled : scaled);
  if (!Number.isSafeInteger(value)) throw new RangeError('Number too large');
  return value;
}

/** A price or rate as micro-units (1,234567 = 1234567). */
export const parseMicro = (text: string): number => parseScaledDecimal(text, 6);

/**
 * EUR per one unit of a foreign currency (micro) from the ECB quotation "units of currency per
 * EUR" (micro): 1 / x, computed as 10^12 / x on integers and rounded half up once. A quotation
 * that would round to less than one micro-unit of EUR is refused (the stored rate must be > 0).
 */
export function invertRateMicro(unitsPerEurMicro: number): number {
  if (!Number.isSafeInteger(unitsPerEurMicro) || unitsPerEurMicro <= 0)
    throw new RangeError('Rate must be a positive integer (micro-units)');
  const rate = Number(divRound(10n ** 12n, BigInt(unitsPerEurMicro)));
  if (rate < 1) throw new RangeError('Inverted rate is below one micro-unit');
  return rate;
}
