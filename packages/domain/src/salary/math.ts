/**
 * Exact integer arithmetic of the salary module. Every ratio is computed with BigInt and rounded
 * once, half away from zero, to an integer unit (basis points, micro-index or cents). Display
 * formatting (percent with decimals, euro) happens at the display edge only.
 */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}
const toNumber = (value: bigint) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError('Value out of range');
  return n;
};
/** `numerator / denominator` in basis points (10 000 = 100 %); null without a denominator. */
export const ratioBp = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : toNumber(divRound(BigInt(numerator) * 10_000n, BigInt(denominator)));
/** Change from `from` to `to` in basis points; null when `from` is zero. */
export const changeBp = (from: number, to: number) => ratioBp(to - from, from);
/** `a × b / c` rounded to an integer (cents or micro units). */
export const mulDiv = (a: number | bigint, b: number | bigint, c: number | bigint): number =>
  toNumber(divRound(BigInt(a) * BigInt(b), BigInt(c)));
