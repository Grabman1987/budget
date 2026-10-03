import {
  selectTargetTier,
  sortTargetTiers,
  targetTierListProblem,
  type TargetTierBound,
} from '@budget/domain';
import { asc, isNull } from 'drizzle-orm';
import { account, assetTargetTier, assetTargetTierShare } from '../schema';
import { deleteTracked, insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { EntityNotFoundError } from './errors';
import { netWorthValuationAsOf } from './portfolio';
import { listAssetClasses, targetsAsOf, type AssetTargetInput } from './securities';
import { runInTransaction, type Executor } from './types';

/**
 * Dynamic target weights by investment sum (owner decision 2026-10-03). Target sets ("tiers")
 * hold a target share per asset class for a range of the investment sum; the tier chosen by the
 * current sum is the Soll-Allocation for R13, the portfolio views and the allocation report.
 * Without any tier the dated `asset_class_target` versions apply as before.
 *
 * **Investment sum** = market value of every investment account (role `investment`: depots,
 * crypto, P2P, other investments) plus the cash accounts that are the Verrechnungskonto of such an
 * account and are not Budget-Konten (the investment cash accounts), each cash account with its
 * signed balance, so an overdrawn investment cash account lowers the sum.
 */

export interface TierShare {
  assetClassId: string;
  targetShareBp: number;
  bandBp: number;
}
export interface TargetTierView extends TargetTierBound {
  shares: TierShare[];
  sumBp: number;
}
export interface TargetTierInput {
  /** Inclusive upper bound of the investment sum in cents; `null` = above the last threshold. */
  upToCents: number | null;
  targets: ReadonlyArray<AssetTargetInput>;
}

const tierId = (upToCents: number | null) => `tier-${upToCents ?? 'open'}`;
const shareId = (tier: string, classId: string) => `${tier}:${classId}`;

/** The stored tiers, lowest threshold first, the open tier last. */
export function listTargetTiers(db: Executor): TargetTierView[] {
  const tiers = db
    .select()
    .from(assetTargetTier)
    .where(isNull(assetTargetTier.deletedAt))
    .orderBy(asc(assetTargetTier.id))
    .all();
  const shares = db
    .select()
    .from(assetTargetTierShare)
    .where(isNull(assetTargetTierShare.deletedAt))
    .all();
  const classOrder = new Map(listAssetClasses(db).map((c, i) => [c.id, i]));
  return sortTargetTiers(
    tiers.map((t) => ({
      id: t.id,
      upToCents: t.upToCents,
      shares: shares
        .filter((s) => s.tierId === t.id && classOrder.has(s.assetClassId))
        .sort((a, b) => classOrder.get(a.assetClassId)! - classOrder.get(b.assetClassId)!)
        .map((s) => ({
          assetClassId: s.assetClassId,
          targetShareBp: s.targetShareBp,
          bandBp: s.bandBp,
        })),
      sumBp: 0,
    })),
  ).map((t) => ({ ...t, sumBp: t.shares.reduce((a, s) => a + s.targetShareBp, 0) }));
}

/** The tiers as `setTargetTiers` would store `input`, for comparing without writing. */
export function normalizeTargetTiers(input: ReadonlyArray<TargetTierInput>): TargetTierView[] {
  return sortTargetTiers(
    input.map((t) => ({
      id: tierId(t.upToCents),
      upToCents: t.upToCents,
      shares: t.targets.map((s) => ({
        assetClassId: s.assetClassId,
        targetShareBp: s.targetShareBp,
        bandBp: s.bandBp ?? 0,
      })),
      sumBp: t.targets.reduce((a, s) => a + s.targetShareBp, 0),
    })),
  );
}

const shareKey = (tier: TargetTierView) =>
  JSON.stringify(
    [...tier.shares]
      .sort((a, b) => a.assetClassId.localeCompare(b.assetClassId))
      .map((s) => [s.assetClassId, s.targetShareBp, s.bandBp]),
  );

/** Whether storing `input` would change anything (same thresholds, classes, shares and bands). */
export function targetTiersDiffer(db: Executor, input: ReadonlyArray<TargetTierInput>): boolean {
  const wanted = normalizeTargetTiers(input);
  const current = listTargetTiers(db);
  if (wanted.length !== current.length) return true;
  return wanted.some((w, i) => {
    const c = current[i]!;
    return w.id !== c.id || shareKey(w) !== shareKey(c);
  });
}

/**
 * Replace the whole tier set (an empty list removes every tier, the dated targets apply again).
 * Every tier adds up to exactly 10 000 bp over distinct live asset classes; thresholds are unique
 * and only one tier is open. One transaction and one audit group, so a single undo restores the
 * previous set. Rows that stay the same are not written.
 */
export function setTargetTiers(
  db: Executor,
  input: ReadonlyArray<TargetTierInput>,
  ctx: AuditContext,
): TargetTierView[] {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (input.length > 0) {
      const problem = targetTierListProblem(normalizeTargetTiers(input));
      if (problem) throw new RangeError(`Invalid target tiers: ${problem}`);
    }
    const live = new Set(listAssetClasses(tx).map((c) => c.id));
    for (const tier of input) {
      const seen = new Set<string>();
      for (const t of tier.targets) {
        if (!live.has(t.assetClassId)) throw new EntityNotFoundError('asset_class', t.assetClassId);
        if (seen.has(t.assetClassId))
          throw new RangeError(`Asset class ${t.assetClassId} is listed twice in one tier`);
        seen.add(t.assetClassId);
        if (!Number.isInteger(t.targetShareBp) || t.targetShareBp < 0 || t.targetShareBp > 10_000)
          throw new RangeError('A target share is 0 to 10 000 bp');
        if (
          t.bandBp !== undefined &&
          (!Number.isInteger(t.bandBp) || t.bandBp < 0 || t.bandBp > 10_000)
        )
          throw new RangeError('A band is 0 to 10 000 bp');
      }
      const sum = tier.targets.reduce((a, t) => a + t.targetShareBp, 0);
      if (sum !== 10_000)
        throw new RangeError(
          `The targets of a tier add up to ${sum} bp, they must add up to 10 000`,
        );
    }

    const wanted = normalizeTargetTiers(input);
    const current = listTargetTiers(tx);
    const currentIds = new Set(current.map((t) => t.id));
    const wantedIds = new Set(wanted.map((t) => t.id));

    // Remove what is gone first (shares before their tier).
    for (const t of current) {
      if (wantedIds.has(t.id)) continue;
      for (const s of t.shares)
        deleteTracked(tx, assetTargetTierShare, [shareId(t.id, s.assetClassId)], grouped);
      deleteTracked(tx, assetTargetTier, [t.id], grouped);
    }
    for (const t of wanted) {
      if (!currentIds.has(t.id))
        insertTracked(tx, assetTargetTier, { id: t.id, upToCents: t.upToCents }, grouped);
      const stored = new Map(
        (current.find((c) => c.id === t.id)?.shares ?? []).map((s) => [s.assetClassId, s]),
      );
      const keep = new Set(t.shares.map((s) => s.assetClassId));
      for (const s of t.shares) {
        const id = shareId(t.id, s.assetClassId);
        if (!stored.has(s.assetClassId))
          insertTracked(
            tx,
            assetTargetTierShare,
            {
              id,
              tierId: t.id,
              assetClassId: s.assetClassId,
              targetShareBp: s.targetShareBp,
              bandBp: s.bandBp,
            },
            grouped,
          );
        else
          updateTracked(
            tx,
            assetTargetTierShare,
            [id],
            { targetShareBp: s.targetShareBp, bandBp: s.bandBp },
            grouped,
          );
      }
      for (const [classId] of stored)
        if (!keep.has(classId))
          deleteTracked(tx, assetTargetTierShare, [shareId(t.id, classId)], grouped);
    }
    return listTargetTiers(tx);
  });
}

// ---------------------------------------------------------------------------------------------
// Investment sum
// ---------------------------------------------------------------------------------------------

export interface InvestmentSumAccount {
  id: string;
  role: string;
  onBudget: boolean;
  openingDate: string;
  referenceAccountId: string | null;
}

/** Accounts whose value makes up the investment sum on `day` (see the module comment). */
export function investmentSumAccountIds(
  accounts: ReadonlyArray<InvestmentSumAccount>,
  day: string,
): string[] {
  const investment = accounts.filter((a) => a.role === 'investment' && a.openingDate <= day);
  const cash = new Set(
    investment.flatMap((a) => (a.referenceAccountId ? [a.referenceAccountId] : [])),
  );
  const ids = new Set(investment.map((a) => a.id));
  for (const a of accounts)
    if (cash.has(a.id) && !a.onBudget && a.openingDate <= day) ids.add(a.id);
  return [...ids];
}

/** Sum of the account values in cents; `null` when one of them cannot be valued. */
export function investmentSumFrom(
  accounts: ReadonlyArray<InvestmentSumAccount>,
  day: string,
  byAccount: Readonly<Record<string, number | null>>,
): number | null {
  let sum = 0;
  for (const id of investmentSumAccountIds(accounts, day)) {
    const value = byAccount[id];
    if (value === null) return null;
    sum += value ?? 0;
  }
  return Number.isSafeInteger(sum) ? sum : null;
}

export function investmentSumAccounts(db: Executor): InvestmentSumAccount[] {
  return db
    .select({
      id: account.id,
      role: account.role,
      onBudget: account.onBudget,
      openingDate: account.openingDate,
      referenceAccountId: account.referenceAccountId,
    })
    .from(account)
    .where(isNull(account.deletedAt))
    .all();
}

/** The investment sum on `asOf`; `null` when a price or exchange rate for it is missing. */
export function investmentSumAsOf(db: Executor, asOf: string): number | null {
  return investmentSumFrom(
    investmentSumAccounts(db),
    asOf,
    netWorthValuationAsOf(db, asOf).byAccount,
  );
}

// ---------------------------------------------------------------------------------------------
// The active Soll-Allocation
// ---------------------------------------------------------------------------------------------

export interface ActiveTarget {
  assetClassId: string;
  targetShareBp: number;
  bandBp: number;
  /** The start day of a dated version; `null` for a tier. */
  validFrom: string | null;
}

export interface ActiveTierInfo {
  id: string;
  upToCents: number | null;
  /** 1-based position among the tiers, lowest threshold first. */
  position: number;
  count: number;
}

export interface ActiveTargets {
  /** `tiers`: the tier chosen by the investment sum; `dated`: the dated versions; `none`. */
  source: 'tiers' | 'dated' | 'none';
  tier: ActiveTierInfo | null;
  /** The investment sum used to choose the tier (only computed when tiers exist). */
  investmentSumCents: number | null;
  /** Tiers exist but the sum could not be valued; the dated targets were used instead. */
  sumUnavailable: boolean;
  targets: ActiveTarget[];
}

/**
 * The Soll-Allocation on `asOf`. With tiers: the tier of the investment sum (pass `sumCents` when
 * the caller already valued the accounts, leave it out to value them here). Without tiers, or when
 * the sum is unavailable: the dated versions (`targetsAsOf`).
 */
export function activeTargetsAsOf(
  db: Executor,
  asOf: string,
  options: { sumCents?: number | null } = {},
): ActiveTargets {
  const tiers = listTargetTiers(db);
  const dated = (): ActiveTarget[] =>
    targetsAsOf(db, asOf).map((t) => ({
      assetClassId: t.assetClassId,
      targetShareBp: t.targetShareBp,
      bandBp: t.bandBp,
      validFrom: t.validFrom,
    }));
  if (tiers.length === 0) {
    const targets = dated();
    return {
      source: targets.length > 0 ? 'dated' : 'none',
      tier: null,
      investmentSumCents: null,
      sumUnavailable: false,
      targets,
    };
  }
  const sum = options.sumCents === undefined ? investmentSumAsOf(db, asOf) : options.sumCents;
  if (sum === null) {
    const targets = dated();
    return {
      source: targets.length > 0 ? 'dated' : 'none',
      tier: null,
      investmentSumCents: null,
      sumUnavailable: true,
      targets,
    };
  }
  const chosen = selectTargetTier(tiers, sum)!;
  const classOrder = new Map(listAssetClasses(db).map((c, i) => [c.id, i]));
  return {
    source: 'tiers',
    tier: {
      id: chosen.id,
      upToCents: chosen.upToCents,
      position: tiers.findIndex((t) => t.id === chosen.id) + 1,
      count: tiers.length,
    },
    investmentSumCents: sum,
    sumUnavailable: false,
    targets: chosen.shares
      .filter((s) => classOrder.has(s.assetClassId))
      .map((s) => ({
        assetClassId: s.assetClassId,
        targetShareBp: s.targetShareBp,
        bandBp: s.bandBp,
        validFrom: null,
      })),
  };
}
