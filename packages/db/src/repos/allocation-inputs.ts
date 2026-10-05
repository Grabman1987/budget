import {
  allocationQuality,
  defaultAllocationIncluded,
  grossExposureCents,
  type WealthPosition,
} from '@budget/domain';
import { desc, isNull, lte } from 'drizzle-orm';
import { account, assetClass, security, valuation as manualValuation } from '../schema';
import { holdingValuationExportAsOf } from './portfolio';
import { accountBalances } from './queries';
import { cashValuer } from './cash-valuation';
import { exposuresAsOf, splitAssetExposure } from './asset-exposure';
import type { Executor } from './types';

export interface AllocationSecurity {
  securityId: string;
  name: string;
  isin: string | null;
  kind: typeof security.$inferSelect.kind;
  held: boolean;
}

/** Current dated assignments, including products that have never been bought. */
export function allocationSecuritiesAsOf(db: Executor, asOf: string) {
  const exposures = exposuresAsOf(db, asOf);
  const valuation = holdingValuationExportAsOf(db, asOf);
  const held = new Set(
    [...valuation.values, ...valuation.missingPricePositions, ...valuation.missingFxPositions].map(
      (p) => p.securityId,
    ),
  );
  const byClass = new Map<string, AllocationSecurity[]>();
  for (const s of allocationUniverse(db).securities) {
    for (const weight of exposures.get(s.id)?.weights ?? []) {
      if (weight.weightBp <= 0) continue;
      const list = byClass.get(weight.assetClassId) ?? [];
      list.push({
        securityId: s.id,
        name: s.name,
        isin: s.isin,
        kind: s.kind,
        held: held.has(s.id),
      });
      byClass.set(weight.assetClassId, list);
    }
  }
  return byClass;
}

/** One explicit universe for allocation, risk, reports and savings decisions. */
export function allocationUniverse(db: Executor) {
  const accounts = db.select().from(account).where(isNull(account.deletedAt)).all();
  const includedAccounts = accounts.filter(
    (a) =>
      !['credit_card', 'loan', 'other_liability', 'receivable'].includes(a.type) &&
      (a.allocationScope === 'included' ||
        (a.allocationScope === 'default' && defaultAllocationIncluded(a.type))),
  );
  const securities = db
    .select()
    .from(security)
    .where(isNull(security.deletedAt))
    .all()
    .filter((s) => s.allocationIncluded);
  return { accounts: includedAccounts, securities };
}

/** Reuses stored valuation fallbacks; unknown values never enter as zero-valued holdings. */
export function allocationInputsAsOf(db: Executor, asOf: string) {
  const universe = allocationUniverse(db);
  const accounts = new Map(universe.accounts.map((a) => [a.id, a]));
  const securities = new Map(universe.securities.map((s) => [s.id, s]));
  const classes = new Set(
    db
      .select()
      .from(assetClass)
      .where(isNull(assetClass.deletedAt))
      .all()
      .map((c) => c.id),
  );
  const included = (p: { accountId: string; securityId: string }) =>
    accounts.has(p.accountId) && securities.has(p.securityId);
  const valuation = holdingValuationExportAsOf(db, asOf);
  const values = valuation.values.filter(included);
  const exposures = exposuresAsOf(db, asOf);
  const positions: WealthPosition[] = values.flatMap((h) => {
    const sec = securities.get(h.securityId)!;
    const weights = (exposures.get(sec.id)?.weights ?? []).filter((w) =>
      classes.has(w.assetClassId),
    );
    const gross = splitAssetExposure(
      grossExposureCents({ valueCents: h.valueCents, leverageFactor: sec.leverageFactor }),
      weights,
    );
    return splitAssetExposure(h.valueCents, weights).map((part, i) => ({
      id: `${sec.id}:${h.accountId}:${part.assetClassId ?? ''}`,
      securityId: sec.id,
      accountId: h.accountId,
      kind: sec.kind,
      assetClass: part.assetClassId,
      valuationQuality: h.quality === 'missing' ? 'estimated' : h.quality,
      valueCents: part.valueCents,
      leverageFactor: sec.leverageFactor,
      grossExposureCents: gross[i]!.valueCents,
      platform: accounts.get(h.accountId)!.institutionId,
    }));
  });
  const manualValues = new Map<string, number>();
  for (const v of db
    .select()
    .from(manualValuation)
    .where(lte(manualValuation.date, asOf))
    .orderBy(desc(manualValuation.date))
    .all()
    .filter((v) => v.deletedAt === null))
    if (!manualValues.has(v.accountId)) manualValues.set(v.accountId, v.valueCents);
  const holdingAccounts = new Set(
    [...valuation.values, ...valuation.missingPricePositions, ...valuation.missingFxPositions]
      .filter((h) => accounts.has(h.accountId))
      .map((h) => h.accountId),
  );
  const cashValue = cashValuer(db);
  const missingFxAccountIds: string[] = [];
  const unavailable: {
    reason: 'missing_fx' | 'missing_price';
    accountId: string;
    securityId?: string;
    currency?: string;
  }[] = [
    ...valuation.missingPricePositions.filter(included).map((h) => ({
      reason: 'missing_price' as const,
      accountId: h.accountId,
      securityId: h.securityId,
    })),
    ...valuation.missingFxPositions.filter(included).map((h) => ({
      reason: 'missing_fx' as const,
      accountId: h.accountId,
      securityId: h.securityId,
      currency: h.priceCurrency,
    })),
  ];
  for (const balance of accountBalances(db, asOf)) {
    const acct = accounts.get(balance.accountId);
    if (!acct) continue;
    const nativeCents =
      acct.type === 'p2p' && !holdingAccounts.has(acct.id)
        ? (manualValues.get(acct.id) ?? balance.balanceCents)
        : balance.balanceCents;
    if (nativeCents === 0) continue;
    const valueCents = cashValue(nativeCents, acct.currency, asOf).eurCents;
    if (valueCents === null) {
      missingFxAccountIds.push(acct.id);
      unavailable.push({ reason: 'missing_fx', accountId: acct.id, currency: acct.currency });
      continue;
    }
    positions.push({
      id: `cash:${acct.id}`,
      accountId: acct.id,
      securityId: `cash:${acct.id}`,
      kind: acct.type === 'p2p' ? 'p2p' : 'other',
      assetClass:
        acct.allocationAssetClassId && classes.has(acct.allocationAssetClassId)
          ? acct.allocationAssetClassId
          : null,
      valueCents,
      platform: acct.institutionId,
      // Negative investment cash reduces the denominator; it is not speculative gross exposure.
      grossExposureCents: acct.type === 'p2p' ? Math.max(0, valueCents) : 0,
    });
  }
  const unclassifiedSecurityIds = unavailable.flatMap((p) => {
    if (p.securityId) {
      const weights = (exposures.get(p.securityId)?.weights ?? []).filter((w) =>
        classes.has(w.assetClassId),
      );
      return weights.reduce((sum, w) => sum + w.weightBp, 0) < 10000 ? [p.securityId] : [];
    }
    return accounts.get(p.accountId)?.allocationAssetClassId ? [] : [`cash:${p.accountId}`];
  });
  const quality = allocationQuality(positions, {
    unclassifiedSecurityIds,
    estimatedSecurityIds: values.filter((h) => h.quality === 'estimated').map((h) => h.securityId),
    staleSecurityIds: values.filter((h) => h.quality === 'stale').map((h) => h.securityId),
    missingPriceSecurityIds: valuation.missingPricePositions
      .filter(included)
      .map((h) => h.securityId),
    missingFxSecurityIds: valuation.missingFxPositions.filter(included).map((h) => h.securityId),
    missingFxAccountIds,
  });
  return {
    positions,
    quality,
    unavailable,
    valueCents:
      quality.valuationQuality === 'incomplete'
        ? null
        : positions.reduce((sum, p) => sum + p.valueCents, 0),
    universe: { accountIds: [...accounts.keys()], securityIds: [...securities.keys()] },
  };
}
