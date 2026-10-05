import { portfolioAllocation } from './portfolio-allocation';
import { exposuresAsOf } from './asset-exposure';
import { listAssetClasses, listSecurities, listTargetVersions } from './securities';
import type { Executor } from './types';
import { compositionGroups, resolvedBandBp } from '@budget/domain';

/** Settings decorates the shared server allocation projection; no second valuation or formula. */
export function assetClassesSettings(db: Executor, asOf: string) {
  const allocation = portfolioAllocation(db, asOf);
  const version = listTargetVersions(db).find(
    (v) => v.validFrom === allocation.policy.targetValidFrom,
  );
  const exposures = exposuresAsOf(db, asOf);
  const securities = listSecurities(db).map((s) => ({
    ...s,
    exposure: exposures.get(s.id) ?? null,
  }));
  const definitions = listAssetClasses(db, { includeDeleted: true });
  const groups = compositionGroups(
    allocation.classes.map((c) => {
      const actual = allocation.risk?.allocation.rows.find((r) => r.assetClass === c.id);
      return {
        assetClassId: c.id,
        name: c.name,
        valueCents: actual?.valueCents ?? 0,
        shareBp: actual?.shareBp ?? 0,
        portfolioShareBp: actual?.shareBp ?? 0,
        targetBp: c.targetBp,
      };
    }),
    definitions,
  );
  return {
    allocation,
    targetsUnavailable: !!version?.tiers.length && allocation.policy.tierIndex === null,
    securities,
    classes: definitions.map((cls) => {
      const target = allocation.policy.targets.find((t) => t.assetClass === cls.id);
      const group = cls.isGroup ? groups.find((g) => g.assetClassId === cls.id) : undefined;
      return {
        ...cls,
        target:
          group?.targetBp != null
            ? {
                id: cls.id,
                name: cls.name,
                targetBp: group.targetBp,
                bandBp: null,
                validFrom: allocation.policy.targetValidFrom,
              }
            : target
              ? {
                  id: cls.id,
                  name: cls.name,
                  targetBp: target.targetBp,
                  bandBp: resolvedBandBp(target, allocation.policy.R13),
                  validFrom: allocation.policy.targetValidFrom,
                }
              : null,
        actual: cls.isGroup
          ? group && allocation.risk
            ? {
                assetClass: cls.id,
                valueCents: group.valueCents,
                shareBp: group.portfolioShareBp,
                targetBp: group.targetBp,
                bandBp: null,
                deviationBp: group.deviationBp,
                breach: false,
              }
            : null
          : (allocation.risk?.allocation.rows.find((row) => row.assetClass === cls.id) ?? null),
        instruments: securities.filter((s) =>
          s.exposure?.weights.some(
            (w) =>
              w.assetClassId === cls.id ||
              (cls.isGroup &&
                definitions.some((c) => c.id === w.assetClassId && c.parentId === cls.id)),
          ),
        ),
      };
    }),
  };
}
export type AssetClassesSettingsView = ReturnType<typeof assetClassesSettings>;
