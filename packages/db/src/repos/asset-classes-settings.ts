import { portfolioAllocation } from './portfolio-allocation';
import { exposuresAsOf } from './asset-exposure';
import { listAssetClasses, listSecurities, listTargetVersions } from './securities';
import type { Executor } from './types';
import { resolvedBandBp } from '@budget/domain';

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
  return {
    allocation,
    targetsUnavailable: !!version?.tiers.length && allocation.policy.tierIndex === null,
    securities,
    classes: listAssetClasses(db, { includeDeleted: true }).map((cls) => {
      const target = allocation.policy.targets.find((t) => t.assetClass === cls.id);
      return {
        ...cls,
        target: target
          ? {
              id: cls.id,
              name: cls.name,
              targetBp: target.targetBp,
              bandBp: resolvedBandBp(target, allocation.policy.R13),
              validFrom: allocation.policy.targetValidFrom,
            }
          : null,
        actual: allocation.risk?.allocation.rows.find((row) => row.assetClass === cls.id) ?? null,
        instruments: securities.filter((s) =>
          s.exposure?.weights.some((w) => w.assetClassId === cls.id),
        ),
      };
    }),
  };
}
export type AssetClassesSettingsView = ReturnType<typeof assetClassesSettings>;
