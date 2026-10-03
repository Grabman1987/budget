import { and, asc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import {
  assetClass,
  assetClassTarget,
  assetTargetTierShare,
  holding,
  institution,
  savingsPlan,
  security,
  trade,
} from '../schema';
import { deleteTracked, insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { entityRepo, type NewRow, type RowPatch } from './entities';
import { ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

export type SecurityRecord = typeof security.$inferSelect;
export type AssetClassRow = typeof assetClass.$inferSelect;
export type TargetRow = typeof assetClassTarget.$inferSelect;

const securityRepo = entityRepo(security, (t) => [asc(t.name), asc(t.id)]);
const assetClassRepo = entityRepo(assetClass, (t) => [asc(t.sortOrder), asc(t.name), asc(t.id)]);

// ---------------------------------------------------------------------------------------------
// Securities
// ---------------------------------------------------------------------------------------------

function checkRefs(
  tx: Executor,
  values: { assetClassId?: string | null | undefined; institutionId?: string | null | undefined },
) {
  if (values.assetClassId) {
    const row = assetClassRepo.get(tx, values.assetClassId);
    if (!row) throw new EntityNotFoundError('asset_class', values.assetClassId);
  }
  if (values.institutionId) {
    const row = tx
      .select({ id: institution.id })
      .from(institution)
      .where(and(eq(institution.id, values.institutionId), isNull(institution.deletedAt)))
      .get();
    if (!row) throw new EntityNotFoundError('institution', values.institutionId);
  }
}

function checkIsin(tx: Executor, isin: string | null | undefined, exceptId?: string) {
  if (!isin) return;
  const clash = tx
    .select({ id: security.id })
    .from(security)
    .where(
      and(
        eq(security.isin, isin),
        isNull(security.deletedAt),
        ...(exceptId ? [ne(security.id, exceptId)] : []),
      ),
    )
    .get();
  if (clash) throw new ConflictError(`ISIN ${isin} belongs to another security`);
}

export const listSecurities = (db: Executor, options: { includeDeleted?: boolean } = {}) =>
  securityRepo.list(db, options);
export const getSecurity = (db: Executor, id: string, options: { includeDeleted?: boolean } = {}) =>
  securityRepo.get(db, id, options);

export function createSecurity(
  db: Executor,
  values: NewRow<typeof security>,
  ctx: AuditContext,
): SecurityRecord {
  return runInTransaction(db, (tx) => {
    checkRefs(tx, values);
    checkIsin(tx, values.isin);
    return securityRepo.create(tx, values, ctx);
  });
}

export function updateSecurity(
  db: Executor,
  id: string,
  patch: RowPatch<typeof security>,
  ctx: AuditContext,
): SecurityRecord {
  return runInTransaction(db, (tx) => {
    checkRefs(tx, patch);
    checkIsin(tx, patch.isin, id);
    return securityRepo.update(tx, id, patch, ctx);
  });
}

/**
 * Soft-delete a security. Refused while it has live trades, holdings or an open savings plan:
 * a deleted security drops out of every valuation, so its units would silently vanish from net
 * worth.
 */
export function deleteSecurity(db: Executor, id: string, ctx: AuditContext): void {
  runInTransaction(db, (tx) => {
    const used =
      tx
        .select({ id: trade.id })
        .from(trade)
        .where(and(eq(trade.securityId, id), isNull(trade.deletedAt)))
        .get() ??
      tx
        .select({ id: holding.id })
        .from(holding)
        .where(and(eq(holding.securityId, id), isNull(holding.deletedAt)))
        .get() ??
      tx
        .select({ id: savingsPlan.id })
        .from(savingsPlan)
        .where(
          and(
            eq(savingsPlan.securityId, id),
            isNull(savingsPlan.deletedAt),
            isNull(savingsPlan.validTo),
          ),
        )
        .get();
    if (used)
      throw new ConflictError(
        'The security still has trades, holdings or a savings plan; remove them first',
      );
    securityRepo.softDelete(tx, id, ctx);
  });
}

export const restoreSecurity = securityRepo.restore;

// ---------------------------------------------------------------------------------------------
// Asset classes and their versioned targets
// ---------------------------------------------------------------------------------------------

export const listAssetClasses = (db: Executor) => assetClassRepo.list(db);
export const getAssetClass = (db: Executor, id: string) => assetClassRepo.get(db, id);
export const createAssetClass = assetClassRepo.create;
export const updateAssetClass = assetClassRepo.update;

/**
 * Set the order of the asset classes: `ids` (live, unique) come first in the given order, classes
 * not listed follow in their current order, so the result is one gapless sequence 1..n. One audit
 * group, so a single undo restores the old order; positions that do not change are not written.
 */
export function orderAssetClasses(
  db: Executor,
  ids: ReadonlyArray<string>,
  ctx: AuditContext,
): { order: string[]; changed: number; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const live = assetClassRepo.list(tx);
    const known = new Set(live.map((c) => c.id));
    const seen = new Set<string>();
    for (const id of ids) {
      if (!known.has(id)) throw new EntityNotFoundError('asset_class', id);
      if (seen.has(id)) throw new ConflictError(`Asset class ${id} is listed twice`);
      seen.add(id);
    }
    const order = [...ids, ...live.map((c) => c.id).filter((id) => !seen.has(id))];
    const before = new Map(live.map((c) => [c.id, c.sortOrder]));
    let changed = 0;
    order.forEach((id, index) => {
      if (before.get(id) === index + 1) return;
      updateTracked(tx, assetClass, [id], { sortOrder: index + 1 }, grouped);
      changed += 1;
    });
    return { order, changed, groupId: grouped.groupId };
  });
}

/** Soft-delete an asset class; refused while a live security belongs to it. */
export function deleteAssetClass(db: Executor, id: string, ctx: AuditContext): void {
  runInTransaction(db, (tx) => {
    const used = tx
      .select({ id: security.id })
      .from(security)
      .where(and(eq(security.assetClassId, id), isNull(security.deletedAt)))
      .get();
    if (used) throw new ConflictError('Securities still belong to this asset class');
    const inTier = tx
      .select({ id: assetTargetTierShare.id })
      .from(assetTargetTierShare)
      .where(and(eq(assetTargetTierShare.assetClassId, id), isNull(assetTargetTierShare.deletedAt)))
      .get();
    if (inTier)
      throw new ConflictError('The asset class is part of target sets; remove it there first');
    assetClassRepo.softDelete(tx, id, ctx);
  });
}

export interface AssetTargetInput {
  assetClassId: string;
  targetShareBp: number;
  /** Tolerance band in bp; 0 = the R13 default (`min(500 bp, 25 % of the target)`). */
  bandBp?: number;
}

export interface TargetVersion {
  validFrom: string;
  targets: TargetRow[];
  sumBp: number;
}

function liveClassIds(tx: Executor): string[] {
  return assetClassRepo.list(tx).map((c) => c.id);
}

/** Every target row, oldest version first. */
function allTargets(tx: Executor): TargetRow[] {
  return tx
    .select()
    .from(assetClassTarget)
    .where(isNull(assetClassTarget.deletedAt))
    .orderBy(asc(assetClassTarget.validFrom), asc(assetClassTarget.assetClassId))
    .all();
}

/** Target versions with their sum (a valid version adds up to 10 000 bp), oldest first. */
export function listTargetVersions(db: Executor): TargetVersion[] {
  const byDay = new Map<string, TargetRow[]>();
  for (const t of allTargets(db)) byDay.set(t.validFrom, [...(byDay.get(t.validFrom) ?? []), t]);
  return [...byDay.entries()].map(([validFrom, targets]) => ({
    validFrom,
    targets,
    sumBp: targets.reduce((a, t) => a + t.targetShareBp, 0),
  }));
}

/**
 * The Soll-Allocation valid on `day`: per live asset class its newest target on or before the day
 * (classes without any target are left out). `includeDay=false` selects strictly prior versions.
 */
export function targetsAsOf(db: Executor, day: string, includeDay = true): TargetRow[] {
  const order = new Map(liveClassIds(db).map((id, i) => [id, i]));
  const latest = new Map<string, TargetRow>();
  for (const t of allTargets(db)) {
    if ((t.validFrom < day || (includeDay && t.validFrom === day)) && order.has(t.assetClassId))
      latest.set(t.assetClassId, t);
  }
  // In the order of the asset classes (sort order, name), the order the pages show them in.
  return [...latest.values()].sort(
    (a, b) => (order.get(a.assetClassId) as number) - (order.get(b.assetClassId) as number),
  );
}

/**
 * Set the target version that starts on `validFrom`: shares in bp (and bands) per asset class,
 * adding up to exactly 10 000 bp. A live class with a target before that day and no entry here is
 * set to 0 from that day (its old share would otherwise break the sum). Rows of an existing
 * version are replaced; all in one audit group.
 */
export function setTargets(
  db: Executor,
  validFrom: string,
  targets: ReadonlyArray<AssetTargetInput>,
  ctx: AuditContext,
): TargetVersion {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const live = new Set(liveClassIds(tx));
    const seen = new Set<string>();
    for (const t of targets) {
      if (!live.has(t.assetClassId)) throw new EntityNotFoundError('asset_class', t.assetClassId);
      if (seen.has(t.assetClassId))
        throw new RangeError(`Asset class ${t.assetClassId} is listed twice`);
      seen.add(t.assetClassId);
      if (!Number.isInteger(t.targetShareBp) || t.targetShareBp < 0 || t.targetShareBp > 10_000)
        throw new RangeError('A target share is 0 to 10 000 bp');
      if (
        t.bandBp !== undefined &&
        (!Number.isInteger(t.bandBp) || t.bandBp < 0 || t.bandBp > 10_000)
      )
        throw new RangeError('A band is 0 to 10 000 bp');
    }
    const earlier = new Set(
      targetsAsOf(tx, validFrom, false)
        .filter((t) => t.targetShareBp > 0)
        .map((t) => t.assetClassId),
    );
    const wanted = new Map<string, { share: number; band: number }>();
    for (const t of targets)
      wanted.set(t.assetClassId, { share: t.targetShareBp, band: t.bandBp ?? 0 });
    for (const id of earlier) if (!wanted.has(id)) wanted.set(id, { share: 0, band: 0 });
    const sum = [...wanted.values()].reduce((a, w) => a + w.share, 0);
    if (sum !== 10_000)
      throw new RangeError(`The targets add up to ${sum} bp, they must add up to 10 000 bp`);

    const existing = new Map(
      tx
        .select()
        .from(assetClassTarget)
        .where(eq(assetClassTarget.validFrom, validFrom))
        .all()
        .map((r) => [r.assetClassId, r]),
    );
    for (const [classId, w] of wanted) {
      const row = existing.get(classId);
      if (row) {
        updateTracked(
          tx,
          assetClassTarget,
          [row.id],
          { targetShareBp: w.share, bandBp: w.band, deletedAt: null },
          grouped,
        );
      } else {
        insertTracked(
          tx,
          assetClassTarget,
          {
            id: `${classId}@${validFrom}`,
            assetClassId: classId,
            validFrom,
            targetShareBp: w.share,
            bandBp: w.band,
          },
          grouped,
        );
      }
    }
    for (const [classId, row] of existing)
      if (!wanted.has(classId) && row.deletedAt === null)
        deleteTracked(tx, assetClassTarget, [row.id], grouped);
    const version = listTargetVersions(tx).find((v) => v.validFrom === validFrom);
    return version as TargetVersion;
  });
}

/** Remove a whole target version (the previous one applies again from that day). */
export function deleteTargetVersion(db: Executor, validFrom: string, ctx: AuditContext): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const rows = tx
      .select()
      .from(assetClassTarget)
      .where(and(eq(assetClassTarget.validFrom, validFrom), isNull(assetClassTarget.deletedAt)))
      .all();
    if (rows.length === 0) throw new EntityNotFoundError('asset_class_target', validFrom);
    for (const r of rows) deleteTracked(tx, assetClassTarget, [r.id], grouped);
  });
}

/** Live asset classes that have a security (for pick lists and the "in use" hint). */
export function assetClassesInUse(db: Executor): Set<string> {
  return new Set(
    db
      .select({ id: security.assetClassId })
      .from(security)
      .where(and(isNull(security.deletedAt), isNotNull(security.assetClassId)))
      .all()
      .map((r) => r.id as string),
  );
}
