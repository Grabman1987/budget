import {
  todayInVienna,
  validateTargetPolicy,
  resolveTargetTier,
  type ManagedTarget,
  type TargetTier,
  type TargetPolicy,
} from '@budget/domain';
import { replaceExposureVersion } from './asset-exposure';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import {
  account,
  assetClass,
  assetClassTarget,
  assetTargetVersion,
  holding,
  institution,
  savingsPlan,
  security,
  securityAssetExposure,
  trade,
} from '../schema';
import { deleteTracked, insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { entityRepo, type NewRow, type RowPatch } from './entities';
import { BookingInvariantError, ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

export type SecurityRecord = typeof security.$inferSelect;
export type AssetClassRow = typeof assetClass.$inferSelect;
export type TargetRow = typeof assetClassTarget.$inferSelect & { bandMode?: 'standard' | 'custom' };

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
    if (!row || row.isGroup)
      throw new BookingInvariantError('Bitte eine vorhandene aktive Anlageklasse wählen.');
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
  values: NewRow<typeof security> & { exposureValidFrom?: string },
  ctx: AuditContext,
): SecurityRecord {
  return runInTransaction(db, (tx) => {
    checkRefs(tx, values);
    checkIsin(tx, values.isin);
    const grouped = withGroup(ctx);
    const { exposureValidFrom, ...metadata } = values;
    const row = securityRepo.create(tx, metadata, grouped);
    replaceExposureVersion(
      tx,
      row.id,
      {
        validFrom: exposureValidFrom ?? todayInVienna(),
        complete: Boolean(row.assetClassId),
        source: 'instrument_edit',
        weights: row.assetClassId ? [{ assetClassId: row.assetClassId, weightBp: 10000 }] : [],
      },
      grouped,
    );
    return row;
  });
}

export function updateSecurity(
  db: Executor,
  id: string,
  patch: RowPatch<typeof security> & { exposureValidFrom?: string },
  ctx: AuditContext,
): SecurityRecord {
  return runInTransaction(db, (tx) => {
    checkRefs(tx, patch);
    checkIsin(tx, patch.isin, id);
    const grouped = withGroup(ctx);
    const { exposureValidFrom, ...metadata } = patch;
    const row = securityRepo.update(tx, id, metadata, grouped);
    if (patch.assetClassId !== undefined)
      replaceExposureVersion(
        tx,
        id,
        {
          validFrom: exposureValidFrom ?? todayInVienna(),
          complete: Boolean(patch.assetClassId),
          source: 'instrument_edit',
          weights: patch.assetClassId
            ? [{ assetClassId: patch.assetClassId, weightBp: 10000 }]
            : [],
        },
        grouped,
      );
    return row;
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

export const listAssetClasses = (db: Executor, options: { includeDeleted?: boolean } = {}) =>
  assetClassRepo.list(db, options);
export const getAssetClass = (db: Executor, id: string) => assetClassRepo.get(db, id);
function checkedClassName(tx: Executor, name: string, exceptId?: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80)
    throw new RangeError('Bitte einen Namen mit 1 bis 80 Zeichen eingeben.');
  if (
    listAssetClasses(tx, { includeDeleted: true }).some(
      (c) =>
        c.id !== exceptId &&
        c.name.trim().toLocaleLowerCase('de-AT') === trimmed.toLocaleLowerCase('de-AT'),
    )
  )
    throw new ConflictError(
      'Eine Anlageklasse mit diesem Namen ist bereits vorhanden, gegebenenfalls im Archiv.',
    );
  return trimmed;
}
export function createAssetClass(
  db: Executor,
  values: NewRow<typeof assetClass>,
  ctx: AuditContext,
) {
  if (
    values.sortOrder !== undefined &&
    (!Number.isSafeInteger(values.sortOrder) || values.sortOrder < 0 || values.sortOrder > 100000)
  )
    throw new RangeError('Bitte eine Sortierposition zwischen 0 und 100000 eingeben.');
  return runInTransaction(db, (tx) => {
    const row = assetClassRepo.create(
      tx,
      { ...values, name: checkedClassName(tx, values.name) },
      ctx,
    );
    assertAssetClassTree(tx);
    return row;
  });
}
export function updateAssetClass(
  db: Executor,
  id: string,
  patch: RowPatch<typeof assetClass>,
  ctx: AuditContext,
) {
  if (!getAssetClass(db, id)) throw new RangeError('Die Anlageklasse ist nicht verfügbar.');
  if (
    patch.sortOrder !== undefined &&
    (!Number.isSafeInteger(patch.sortOrder) || patch.sortOrder < 0 || patch.sortOrder > 100000)
  )
    throw new RangeError('Bitte eine Sortierposition zwischen 0 und 100000 eingeben.');
  return runInTransaction(db, (tx) => {
    const current = getAssetClass(tx, id)!;
    if (patch.isGroup !== undefined && patch.isGroup !== current.isGroup)
      throw new RangeError('Gruppen und Anlageklassen können nicht ineinander umgewandelt werden.');
    const row = assetClassRepo.update(
      tx,
      id,
      {
        ...patch,
        ...(patch.name !== undefined ? { name: checkedClassName(tx, patch.name, id) } : {}),
      },
      ctx,
    );
    assertAssetClassTree(tx);
    return row;
  });
}
export function restoreAssetClass(db: Executor, id: string, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const cls = assetClassRepo.get(tx, id, { includeDeleted: true });
    if (!cls) throw new RangeError('Die Anlageklasse ist nicht verfügbar.');
    if (!cls.deletedAt) throw new RangeError('Die Anlageklasse ist bereits aktiv.');
    checkedClassName(tx, cls.name, id);
    const row = assetClassRepo.restore(tx, id, ctx);
    assertAssetClassTree(tx);
    return row;
  });
}

/** Soft-delete an asset class; refused while a live security belongs to it. */
export function deleteAssetClass(
  db: Executor,
  id: string,
  ctx: AuditContext,
  asOf = todayInVienna(),
): void {
  runInTransaction(db, (tx) => {
    if (!getAssetClass(tx, id)) throw new RangeError('Die Anlageklasse ist nicht verfügbar.');
    const versions = listTargetVersions(tx);
    const current = versions.filter((v) => v.validFrom <= asOf).at(-1);
    const relevant = [...(current ? [current] : []), ...versions.filter((v) => v.validFrom > asOf)];
    if (
      relevant.some((v) =>
        [...v.targets, ...v.tiers.flatMap((t) => t.targets)].some(
          (t) => t.assetClassId === id && t.targetShareBp > 0,
        ),
      )
    )
      throw new ConflictError(
        'Diese Anlageklasse hat eine positive aktuelle oder zukünftige Sollquote. Bitte im selben Vorgang eine vollständige Ersatz-Sollversion ohne diese Klasse speichern.',
      );
    const used = tx
      .select({ id: security.id })
      .from(security)
      .where(and(eq(security.assetClassId, id), isNull(security.deletedAt)))
      .get();
    const exposure = tx
      .select()
      .from(securityAssetExposure)
      .where(eq(securityAssetExposure.assetClassId, id))
      .get();
    const cash = tx
      .select()
      .from(account)
      .where(and(eq(account.allocationAssetClassId, id), isNull(account.deletedAt)))
      .get();
    if (used || exposure || cash)
      throw new ConflictError(
        'Archivieren ist nicht möglich: Diese Anlageklasse wird von Wertpapieren, deren Klassifikationshistorie oder Anlage-Cash verwendet. Die Historie bleibt erhalten.',
      );
    assetClassRepo.softDelete(tx, id, ctx);
    assertAssetClassTree(tx);
  });
}

export type AssetTargetInput = ManagedTarget;

export interface TargetVersion {
  validFrom: string;
  targets: TargetRow[];
  sumBp: number;
  tiers: TargetTier[];
  label: string | null;
  reason: string | null;
  createdAt: string | null;
  auditGroupId: string | null;
}

function liveClassIds(tx: Executor): string[] {
  return assetClassRepo
    .list(tx)
    .filter((c) => !c.isGroup)
    .map((c) => c.id);
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

/** Complete versions, preserving the legacy storage unchanged until an explicit edit. */
export function listTargetVersions(db: Executor): TargetVersion[] {
  const byDay = new Map<string, TargetVersion>();
  for (const t of allTargets(db)) {
    const v = byDay.get(t.validFrom) ?? {
      validFrom: t.validFrom,
      targets: [],
      sumBp: 0,
      tiers: [],
      label: null,
      reason: null,
      createdAt: t.createdAt,
      auditGroupId: null,
    };
    v.targets.push(t);
    v.sumBp += t.targetShareBp;
    byDay.set(t.validFrom, v);
  }
  for (const row of db.select().from(assetTargetVersion).all()) {
    if (row.deletedAt !== null) continue;
    byDay.delete(row.validFrom);
    const policy = JSON.parse(row.policyJson) as TargetPolicy;
    byDay.set(row.validFrom, {
      validFrom: row.validFrom,
      label: row.label,
      reason: row.reason,
      createdAt: row.createdAt,
      auditGroupId: row.auditGroupId,
      tiers: policy.tiers,
      sumBp: policy.targets.reduce((sum, t) => sum + t.targetShareBp, 0),
      targets: policy.targets.map((t) => ({
        ...t,
        id: t.assetClassId + '@' + row.validFrom,
        validFrom: row.validFrom,
        bandBp: t.bandBp ?? 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: null,
      })),
    });
  }
  return [...byDay.values()].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
}

/** Omission is unmanaged; a stored zero is managed. Each version replaces the whole universe. */
export function targetsAsOf(
  db: Executor,
  day: string,
  includeDay = true,
  investmentCents: number | null = null,
): TargetRow[] {
  const version = listTargetVersions(db)
    .filter((v) => v.validFrom < day || (includeDay && v.validFrom === day))
    .at(-1);
  if (!version) return [];
  if (!version.tiers.length) return version.targets;
  return resolveTargetTier(version, investmentCents).targets.map((t) => ({
    ...t,
    id: t.assetClassId + '@' + version.validFrom,
    validFrom: version.validFrom,
    bandBp: t.bandBp ?? 0,
    createdAt: version.createdAt ?? '',
    updatedAt: version.createdAt ?? '',
    deletedAt: null,
  }));
}

export interface TargetVersionOptions {
  label?: string | null;
  reason?: string | null;
  tiers?: TargetTier[];
  /** Legacy programmatic callers retain their explicit reduce-to-zero behaviour. The settings API supplies complete snapshots. */
  completeSnapshot?: boolean;
  archiveClassId?: string;
  asOf?: string;
}

export function setTargets(
  db: Executor,
  validFrom: string,
  targets: ReadonlyArray<AssetTargetInput>,
  ctx: AuditContext,
  options: TargetVersionOptions = {},
): TargetVersion {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(validFrom) ||
      !Number.isFinite(Date.parse(validFrom)) ||
      new Date(validFrom).toISOString().slice(0, 10) !== validFrom
    )
      throw new RangeError('Bitte ein gültiges Wirksamkeitsdatum eingeben.');
    const wanted = [...targets];
    if (!options.completeSnapshot) {
      for (const t of targetsAsOf(tx, validFrom, false))
        if (t.targetShareBp > 0 && !wanted.some((w) => w.assetClassId === t.assetClassId))
          wanted.push({ assetClassId: t.assetClassId, targetShareBp: 0 });
    }
    const policy: TargetPolicy = { targets: wanted, tiers: options.tiers ?? [] };
    validateTargetPolicy(policy, new Set(liveClassIds(tx)));
    const label = options.label?.trim() || null;
    const reason = options.reason?.trim() || null;
    if ((label?.length ?? 0) > 80 || (reason?.length ?? 0) > 500)
      throw new RangeError(
        'Bezeichnung darf höchstens 80, Begründung höchstens 500 Zeichen haben.',
      );
    // Upgrade a legacy same-day version atomically, so undo restores its original rows exactly.
    for (const row of tx
      .select()
      .from(assetClassTarget)
      .where(and(eq(assetClassTarget.validFrom, validFrom), isNull(assetClassTarget.deletedAt)))
      .all())
      deleteTracked(tx, assetClassTarget, [row.id], grouped);
    const existing = tx
      .select()
      .from(assetTargetVersion)
      .where(eq(assetTargetVersion.validFrom, validFrom))
      .get();
    const values = {
      validFrom,
      label,
      reason,
      policyJson: JSON.stringify(policy),
      auditGroupId: grouped.groupId,
      deletedAt: null,
    };
    if (existing) updateTracked(tx, assetTargetVersion, [existing.id], values, grouped);
    else insertTracked(tx, assetTargetVersion, { id: validFrom, ...values }, grouped);
    if (options.archiveClassId) deleteAssetClass(tx, options.archiveClassId, grouped, options.asOf);
    return listTargetVersions(tx).find((v) => v.validFrom === validFrom)!;
  });
}

export function deleteTargetVersion(db: Executor, validFrom: string, ctx: AuditContext): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const header = tx
      .select()
      .from(assetTargetVersion)
      .where(and(eq(assetTargetVersion.validFrom, validFrom), isNull(assetTargetVersion.deletedAt)))
      .get();
    if (header) deleteTracked(tx, assetTargetVersion, [header.id], grouped);
    const rows = tx
      .select()
      .from(assetClassTarget)
      .where(and(eq(assetClassTarget.validFrom, validFrom), isNull(assetClassTarget.deletedAt)))
      .all();
    if (!header && !rows.length) throw new RangeError('Die Sollversion ist nicht verfügbar.');
    for (const row of rows) deleteTracked(tx, assetClassTarget, [row.id], grouped);
    assertAssetTargetInvariants(tx);
  });
}

/** Replayed writes must not bypass sums, references, unique names or archive dependencies. */
export function assertAssetTargetInvariants(db: Executor, asOf = todayInVienna()) {
  assertAssetClassTree(db);
  const classes = listAssetClasses(db, { includeDeleted: true });
  const ids = new Set(classes.map((c) => c.id));
  const versions = listTargetVersions(db);
  for (const v of versions) validateTargetPolicy(v, ids);
  const relevant = [
    ...versions.filter((v) => v.validFrom <= asOf).slice(-1),
    ...versions.filter((v) => v.validFrom > asOf),
  ];
  for (const cls of classes.filter((c) => c.deletedAt !== null)) {
    if (
      relevant.some((v) =>
        [...v.targets, ...v.tiers.flatMap((t) => t.targets)].some(
          (t) => t.assetClassId === cls.id && t.targetShareBp > 0,
        ),
      )
    )
      throw new ConflictError(
        'Die Änderung würde einer archivierten Anlageklasse eine positive Sollquote zuweisen.',
      );
    if (
      db
        .select()
        .from(account)
        .where(and(eq(account.allocationAssetClassId, cls.id), isNull(account.deletedAt)))
        .get() ||
      db
        .select()
        .from(security)
        .where(and(eq(security.assetClassId, cls.id), isNull(security.deletedAt)))
        .get()
    )
      throw new ConflictError(
        'Die archivierte Anlageklasse wird noch von Anlage-Cash oder Wertpapieren verwendet.',
      );
  }
}

/** Also checked after audit replay: no cycles, grandchildren or live children of archived groups. */
export function assertAssetClassTree(db: Executor) {
  const classes = listAssetClasses(db, { includeDeleted: true });
  for (const cls of classes) {
    if (cls.isGroup && cls.parentId)
      throw new RangeError('Eine Gruppe darf keine übergeordnete Gruppe haben.');
    if (cls.parentId) {
      const parent = classes.find((c) => c.id === cls.parentId);
      if (
        !parent?.isGroup ||
        parent.parentId ||
        (cls.deletedAt === null && parent.deletedAt !== null)
      )
        throw new RangeError(
          'Bitte eine aktive Gruppe wählen. Es sind höchstens zwei Ebenen möglich.',
        );
    }
    if (
      cls.isGroup &&
      (db.select().from(security).where(eq(security.assetClassId, cls.id)).get() ||
        db
          .select()
          .from(securityAssetExposure)
          .where(eq(securityAssetExposure.assetClassId, cls.id))
          .get() ||
        db.select().from(account).where(eq(account.allocationAssetClassId, cls.id)).get() ||
        listTargetVersions(db).some((v) =>
          [...v.targets, ...v.tiers.flatMap((t) => t.targets)].some(
            (t) => t.assetClassId === cls.id,
          ),
        ))
    )
      throw new RangeError('Positionen und Sollquoten gehören zu Anlageklassen, nicht zu Gruppen.');
  }
}

export function assertAssetClassName(db: Executor, id: string) {
  const cls = assetClassRepo.get(db, id, { includeDeleted: true });
  if (cls) checkedClassName(db, cls.name, id);
}

/** Live asset classes that have a security (for pick lists and the "in use" hint). */
export function assetClassesInUse(db: Executor): Set<string> {
  return new Set(
    db
      .select({ id: securityAssetExposure.assetClassId })
      .from(securityAssetExposure)
      .all()
      .map((r) => r.id as string),
  );
}
