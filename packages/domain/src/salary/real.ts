import { monthsBetween } from '../date';
import { divRound, mulDiv } from './math';
import { baseLevelMonths, type SalaryMonth } from './series';

/**
 * Real against nominal development (#1066) for any monthly price index: the official consumer
 * price index (`consumer_price_index.index_micro`) or the personal inflation index (4 decimals,
 * passed as micro units). Indices may have any base; they are rebased to the start month.
 *
 * Per month with value v, start value v0, index I and start index I0:
 * nominal = v / v0, prices = I / I0, real = (v × I0) / (v0 × I); the gap in cents is
 * v − v0 × I / I0 (positive: ahead of prices). All ratios are exact BigInt quotients rounded once,
 * half away from zero, to micro units (1 000 000 = 100 %), basis points or cents.
 */
export interface PriceIndexPoint {
  month: string;
  /** Index level in micro units, any base. */
  indexMicro: number | bigint;
}
export interface MonthValue {
  month: string;
  cents: number;
}
export interface RealPoint {
  month: string;
  /** Null for a gap (no value or no index): never filled in. */
  valueCents: number | null;
  nominalIndexMicro: number | null;
  priceIndexMicro: number | null;
  realIndexMicro: number | null;
  /** Real change since the start month, in basis points. */
  realChangeBp: number | null;
  /** Start value carried forward with prices. */
  priceAdjustedCents: number | null;
  /** valueCents − priceAdjustedCents. */
  gapCents: number | null;
}
export interface RealYear {
  year: string;
  /** Months of the year with value and index. */
  months: number;
  /** Sum of the monthly gaps of the year (cents per year). */
  gapCents: number;
  /** Cumulative real change at the year's last available month, in basis points. */
  realChangeBp: number | null;
  lastMonth: string | null;
}
export interface RealDevelopment {
  startMonth: string;
  points: RealPoint[];
  years: RealYear[];
}

export function realDevelopment(input: {
  values: readonly MonthValue[];
  index: readonly PriceIndexPoint[];
  startMonth: string;
  endMonth?: string;
}): RealDevelopment | null {
  const values = new Map(input.values.map((v) => [v.month, BigInt(v.cents)]));
  // Only positive integer index levels count; anything else is a missing point, never repaired.
  const index = new Map(
    input.index
      .filter((p) =>
        typeof p.indexMicro === 'bigint'
          ? p.indexMicro > 0n
          : Number.isSafeInteger(p.indexMicro) && p.indexMicro > 0,
      )
      .map((p) => [p.month, BigInt(p.indexMicro)]),
  );
  const v0 = values.get(input.startMonth),
    i0 = index.get(input.startMonth);
  if (!v0 || v0 <= 0n || !i0 || i0 <= 0n) return null;
  const end =
    input.endMonth ??
    [...values.keys()]
      .filter((m) => m >= input.startMonth)
      .sort()
      .at(-1) ??
    input.startMonth;
  const points: RealPoint[] = monthsBetween(input.startMonth, end).map((month) => {
    const v = values.get(month),
      i = index.get(month);
    if (v === undefined || i === undefined || i <= 0n)
      return {
        month,
        valueCents: v === undefined ? null : Number(v),
        nominalIndexMicro: null,
        priceIndexMicro: null,
        realIndexMicro: null,
        realChangeBp: null,
        priceAdjustedCents: null,
        gapCents: null,
      };
    const priceAdjusted = mulDiv(v0, i, i0);
    return {
      month,
      valueCents: Number(v),
      nominalIndexMicro: mulDiv(v, 1_000_000n, v0),
      priceIndexMicro: mulDiv(i, 1_000_000n, i0),
      realIndexMicro: Number(divRound(v * i0 * 1_000_000n, v0 * i)),
      realChangeBp: Number(divRound((v * i0 - v0 * i) * 10_000n, v0 * i)),
      priceAdjustedCents: priceAdjusted,
      gapCents: Number(v) - priceAdjusted,
    };
  });
  const years = [...new Set(points.map((p) => p.month.slice(0, 4)))].map((year) => {
    const known = points.filter((p) => p.month.startsWith(year) && p.gapCents !== null);
    const last = known.at(-1);
    return {
      year,
      months: known.length,
      gapCents: known.reduce((n, p) => n + p.gapCents!, 0),
      realChangeBp: last?.realChangeBp ?? null,
      lastMonth: last?.month ?? null,
    };
  });
  return { startMonth: input.startMonth, points, years };
}

/**
 * Base salary level (without back pay) per reliable month: the lead figure for the real
 * comparison. Anchor it at `baseSalaryAnchor`: the first level supported by at least two months.
 */
export const baseSalaryValues = (series: readonly SalaryMonth[]): MonthValue[] =>
  baseLevelMonths(series).map((m) => ({ month: m.month, cents: m.baseLevelCents }));
/** Development total (base + special + variable) per comparable month. */
export const developmentValues = (series: readonly SalaryMonth[]): MonthValue[] =>
  series.filter((m) => m.comparable).map((m) => ({ month: m.month, cents: m.developmentCents }));
/**
 * Personal inflation index points (4 decimals, `personalInflation`) as micro units. The number is
 * read through its 4-decimal text and scaled by digits, without float multiplication; points that
 * are not finite and positive are left out (missing, never repaired).
 */
export const personalIndexMicro = (points: readonly { month: string; index: number }[]) =>
  points.flatMap((p) => {
    if (!Number.isFinite(p.index) || p.index <= 0) return [];
    const [whole, fraction = ''] = p.index.toFixed(4).split('.');
    const indexMicro = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
    return indexMicro > 0n ? [{ month: p.month, indexMicro }] : [];
  });
