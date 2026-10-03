import { defaultBandBp, targetTierLabel } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { account, institution, security } from '../schema';
import { activeTargetsAsOf, listTargetTiers, type ActiveTargets } from './asset-target-tiers';
import { listAssetClasses } from './securities';
import { portfolioPositions } from './portfolio-positions';
import { riskOf, type RiskPosition } from './portfolio-summary';
import type { Executor } from './types';

/** Which Soll-Allocation is active and, with tiers, which tier the investment sum selects. */
export interface TargetSetView {
  source: ActiveTargets['source'];
  /** German label of the active tier ("bis 20.000 €"), `null` without an active tier. */
  tierLabel: string | null;
  upToCents: number | null;
  position: number | null;
  count: number | null;
  /** Investment sum (market value of investment accounts and their cash accounts), if used. */
  investmentSumCents: number | null;
  /** Tiers exist but the sum could not be valued, so the dated targets were used. */
  sumUnavailable: boolean;
}

export function targetSetView(db: Executor, active: ActiveTargets): TargetSetView {
  const tiers = active.tier ? listTargetTiers(db) : [];
  const chosen = active.tier ? tiers.find((t) => t.id === active.tier!.id) : undefined;
  return {
    source: active.source,
    tierLabel: chosen ? targetTierLabel(chosen, tiers) : null,
    upToCents: active.tier?.upToCents ?? null,
    position: active.tier?.position ?? null,
    count: active.tier?.count ?? null,
    investmentSumCents: active.investmentSumCents,
    sumUnavailable: active.sumUnavailable,
  };
}

export interface PortfolioAllocationView {
  asOf: string;
  valueCents: number | null;
  /** The Soll-Allocation behind `classes[].targetBp` (dynamic by investment sum, or dated). */
  targetSet: TargetSetView;
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
  const current = portfolioPositions(db, asOf);
  const positions = current.classes.flatMap((group) => group.positions);
  const securities = new Map(
    db
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((row) => [row.id, row]),
  );
  const accounts = new Map(
    db
      .select()
      .from(account)
      .where(isNull(account.deletedAt))
      .all()
      .map((row) => [row.id, row]),
  );
  const activeTargets = activeTargetsAsOf(db, asOf);
  const targets = new Map(activeTargets.targets.map((row) => [row.assetClassId, row]));
  const status =
    current.valueCents === null
      ? 'unavailable'
      : positions.length === 0
        ? 'empty'
        : current.valueCents <= 0
          ? 'nonpositive'
          : 'known';
  const missing = [
    ...new Set(
      positions.flatMap((position) =>
        position.accounts.flatMap((row) =>
          row.valueStatus === 'known' || row.valueStatus === 'estimated' ? [] : [row.valueStatus],
        ),
      ),
    ),
  ];
  const lines: RiskPosition[] =
    status !== 'known'
      ? []
      : positions.map((position) => {
          const sec = securities.get(position.securityId)!;
          return {
            securityId: sec.id,
            kind: sec.kind,
            assetClassId: sec.assetClassId,
            accounts: position.accounts.map((row) => ({
              accountId: row.accountId,
              institutionId: accounts.get(row.accountId)?.institutionId ?? null,
              valueCents: row.valueCents!,
            })),
          };
        });
  return {
    asOf,
    valueCents: current.valueCents,
    targetSet: targetSetView(db, activeTargets),
    status,
    missing,
    classes: listAssetClasses(db).map((row) => {
      const target = targets.get(row.id);
      return {
        id: row.id,
        name: row.name,
        targetBp: target?.targetShareBp ?? null,
        bandBp: target ? target.bandBp || defaultBandBp(target.targetShareBp) : null,
        validFrom: target?.validFrom ?? null,
      };
    }),
    risk: status === 'known' ? riskOf(db, asOf, lines) : null,
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
