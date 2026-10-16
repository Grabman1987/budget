import { PARAM_SCHEMAS, type RuleParams } from '@budget/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { rule } from '../schema';
import { listAssetClasses, listTargetVersions } from './securities';
import { allocationInputsAsOf } from './allocation-inputs';
import {
  monthBoundaries,
  resolveTargetTier,
  targetTierStarts,
  type ClassTarget,
} from '@budget/domain';
import type { Executor } from './types';

export interface PortfolioRiskPolicy {
  asOf: string;
  R13: RuleParams<'R13'>;
  R14: RuleParams<'R14'>;
  R15: RuleParams<'R15'>;
  targets: ClassTarget[];
  targetValidFrom: string | null;
  targetLabel: string | null;
  tierIndex: number | null;
  investmentCents: number | null;
  /** inBuffer: the sum is below the stage's lower bound but within its 10 % hold-down buffer. */
  wealthStage?: { label: string; fromCents: number; inBuffer: boolean };
}

/**
 * Single runtime source for R13–R15. Targets are effective-dated; rule parameters currently are
 * owner configuration without valid_from, so the stored policy also applies to historical reads.
 * Disabled rules still supply their stored limits (enabled controls finance-check participation).
 * Missing keys use schema defaults; invalid stored policy never silently changes financial limits.
 * Wealth stages hold down by month end: pass the previous month end's result when iterating
 * chronologically; otherwise the month ends since the version's start are replayed.
 */
export function resolvePortfolioRiskPolicy(
  db: Executor,
  asOf: string,
  investmentCents?: number | null,
  previous?: Pick<PortfolioRiskPolicy, 'targetValidFrom' | 'tierIndex'>,
): PortfolioRiskPolicy {
  const rows = db
    .select()
    .from(rule)
    .where(
      and(isNull(rule.deletedAt), eq(rule.kind, 'rule'), inArray(rule.code, ['R13', 'R14', 'R15'])),
    )
    .all();
  const params = <C extends 'R13' | 'R14' | 'R15'>(code: C): RuleParams<C> => {
    const row = rows.find((r) => r.code === code);
    try {
      return PARAM_SCHEMAS[code].parse(
        row?.paramsJson ? JSON.parse(row.paramsJson) : {},
      ) as RuleParams<C>;
    } catch {
      throw new RangeError(
        'Die gespeicherten Risikoparameter sind ungültig. Bitte das Regelwerk prüfen.',
      );
    }
  };
  const version = listTargetVersions(db)
    .filter((v) => v.validFrom <= asOf)
    .at(-1);
  const sum = version?.tiers.length
    ? investmentCents === undefined
      ? allocationInputsAsOf(db, asOf).valueCents
      : investmentCents
    : (investmentCents ?? null);
  let previousTier: number | null = null;
  if (version?.tiers.length) {
    if (previous && previous.targetValidFrom === version.validFrom)
      previousTier = previous.tierIndex;
    else
      for (const day of monthBoundaries(version.validFrom, asOf).filter((d) => d < asOf))
        previousTier = resolveTargetTier(
          version,
          allocationInputsAsOf(db, day).valueCents,
          previousTier,
        ).tierIndex;
  }
  const resolved = version
    ? resolveTargetTier(version, sum, previousTier)
    : { targets: [], tierIndex: null };
  const order = new Map(listAssetClasses(db, { includeDeleted: true }).map((c, i) => [c.id, i]));
  resolved.targets = [...resolved.targets].sort(
    (a, b) => (order.get(a.assetClassId) ?? 0) - (order.get(b.assetClassId) ?? 0),
  );
  return {
    asOf,
    R13: params('R13'),
    R14: params('R14'),
    R15: params('R15'),
    targetValidFrom: version?.validFrom ?? null,
    targetLabel: version?.label ?? null,
    tierIndex: resolved.tierIndex,
    investmentCents: sum,
    ...(version && resolved.tierIndex !== null
      ? {
          wealthStage: {
            label: version.tiers[resolved.tierIndex]!.label ?? '',
            fromCents: targetTierStarts(version.tiers)[resolved.tierIndex]!,
            inBuffer: sum !== null && sum < targetTierStarts(version.tiers)[resolved.tierIndex]!,
          },
        }
      : {}),
    targets: resolved.targets.map((t) => ({
      assetClass: t.assetClassId,
      targetBp: t.targetShareBp,
      bandBp: t.bandBp ?? 0,
      ...(t.bandMode ? { bandMode: t.bandMode } : {}),
    })),
  };
}
