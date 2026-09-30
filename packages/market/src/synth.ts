import { addDays, daysBetween } from '@budget/domain';

/**
 * Deterministic synthetic daily series between known points ("anchors"): a seeded Brownian bridge
 * that hits every anchor exactly, and a seeded random walk before the first and after the last
 * one. Integer arithmetic only (BigInt), so the series is identical on every machine; nothing here
 * is real market data. Used by the fixture sources (seed, dev server, tests).
 */

export interface Anchor {
  date: string;
  value: number;
}

export interface SynthOptions {
  /** Makes the series of one security or currency differ from the next. */
  seed: string;
  /** Typical relative move per day in basis points. */
  volBp: number;
}

/** Standard deviation of one integer step (sum of three uniforms on -500..500, about 500). */
const STEP_SD = 500n;
const BP = 10_000n;

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32: a 32-bit integer generator, returns unsigned integers. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const step = (next: () => number): bigint =>
  BigInt((next() % 1001) - 500 + ((next() % 1001) - 500) + ((next() % 1001) - 500));

export const isWeekday = (day: string): boolean => {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6;
};

/** `a * b / c` rounded half away from zero (`c > 0`). */
function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
  const n = a * b;
  const abs = n < 0n ? -n : n;
  const q = (2n * abs + c) / (2n * c);
  return n < 0n ? -q : q;
}

const atLeastOne = (v: bigint): number => Number(v < 1n ? 1n : v);

/** Days of the bridge between two anchors: the first, the weekdays in between, the second. */
function segmentDays(a: Anchor, b: Anchor): string[] {
  const days = [a.date];
  for (let d = addDays(a.date, 1); d < b.date; d = addDays(d, 1)) if (isWeekday(d)) days.push(d);
  days.push(b.date);
  return days;
}

/** Bridge values of one segment, same length as `segmentDays`; both ends are the anchors. */
function bridge(a: Anchor, b: Anchor, opts: SynthOptions): number[] {
  const days = segmentDays(a, b);
  const n = days.length - 1;
  const next = generator(hash(`${opts.seed}|bridge|${a.date}`));
  const walk: bigint[] = [0n];
  for (let i = 1; i <= n; i++) walk.push((walk[i - 1] as bigint) + step(next));
  const total = walk[n] as bigint;
  return days.map((_, i) => {
    if (i === 0) return a.value;
    if (i === n) return b.value;
    const level = BigInt(a.value) + mulDiv(BigInt(b.value - a.value), BigInt(i), BigInt(n));
    // Bridge noise: (n * W_i - i * W_n) / n keeps both ends at zero.
    const b_i = BigInt(n) * (walk[i] as bigint) - BigInt(i) * total;
    const noise = mulDiv(level * BigInt(opts.volBp), b_i, BP * STEP_SD * BigInt(n));
    return atLeastOne(level + noise);
  });
}

/** The move of `day` against the previous weekday, in units of 1 / (BP * STEP_SD). */
function dayStep(day: string, opts: SynthOptions): bigint {
  return step(generator(hash(`${opts.seed}|walk|${day}`))) * BigInt(opts.volBp);
}

const nextWeekday = (day: string): string => {
  let d = addDays(day, 1);
  while (!isWeekday(d)) d = addDays(d, 1);
  return d;
};
const previousWeekday = (day: string): string => {
  let d = addDays(day, -1);
  while (!isWeekday(d)) d = addDays(d, -1);
  return d;
};

/**
 * Values on every weekday in `from`..`to` plus every anchor date in that range, ascending.
 * Between anchors the bridge, outside them the random walk continues from the nearest anchor.
 * `anchors` need not be sorted; the last of two on the same date wins.
 */
export function synthHistory(
  anchorList: readonly Anchor[],
  from: string,
  to: string,
  opts: SynthOptions,
): Anchor[] {
  const sorted = [...new Map(anchorList.map((a) => [a.date, a])).values()].sort((x, y) =>
    x.date < y.date ? -1 : 1,
  );
  if (sorted.length === 0 || from > to) return [];
  const first = sorted[0] as Anchor;
  const last = sorted[sorted.length - 1] as Anchor;
  const out = new Map<string, number>();
  const put = (date: string, value: number) => {
    if (date >= from && date <= to) out.set(date, value);
  };

  // Before the first anchor: walk backwards.
  if (from < first.date) {
    let date = first.date;
    let value = BigInt(first.value);
    while (true) {
      const previous = previousWeekday(date);
      if (previous < from) break;
      const s = dayStep(date, opts);
      value = BigInt(atLeastOne((value * BP * STEP_SD) / (BP * STEP_SD + s)));
      date = previous;
      put(date, Number(value));
    }
  }
  // Between anchors: the bridges.
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i] as Anchor;
    const b = sorted[i + 1] as Anchor;
    if (b.date < from || a.date > to) continue;
    const days = segmentDays(a, b);
    const values = bridge(a, b, opts);
    days.forEach((d, k) => put(d, values[k] as number));
  }
  for (const a of sorted) put(a.date, a.value);
  // After the last anchor: walk forwards.
  if (to > last.date) {
    let date = last.date;
    let value = BigInt(last.value);
    while (true) {
      date = nextWeekday(date);
      if (date > to || daysBetween(last.date, date) > 40_000) break;
      const s = dayStep(date, opts);
      value = BigInt(atLeastOne(value + mulDiv(value, s, BP * STEP_SD)));
      put(date, Number(value));
    }
  }
  return [...out].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
}
