import { mulDivRound } from './int';
import {
  PLATFORM_LIMITED_KINDS,
  SINGLE_TITLE_KINDS,
  SPECULATIVE_KINDS,
  type SecurityKind,
} from './types';

/** Optional metadata; no inference from names or asset-class labels. Leverage is in tenths. */
export interface RiskMetadata {
  kind: SecurityKind;
  leverageFactor?: number;
  speculativeOverride?: boolean | null;
  derivative?: boolean;
}

/**
 * 1x ETF/fund is diversified. Leverage >1x or derivative metadata makes any product speculative
 * and single-title limited. An explicit speculative override affects R15 only; platform limits
 * remain specific to crypto/P2P. Unknown kind/class is not automatically speculative.
 */
export function classifyRisk(p: RiskMetadata) {
  const complex = (p.leverageFactor ?? 10) > 10 || p.derivative === true;
  return {
    speculative: p.speculativeOverride ?? (complex || SPECULATIVE_KINDS.has(p.kind)),
    single: complex || SINGLE_TITLE_KINDS.has(p.kind),
    platform: PLATFORM_LIMITED_KINDS.has(p.kind),
  };
}

/** Gross/economic exposure, rounded once per holding before weighted class splits. */
export function grossExposureCents(p: {
  valueCents: number;
  leverageFactor?: number;
  grossExposureCents?: number;
}): number {
  if (p.grossExposureCents !== undefined) return p.grossExposureCents;
  return mulDivRound(Math.abs(p.valueCents), p.leverageFactor ?? 10, 10);
}
