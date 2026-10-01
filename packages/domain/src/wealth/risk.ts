import { mulDivRound, ratioBp } from './int';
import {
  PLATFORM_LIMITED_KINDS,
  SINGLE_TITLE_KINDS,
  SPECULATIVE_KINDS,
  type WealthPosition,
} from './types';

export const SINGLE_TITLE_LIMIT_BP = 1000;
export const PLATFORM_LIMIT_BP = 2000;
export const SPECULATIVE_LIMIT_BP = 1000;

export interface ClusterLimits {
  singleBp: number;
  platformBp: number;
}

export interface ClusterEntry {
  /** Security id (single title) or platform id. */
  id: string;
  valueCents: number;
  shareBp: number;
  breach: boolean;
}

export interface ClusterRisk {
  totalCents: number;
  limits: ClusterLimits;
  /** Single titles (stock, bond, crypto; one security on several platforms summed), largest first. */
  singles: ClusterEntry[];
  /** Crypto and P2P platforms, largest first. */
  platforms: ClusterEntry[];
  largestSingle: ClusterEntry | null;
  breach: boolean;
}

/** Exact `value / total > limit / 10 000`. */
const above = (value: number, total: number, limitBp: number): boolean =>
  BigInt(value) * 10_000n > BigInt(limitBp) * BigInt(total);

function groupSum(
  positions: ReadonlyArray<WealthPosition>,
  keyOf: (p: WealthPosition) => string | null,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of positions) {
    const key = keyOf(p);
    if (key !== null) map.set(key, (map.get(key) ?? 0) + p.valueCents);
  }
  return map;
}

function entries(map: Map<string, number>, total: number, limitBp: number): ClusterEntry[] {
  return [...map.entries()]
    .map(([id, valueCents]) => ({
      id,
      valueCents,
      shareBp: ratioBp(valueCents, total),
      breach: total > 0 && above(valueCents, total, limitBp),
    }))
    .sort((a, b) => b.valueCents - a.valueCents || a.id.localeCompare(b.id));
}

/**
 * R14 cluster risk: one single title at most 10 % of the investment, one crypto or P2P platform
 * at most 20 %. Kinds decide what a single title is (`SINGLE_TITLE_KINDS`), never the name.
 */
export function clusterRisk(
  positions: ReadonlyArray<WealthPosition>,
  limits: Partial<ClusterLimits> = {},
): ClusterRisk {
  const lim: ClusterLimits = {
    singleBp: limits.singleBp ?? SINGLE_TITLE_LIMIT_BP,
    platformBp: limits.platformBp ?? PLATFORM_LIMIT_BP,
  };
  const totalCents = positions.reduce((a, p) => a + p.valueCents, 0);
  const singles = entries(
    groupSum(positions, (p) => (SINGLE_TITLE_KINDS.has(p.kind) ? (p.securityId ?? p.id) : null)),
    totalCents,
    lim.singleBp,
  );
  const platforms = entries(
    groupSum(positions, (p) => (PLATFORM_LIMITED_KINDS.has(p.kind) ? (p.platform ?? null) : null)),
    totalCents,
    lim.platformBp,
  );
  return {
    totalCents,
    limits: lim,
    singles,
    platforms,
    largestSingle: singles[0] ?? null,
    breach: singles.some((e) => e.breach) || platforms.some((e) => e.breach),
  };
}

export interface SpeculativeShare {
  totalCents: number;
  valueCents: number;
  shareBp: number;
  limitBp: number;
  /** Cents above the limit (0 when within). */
  overCents: number;
  breach: boolean;
}

/** R15: crypto, P2P and single stocks together at most 10 % of the investment. */
export function speculativeShare(
  positions: ReadonlyArray<WealthPosition>,
  limitBp: number = SPECULATIVE_LIMIT_BP,
): SpeculativeShare {
  const totalCents = positions.reduce((a, p) => a + p.valueCents, 0);
  const valueCents = positions
    .filter((p) => SPECULATIVE_KINDS.has(p.kind))
    .reduce((a, p) => a + p.valueCents, 0);
  const limitCents = mulDivRound(totalCents, limitBp, 10_000);
  return {
    totalCents,
    valueCents,
    shareBp: ratioBp(valueCents, totalCents),
    limitBp,
    overCents: Math.max(0, valueCents - limitCents),
    breach: totalCents > 0 && above(valueCents, totalCents, limitBp),
  };
}
