import { resolvePortfolioRiskPolicy, type PortfolioRiskPolicy } from './portfolio-risk-policy';
import { allocationInputsAsOf } from './allocation-inputs';
import type { AllocationQuality } from '@budget/domain';
import { defaultBandBp } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { institution, security } from '../schema';
import { listAssetClasses, targetsAsOf } from './securities';
import { riskOf } from './portfolio-summary';
import type { Executor } from './types';

export interface PortfolioAllocationView {
  asOf: string;
  policy: PortfolioRiskPolicy;
  valuationQuality: AllocationQuality['valuationQuality'];
  quality: AllocationQuality;
  universe: { accountIds: string[]; securityIds: string[] };
  valueCents: number | null;
  status: 'known' | 'empty' | 'unavailable' | 'nonpositive';
  missing: ('missing_price' | 'missing_fx')[];
  classes: {
    id: string;
    name: string;
    targetBp: number | null;
    bandBp: number | null;
    validFrom: string | null;
  }[];
  risk: ReturnType<typeof riskOf> | null;
  names: { securities: Record<string, string>; institutions: Record<string, string> };
}

/** Current values only: history/basis gaps never invent values or suppress a known allocation. */
export function portfolioAllocation(db: Executor, asOf: string): PortfolioAllocationView {
  const current = allocationInputsAsOf(db, asOf);
  const positions = current.positions;
  const securities = new Map(
    db
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((row) => [row.id, row]),
  );
  const policy = resolvePortfolioRiskPolicy(db, asOf);
  const targets = new Map(targetsAsOf(db, asOf).map((row) => [row.assetClassId, row]));
  const status =
    current.valueCents === null
      ? 'unavailable'
      : positions.length === 0
        ? 'empty'
        : current.valueCents <= 0
          ? 'nonpositive'
          : 'known';
  const missing: PortfolioAllocationView['missing'] = [
    ...(current.quality.missingPriceSecurityIds.length ? ['missing_price' as const] : []),
    ...(current.quality.missingFxSecurityIds.length || current.quality.missingFxAccountIds.length
      ? ['missing_fx' as const]
      : []),
  ];
  return {
    asOf,
    policy,
    valuationQuality: current.quality.valuationQuality,
    quality: current.quality,
    universe: current.universe,
    valueCents: current.valueCents,
    status,
    missing,
    classes: listAssetClasses(db).map((row) => {
      const target = targets.get(row.id);
      return {
        id: row.id,
        name: row.name,
        targetBp: target?.targetShareBp ?? null,
        bandBp: target ? target.bandBp || defaultBandBp(target.targetShareBp, policy.R13) : null,
        validFrom: target?.validFrom ?? null,
      };
    }),
    risk: status === 'known' ? riskOf(db, asOf) : null,
    names: {
      securities: Object.fromEntries([...securities.values()].map((row) => [row.id, row.name])),
      institutions: Object.fromEntries(
        db
          .select()
          .from(institution)
          .where(isNull(institution.deletedAt))
          .all()
          .map((row) => [row.id, row.name]),
      ),
    },
  };
}
