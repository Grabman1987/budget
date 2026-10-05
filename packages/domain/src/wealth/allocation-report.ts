import { allocationStatus, type ClassTarget } from './allocation';
import type { WealthPosition } from './types';

/**
 * Pure helpers of report 4.2 (Allocation): the region split of a position and the Soll/Ist of the
 * asset classes over time. The timeline reuses `allocationStatus` (R13), so the report shows
 * exactly the shares and band breaches of Vermögen.
 */

/** Region key of the part of a position without a region weight. */
export const NO_REGION = '';

/** Region weights stored on a security: `{ "Europa": 0.3 }` (shares of 1). */
export type RegionWeights = Readonly<Record<string, number>>;

const SCALE = 1_000_000;

/**
 * Reads the stored JSON. Valid weights are finite and not negative and add up to at most 1; any
 * other content is "no region data" (`null`), never a guess.
 */
export function parseRegionWeights(json: string | null | undefined): RegionWeights | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const out: Record<string, number> = {};
  let sum = 0;
  for (const [region, weight] of Object.entries(parsed)) {
    if (
      region === NO_REGION ||
      typeof weight !== 'number' ||
      !Number.isFinite(weight) ||
      weight < 0
    )
      return null;
    out[region] = weight;
    sum += Math.round(weight * SCALE);
  }
  if (sum > SCALE || Object.keys(out).length === 0) return null;
  return out;
}

/**
 * Splits a value in cents over the regions of a security. The parts add up to the value exactly
 * (largest remainder, ties by input order); the part of weight 1 minus the sum goes to
 * `NO_REGION`, and a security without region data is entirely `NO_REGION`.
 */
export function splitByRegion(
  valueCents: number,
  weights: RegionWeights | null,
): Array<{ region: string; valueCents: number }> {
  if (valueCents <= 0) return [];
  if (!weights) return [{ region: NO_REGION, valueCents }];
  const entries = Object.entries(weights).map(([region, w]) => ({
    region,
    micro: Math.round(w * SCALE),
  }));
  const rest = SCALE - entries.reduce((a, e) => a + e.micro, 0);
  if (rest > 0) entries.push({ region: NO_REGION, micro: rest });
  const total = BigInt(valueCents);
  const parts = entries.map((e) => {
    const num = total * BigInt(e.micro);
    return { region: e.region, cents: Number(num / BigInt(SCALE)), rem: num % BigInt(SCALE) };
  });
  let missing = valueCents - parts.reduce((a, p) => a + p.cents, 0);
  const order = parts
    .map((p, i) => ({ rem: p.rem, i }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const { i } of order) {
    if (missing <= 0) break;
    (parts[i] as { cents: number }).cents += 1;
    missing -= 1;
  }
  return parts.filter((p) => p.cents > 0).map((p) => ({ region: p.region, valueCents: p.cents }));
}

export interface AllocationSnapshot {
  date: string;
  positions: ReadonlyArray<WealthPosition>;
  /** The Soll valid on that day (versioned targets). */
  targets: ReadonlyArray<ClassTarget>;
  bandPolicy?: Parameters<typeof allocationStatus>[2];
}

export interface ClassTimeline {
  /** Asset class id; `''` for positions without a class. */
  assetClass: string;
  /** Actual share in bp per snapshot (0 on a day without value). */
  istBp: number[];
  valueCents: number[];
  /** `null` on days where the class has no Soll. */
  targetBp: Array<number | null>;
  bandBp: Array<number | null>;
  /** Outside the R13 band on that day. */
  breach: boolean[];
}

export interface AllocationTimeline {
  dates: string[];
  /** Portfolio value per snapshot; a day with 0 has no meaningful shares. */
  totalCents: number[];
  classes: ClassTimeline[];
}

/**
 * Soll/Ist of every asset class on a list of days. Classes appear in order of first appearance
 * (targets before positions); a class missing on a day has share 0 and no Soll that day.
 */
export function allocationTimeline(
  snapshots: ReadonlyArray<AllocationSnapshot>,
): AllocationTimeline {
  const keys: string[] = [];
  const statuses = snapshots.map((snap) => {
    const status = allocationStatus(snap.positions, snap.targets, snap.bandPolicy);
    for (const row of status.rows) if (!keys.includes(row.assetClass)) keys.push(row.assetClass);
    return status;
  });
  const classes = keys.map((key): ClassTimeline => {
    const rows = statuses.map((s) => s.rows.find((r) => r.assetClass === key));
    return {
      assetClass: key,
      istBp: rows.map((r) => r?.shareBp ?? 0),
      valueCents: rows.map((r) => r?.valueCents ?? 0),
      targetBp: rows.map((r) => r?.targetBp ?? null),
      bandBp: rows.map((r) => r?.bandBp ?? null),
      breach: rows.map((r) => r?.breach ?? false),
    };
  });
  return {
    dates: snapshots.map((s) => s.date),
    totalCents: statuses.map((s) => s.totalCents),
    classes,
  };
}

/** Composition charts show positive classified assets; signed cash remains in risk policy. */
export function allocationChartPositions(positions: ReadonlyArray<WealthPosition>) {
  return positions.filter(
    (p) =>
      p.valueCents > 0 &&
      p.assetClass != null &&
      !(p.securityId?.startsWith('cash:') && p.kind !== 'p2p'),
  );
}
