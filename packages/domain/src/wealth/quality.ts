import { ratioBp } from './int';
import type { WealthPosition } from './types';

export type ProposalConfidence = 'exact' | 'provisional';
export interface AllocationQuality {
  valuationQuality: 'exact' | 'estimated' | 'incomplete';
  confidence: ProposalConfidence;
  classification: 'complete' | 'partial';
  unclassifiedValueCents: number | null;
  /** Absolute unknown exposure prevents negative cash from cancelling unknown holdings. */
  unclassifiedExposureCents: number | null;
  unclassifiedShareBp: number | null;
  unclassifiedProductCount: number;
  unclassifiedSecurityIds: string[];
  estimatedValueCents: number;
  estimatedShareBp: number | null;
  estimatedSecurityIds: string[];
  staleSecurityIds: string[];
  missingPriceSecurityIds: string[];
  missingFxSecurityIds: string[];
  missingFxAccountIds: string[];
}

/** No materiality tolerance: one unknown cent makes decision support provisional. */
export function allocationQuality(
  positions: readonly WealthPosition[],
  details: Partial<
    Pick<
      AllocationQuality,
      | 'unclassifiedSecurityIds'
      | 'estimatedSecurityIds'
      | 'staleSecurityIds'
      | 'missingPriceSecurityIds'
      | 'missingFxSecurityIds'
      | 'missingFxAccountIds'
    >
  > = {},
): AllocationQuality {
  const ids = (values: string[] = []) => [...new Set(values)].sort();
  const estimatedSecurityIds = ids([
    ...(details.estimatedSecurityIds ?? []),
    ...positions.filter((p) => p.valuationQuality === 'estimated').map((p) => p.securityId ?? p.id),
  ]);
  const staleSecurityIds = ids([
    ...(details.staleSecurityIds ?? []),
    ...positions.filter((p) => p.valuationQuality === 'stale').map((p) => p.securityId ?? p.id),
  ]);
  const missingPriceSecurityIds = ids(details.missingPriceSecurityIds);
  const missingFxSecurityIds = ids(details.missingFxSecurityIds);
  const missingFxAccountIds = ids(details.missingFxAccountIds);
  const total = positions.reduce((sum, p) => sum + p.valueCents, 0);
  const unknown = positions.filter((p) => p.assetClass === null && p.valueCents !== 0);
  const unclassifiedValueCents = unknown.reduce((sum, p) => sum + p.valueCents, 0);
  const unclassifiedExposureCents = unknown.reduce((sum, p) => sum + Math.abs(p.valueCents), 0);
  const unclassifiedSecurityIds = ids([
    ...unknown.map((p) => p.securityId ?? p.id),
    ...(details.unclassifiedSecurityIds ?? []),
  ]);
  const classification = unclassifiedSecurityIds.length > 0 ? 'partial' : 'complete';
  const estimatedValueCents = positions
    .filter((p) =>
      p.valuationQuality
        ? p.valuationQuality !== 'exact'
        : estimatedSecurityIds.includes(p.securityId ?? p.id) ||
          staleSecurityIds.includes(p.securityId ?? p.id),
    )
    .reduce((sum, p) => sum + Math.abs(p.valueCents), 0);
  const valuationQuality =
    missingPriceSecurityIds.length || missingFxSecurityIds.length || missingFxAccountIds.length
      ? 'incomplete'
      : estimatedSecurityIds.length || staleSecurityIds.length
        ? 'estimated'
        : 'exact';
  return {
    valuationQuality,
    classification,
    confidence:
      valuationQuality === 'exact' && classification === 'complete' ? 'exact' : 'provisional',
    unclassifiedValueCents: details.unclassifiedSecurityIds?.length ? null : unclassifiedValueCents,
    unclassifiedExposureCents: details.unclassifiedSecurityIds?.length
      ? null
      : unclassifiedExposureCents,
    unclassifiedShareBp:
      total > 0 && valuationQuality !== 'incomplete'
        ? ratioBp(unclassifiedExposureCents, total)
        : null,
    unclassifiedProductCount: unclassifiedSecurityIds.length,
    unclassifiedSecurityIds,
    estimatedValueCents,
    estimatedShareBp:
      total > 0 && valuationQuality !== 'incomplete' ? ratioBp(estimatedValueCents, total) : null,
    estimatedSecurityIds,
    staleSecurityIds,
    missingPriceSecurityIds,
    missingFxSecurityIds,
    missingFxAccountIds,
  };
}

export function defaultAllocationIncluded(type: string): boolean {
  return ['brokerage', 'crypto', 'p2p'].includes(type);
}
