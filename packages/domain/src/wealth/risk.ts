import { mulDivRound, ratioBp } from './int';
import { type WealthPosition } from './types';
import { classifyRisk, grossExposureCents } from './classification';
import { PARAM_SCHEMAS } from '../rules/params';

export const SINGLE_TITLE_LIMIT_BP = PARAM_SCHEMAS.R14.parse({}).singleBp;
export const PLATFORM_LIMIT_BP = PARAM_SCHEMAS.R14.parse({}).platformBp;
export const SPECULATIVE_LIMIT_BP = PARAM_SCHEMAS.R15.parse({}).limitBp;

export interface ClusterLimits {
  singleBp: number;
  platformBp: number;
}

export interface ClusterEntry {
  /** Security id (single title) or platform id. */
  id: string;
  /** Market value, without leverage. */
  valueCents: number;
  /** Gross risk numerator; share/limits use this relative to portfolio market value. */
  grossExposureCents: number;
  shareBp: number;
  breach: boolean;
}

export interface ClusterRisk {
  totalCents: number;
  /** Gross economic exposure of all holdings, distinct from total market value. */
  totalGrossExposureCents: number;
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
): Map<string, { valueCents: number; grossExposureCents: number }> {
  const map = new Map<string, { valueCents: number; grossExposureCents: number }>();
  for (const p of positions) {
    const key = keyOf(p);
    if (key !== null) {
      const prior = map.get(key) ?? { valueCents: 0, grossExposureCents: 0 };
      map.set(key, {
        valueCents: prior.valueCents + p.valueCents,
        grossExposureCents: prior.grossExposureCents + grossExposureCents(p),
      });
    }
  }
  return map;
}

function entries(
  map: Map<string, { valueCents: number; grossExposureCents: number }>,
  total: number,
  limitBp: number,
): ClusterEntry[] {
  return [...map.entries()]
    .map(([id, values]) => ({
      id,
      ...values,
      shareBp: ratioBp(values.grossExposureCents, total),
      breach: total > 0 && above(values.grossExposureCents, total, limitBp),
    }))
    .sort((a, b) => b.grossExposureCents - a.grossExposureCents || a.id.localeCompare(b.id));
}

/**
 * R14 cluster risk: one single title at most 10 % of the investment, one crypto or P2P platform
 * at most 20 % by default. Central classification includes leveraged/derivative products.
 * Gross exposure is the numerator; market investment value is the denominator.
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
    groupSum(positions, (p) => (classifyRisk(p).single ? (p.securityId ?? p.id) : null)),
    totalCents,
    lim.singleBp,
  );
  const platforms = entries(
    groupSum(positions, (p) => (classifyRisk(p).platform ? (p.platform ?? null) : null)),
    totalCents,
    lim.platformBp,
  );
  return {
    totalCents,
    totalGrossExposureCents: positions.reduce((a, p) => a + grossExposureCents(p), 0),
    limits: lim,
    singles,
    platforms,
    largestSingle: singles[0] ?? null,
    breach: singles.some((e) => e.breach) || platforms.some((e) => e.breach),
  };
}

export interface SpeculativeShare {
  totalCents: number;
  /** Market value, without leverage. */
  valueCents: number;
  /** Gross risk numerator; share/limits use this relative to portfolio market value. */
  grossExposureCents: number;
  shareBp: number;
  limitBp: number;
  /** Cents above the limit (0 when within). */
  overCents: number;
  breach: boolean;
}

/** R15: classified speculative gross exposure relative to market investment value. */
export function speculativeShare(
  positions: ReadonlyArray<WealthPosition>,
  limitBp: number = SPECULATIVE_LIMIT_BP,
): SpeculativeShare {
  const totalCents = positions.reduce((a, p) => a + p.valueCents, 0);
  const valueCents = positions
    .filter((p) => classifyRisk(p).speculative)
    .reduce((a, p) => a + p.valueCents, 0);
  const gross = positions
    .filter((p) => classifyRisk(p).speculative)
    .reduce((a, p) => a + grossExposureCents(p), 0);
  const limitCents = mulDivRound(totalCents, limitBp, 10_000);
  return {
    totalCents,
    valueCents,
    grossExposureCents: gross,
    shareBp: ratioBp(gross, totalCents),
    limitBp,
    overCents: Math.max(0, gross - limitCents),
    breach: totalCents > 0 && above(gross, totalCents, limitBp),
  };
}
