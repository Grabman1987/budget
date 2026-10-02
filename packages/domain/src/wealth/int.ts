/**
 * Integer helpers of the wealth and debt domain. Products of cents and basis points can pass
 * 2^53 (a 1 000 000 000,00 € portfolio times 10 000), so every such product goes through BigInt.
 * `shareBps` is exported for the read models (platform and position shares).
 */

/** `a * b / d` rounded half up (away from zero for negatives) with an exact BigInt product. `d > 0`. */
export function mulDivRound(a: number, b: number, d: number): number {
  if (d <= 0) throw new RangeError(`divisor must be positive, got ${String(d)}`);
  const bn = BigInt(a) * BigInt(b);
  const bd = BigInt(d);
  // Integer division truncates: floor(d / 2) rounds the remainder half up.
  // Rounding this offset up biases odd divisors and adds a whole unit for d = 1.
  const half = bd / 2n;
  const q = bn >= 0n ? (bn + half) / bd : -((-bn + half) / bd);
  return Number(q);
}

/** Basis points of `value` in `total` (10 000 = 100 %), rounded half up. 0 when `total` is 0. */
export function ratioBp(value: number, total: number): number {
  return total > 0 ? mulDivRound(value, 10_000, total) : 0;
}

/**
 * Shares of `total` in basis points that add up to exactly 10 000 (largest remainder). Ties go to
 * the earlier entry, so the result is stable for a given order. All zeros when `total` is 0.
 */
export function shareBps(values: ReadonlyArray<number>, total: number): number[] {
  if (total <= 0 || values.length === 0) return values.map(() => 0);
  const bt = BigInt(total);
  const floors: number[] = [];
  const rems: bigint[] = [];
  for (const v of values) {
    const num = BigInt(v) * 10_000n;
    floors.push(Number(num / bt));
    rems.push(num % bt);
  }
  let missing = 10_000 - floors.reduce((a, b) => a + b, 0);
  const order = rems
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (missing <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    missing -= 1;
  }
  return floors;
}

/** Exact `|value / total - targetBp / 10 000| > limitBp / 10 000`. */
export function deviatesMoreThan(
  value: number,
  total: number,
  targetBp: number,
  limitBp: number,
): boolean {
  const dev = BigInt(value) * 10_000n - BigInt(targetBp) * BigInt(total);
  const abs = dev < 0n ? -dev : dev;
  return abs > BigInt(limitBp) * BigInt(total);
}
