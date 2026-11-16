import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { PAYEE_ALIAS_ALL_SOURCES, payeeAliasKeys } from '@budget/domain';
import { assignmentRule, bankPayeeAlias, booking, category, payee } from '../schema';
import { remapAssignmentReferences } from './assignment-rules';
import { insertTracked, withGroup, updateTracked, type AuditContext } from './audit';
import type { WriteOptions } from './bookings';
import { createEntity, getEntity, updateEntity } from './entities';
import { CategoryRuleError, ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

/** Payees (Empfänger): create, rename and merge. System payees (Eröffnungssaldo, …) are fixed. */

export interface PayeeListing {
  id: string;
  name: string;
  contactId: string | null;
  defaultCategoryId: string | null;
  systemKind: string | null;
  bookingCount: number;
  lastBookingDate: string | null;
}

/** Live payees by name with the number of live bookings and the day of the latest one. */
export function listPayees(db: Executor): PayeeListing[] {
  return db
    .select({
      id: payee.id,
      name: payee.name,
      contactId: payee.contactId,
      defaultCategoryId: payee.defaultCategoryId,
      systemKind: payee.systemKind,
      bookingCount: sql<number>`COUNT(${booking.id})`.mapWith(Number),
      lastBookingDate: sql<string | null>`MAX(${booking.date})`,
    })
    .from(payee)
    .leftJoin(booking, and(eq(booking.payeeId, payee.id), isNull(booking.deletedAt)))
    .where(isNull(payee.deletedAt))
    .groupBy(payee.id)
    .orderBy(asc(sql`lower(${payee.name})`), asc(payee.id))
    .all();
}

const cleanName = (name: string): string => {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (trimmed === '') throw new ConflictError('A payee needs a name');
  return trimmed;
};

function assertNameFree(db: Executor, name: string, exceptId?: string): void {
  const clash = db
    .select({ id: payee.id })
    .from(payee)
    .where(and(isNull(payee.deletedAt), sql`lower(${payee.name}) = lower(${name})`))
    .all()
    .find((row) => row.id !== exceptId);
  if (clash) throw new ConflictError(`A payee named "${name}" exists; merge them instead`);
}

/** Create a payee; the name must be new (case-insensitive), otherwise merge. */
export function createPayee(
  db: Executor,
  input: { name: string; contactId?: string | null; defaultCategoryId?: string | null },
  ctx: AuditContext,
) {
  const name = cleanName(input.name);
  return runInTransaction(db, (tx) => {
    assertNameFree(tx, name);
    return createEntity(
      tx,
      payee,
      {
        name,
        contactId: input.contactId ?? null,
        defaultCategoryId: input.defaultCategoryId ?? null,
      },
      ctx,
    );
  });
}

function liveUserPayee(db: Executor, id: string) {
  const row = getEntity(db, payee, id);
  if (!row) throw new EntityNotFoundError('payee', id);
  if (row.systemKind) throw new ConflictError(`"${row.name}" is a system payee and stays as it is`);
  return row;
}

/** A default category must be live and a spending one: an income category is never a default. */
function assertDefaultCategory(db: Executor, categoryId: string): void {
  const row = db
    .select({ kind: category.kind })
    .from(category)
    .where(and(eq(category.id, categoryId), isNull(category.deletedAt)))
    .get();
  if (!row) throw new CategoryRuleError('Diese Kategorie gibt es nicht (mehr).');
  if (row.kind === 'income')
    throw new CategoryRuleError('Eine Einnahmen-Kategorie kann nicht als Vorgabe dienen.');
}

/**
 * Rename a payee and/or set (or clear) the category capture pre-fills for it, in one transaction
 * and one audit entry: everything is validated first, so a refused change writes nothing. System
 * payees are fixed; the new name must be free; the category must be live and not an income one.
 */
export function updatePayee(
  db: Executor,
  id: string,
  input: { name?: string; defaultCategoryId?: string | null },
  ctx: AuditContext,
) {
  const next = input.name === undefined ? undefined : cleanName(input.name);
  return runInTransaction(db, (tx) => {
    liveUserPayee(tx, id);
    if (input.defaultCategoryId) assertDefaultCategory(tx, input.defaultCategoryId);
    if (next !== undefined) assertNameFree(tx, next, id);
    return updateEntity(
      tx,
      payee,
      id,
      {
        ...(next !== undefined ? { name: next } : {}),
        ...(input.defaultCategoryId !== undefined
          ? { defaultCategoryId: input.defaultCategoryId }
          : {}),
      },
      ctx,
    );
  });
}

/** Rename a payee (not a system payee); the new name must be free. */
export const renamePayee = (db: Executor, id: string, name: string, ctx: AuditContext) =>
  updatePayee(db, id, { name }, ctx);

/** Set (or clear) the category a payee is booked to by default: capture pre-fills it. */
export const setPayeeDefaultCategory = (
  db: Executor,
  id: string,
  categoryId: string | null,
  ctx: AuditContext,
) => updatePayee(db, id, { defaultCategoryId: categoryId }, ctx);

/** Result of a merge: moved and skipped (reconciled) bookings, sources kept alive for them. */
export interface PayeeMergeResult {
  moved: number;
  /** Reconciled (geprüft) bookings left with their payee because the merge was not unlocked. */
  skipped: number;
  /** Sources that still hold skipped bookings and therefore stay (not deleted). */
  keptSourceIds: string[];
  groupId: string;
  /** Names remembered as aliases of the target (later bank lines with that text get the target). */
  aliases: string[];
}

/**
 * Remember the merged payee names as aliases of the target. No new table: `bank_payee_alias` (the
 * bank-line learning) carries them under the source id `*`, which `suggestedBankPayee` reads for
 * every bank source. Existing live aliases are re-pointed; the target's own name needs none.
 */
function writeMergeAliases(
  db: Executor,
  names: readonly string[],
  target: { id: string; name: string },
  ctx: ReturnType<typeof withGroup>,
): string[] {
  const own = new Set(payeeAliasKeys(target.name));
  const written: string[] = [];
  for (const name of names)
    for (const rawKey of payeeAliasKeys(name)) {
      if (own.has(rawKey)) continue;
      const id = createHash('sha256')
        .update(JSON.stringify([PAYEE_ALIAS_ALL_SOURCES, rawKey]))
        .digest('hex');
      const existing = db.select().from(bankPayeeAlias).where(eq(bankPayeeAlias.id, id)).get();
      if (!existing)
        insertTracked(
          db,
          bankPayeeAlias,
          { id, sourceId: PAYEE_ALIAS_ALL_SOURCES, rawKey, payeeId: target.id },
          ctx,
        );
      else if (existing.payeeId !== target.id || existing.deletedAt !== null)
        updateTracked(db, bankPayeeAlias, [id], { payeeId: target.id, deletedAt: null }, ctx);
      if (!written.includes(name)) written.push(name);
    }
  return written;
}

/** What a merge would change, without writing anything: the dialog shows it before confirming. */
export interface PayeeMergePreview {
  bookings: number;
  /** Reconciled bookings among them: moved only when unlocked, otherwise they stay. */
  reconciled: number;
  rules: number;
  aliases: string[];
}

export function previewPayeeMerge(
  db: Executor,
  sourceIds: readonly string[],
  targetId: string,
): PayeeMergePreview {
  liveUserPayee(db, targetId);
  const ids = [...new Set(sourceIds)].filter((id) => id !== targetId);
  if (ids.length === 0) throw new ConflictError('Nothing to merge: pick other payees');
  const names = ids.map((id) => liveUserPayee(db, id).name);
  const rows = db
    .select({ status: booking.status })
    .from(booking)
    .where(and(inArray(booking.payeeId, ids), isNull(booking.deletedAt)))
    .all();
  const rules = db
    .select({
      id: assignmentRule.id,
      payeeId: assignmentRule.payeeId,
      match: assignmentRule.matchJson,
    })
    .from(assignmentRule)
    .where(isNull(assignmentRule.deletedAt))
    .all()
    .filter(
      (r) =>
        (r.payeeId !== null && ids.includes(r.payeeId)) ||
        ids.some((id) => r.match.includes(JSON.stringify(id))),
    );
  return {
    bookings: rows.length,
    reconciled: rows.filter((r) => r.status === 'reconciled').length,
    rules: rules.length,
    aliases: names,
  };
}

export interface PayeeAliasRow {
  id: string;
  rawKey: string;
  payeeId: string;
}

/** Live aliases written by merges (source `*`), for the "Aliase" list under each payee. */
export function listPayeeAliases(db: Executor): PayeeAliasRow[] {
  return db
    .select({
      id: bankPayeeAlias.id,
      rawKey: bankPayeeAlias.rawKey,
      payeeId: bankPayeeAlias.payeeId,
    })
    .from(bankPayeeAlias)
    .where(
      and(eq(bankPayeeAlias.sourceId, PAYEE_ALIAS_ALL_SOURCES), isNull(bankPayeeAlias.deletedAt)),
    )
    .orderBy(asc(bankPayeeAlias.rawKey))
    .all();
}

/** Remove one merge alias (soft delete, undoable through the returned group). */
export function removePayeeAlias(db: Executor, id: string, ctx: AuditContext) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = tx.select().from(bankPayeeAlias).where(eq(bankPayeeAlias.id, id)).get();
    if (!row || row.deletedAt !== null || row.sourceId !== PAYEE_ALIAS_ALL_SOURCES)
      throw new EntityNotFoundError('payee alias', id);
    updateTracked(
      tx,
      bankPayeeAlias,
      [id],
      { deletedAt: new Date().toISOString() },
      grouped,
      'delete',
    );
    return { groupId: grouped.groupId };
  });
}

/**
 * Merge `sourceIds` into `targetId`: every booking and assignment rule of a source moves to the
 * target and the sources are soft-deleted, all in one audit group (one undo). The target keeps its
 * own contact and default category. Reconciled (geprüft) bookings are locked: without
 * `unlockReconciled` they stay with their payee, are counted in `skipped`, and a source that still
 * holds such a booking is kept instead of deleted.
 */
export function mergePayees(
  db: Executor,
  sourceIds: readonly string[],
  targetId: string,
  ctx: AuditContext,
  options: WriteOptions = {},
): PayeeMergeResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const target = liveUserPayee(tx, targetId);
    const sources = [...new Set(sourceIds)].filter((id) => id !== targetId);
    if (sources.length === 0) throw new ConflictError('Nothing to merge: pick other payees');
    const names = sources.map((id) => liveUserPayee(tx, id).name);
    let moved = 0;
    let skipped = 0;
    const keptSourceIds: string[] = [];
    for (const id of sources) {
      const bookings = tx
        .select({ id: booking.id, status: booking.status, deletedAt: booking.deletedAt })
        .from(booking)
        .where(eq(booking.payeeId, id))
        .all();
      let kept = false;
      for (const b of bookings) {
        if (b.status === 'reconciled' && b.deletedAt === null && !options.unlockReconciled) {
          skipped += 1;
          kept = true;
          continue;
        }
        updateTracked(tx, booking, [b.id], { payeeId: targetId }, grouped);
        moved += 1;
      }
      const rules = tx
        .select({ id: assignmentRule.id })
        .from(assignmentRule)
        .where(eq(assignmentRule.payeeId, id))
        .all();
      for (const r of rules)
        updateTracked(tx, assignmentRule, [r.id], { payeeId: targetId }, grouped);
      remapAssignmentReferences(tx, 'payee', id, targetId, grouped);
      if (kept) keptSourceIds.push(id);
      else
        updateTracked(tx, payee, [id], { deletedAt: new Date().toISOString() }, grouped, 'delete');
    }
    const aliases = writeMergeAliases(tx, names, target, grouped);
    return { moved, skipped, keptSourceIds, groupId: grouped.groupId, aliases };
  });
}
