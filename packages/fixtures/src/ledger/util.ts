/** Small deterministic helpers for the fixture builder. */

/** Mulberry32: tiny seeded PRNG (independent of the prototype's global random sequence). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string, used to seed per-item streams. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const cents = (euros: number): number => Math.round(euros * 100);

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const lastDayOfMonth = (year: number, month0: number): number =>
  new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

/** `YYYY-MM-DD` for a zero-based month; the day is clamped to the month length. */
export const isoDate = (year: number, month0: number, day: number): string =>
  `${year}-${pad2(month0 + 1)}-${pad2(Math.min(day, lastDayOfMonth(year, month0)))}`;

/**
 * Largest-remainder allocation of an integer total by weights: the parts are integers, add up to
 * the total exactly and follow the weights as closely as integers allow.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map((x) => Math.floor(x));
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let n = 0; rest > 0; n = (n + 1) % order.length, rest--) {
    const slot = order[n];
    if (slot) parts[slot.i] = (parts[slot.i] ?? 0) + 1;
  }
  return parts;
}

const UMLAUTS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  Ä: 'ae',
  Ö: 'oe',
  Ü: 'ue',
};
export const slug = (text: string): string =>
  text
    .replace(/[äöüßÄÖÜ]/g, (c) => UMLAUTS[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
