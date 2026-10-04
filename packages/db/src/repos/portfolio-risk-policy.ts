import { PARAM_SCHEMAS, type RuleParams } from '@budget/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { rule } from '../schema';
import { targetsAsOf } from './securities';
import type { Executor } from './types';

export interface PortfolioRiskPolicy {
  asOf: string;
  R13: RuleParams<'R13'>;
  R14: RuleParams<'R14'>;
  R15: RuleParams<'R15'>;
  targets: { assetClass: string; targetBp: number; bandBp: number }[];
}

/**
 * Single runtime source for R13–R15. Targets are effective-dated; rule parameters currently are
 * owner configuration without valid_from, so the stored policy also applies to historical reads.
 * Disabled rules still supply their stored limits (enabled controls finance-check participation).
 * Missing keys use schema defaults; invalid stored policy never silently changes financial limits.
 */
export function resolvePortfolioRiskPolicy(db: Executor, asOf: string): PortfolioRiskPolicy {
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
  return {
    asOf,
    R13: params('R13'),
    R14: params('R14'),
    R15: params('R15'),
    targets: targetsAsOf(db, asOf).map((t) => ({
      assetClass: t.assetClassId,
      targetBp: t.targetShareBp,
      bandBp: t.bandBp,
    })),
  };
}
