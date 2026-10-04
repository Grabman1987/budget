import { exposuresAsOf, singleAssetClass } from './asset-exposure';
import { defaultBandBp } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { account, institution, security } from '../schema';
import { listAssetClasses, targetsAsOf } from './securities';
import { portfolioPositions } from './portfolio-positions';
import { riskOf, type RiskPosition } from './portfolio-summary';
import type { Executor } from './types';

export interface PortfolioAllocationView {
  asOf: string;
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
  const current = portfolioPositions(db, asOf);
  const positions = current.positions;
  const exposures = exposuresAsOf(db, asOf);
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
  const targets = new Map(targetsAsOf(db, asOf).map((row) => [row.assetClassId, row]));
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
            assetClassId: singleAssetClass(exposures.get(sec.id)?.weights ?? []),
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
