import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { assignmentRule, booking, payee } from '../schema';
import { withGroup, updateTracked, type AuditContext } from './audit';
import { createEntity, getEntity, updateEntity } from './entities';
import { ConflictError, EntityNotFoundError } from './errors';
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

/** Rename a payee (not a system payee); the new name must be free. */
export function renamePayee(db: Executor, id: string, name: string, ctx: AuditContext) {
  const next = cleanName(name);
  return runInTransaction(db, (tx) => {
    liveUserPayee(tx, id);
    assertNameFree(tx, next, id);
    return updateEntity(tx, payee, id, { name: next }, ctx);
  });
}

/**
 * Merge `sourceIds` into `targetId`: every booking and assignment rule of a source moves to the
 * target and the sources are soft-deleted, all in one audit group (one undo). The target keeps its
 * own contact and default category. Returns the number of moved bookings and the group id.
 */
export function mergePayees(
  db: Executor,
  sourceIds: readonly string[],
  targetId: string,
  ctx: AuditContext,
): { moved: number; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    liveUserPayee(tx, targetId);
    const sources = [...new Set(sourceIds)].filter((id) => id !== targetId);
    if (sources.length === 0) throw new ConflictError('Nothing to merge: pick other payees');
    for (const id of sources) liveUserPayee(tx, id);
    let moved = 0;
    for (const id of sources) {
      const bookings = tx
        .select({ id: booking.id })
        .from(booking)
        .where(eq(booking.payeeId, id))
        .all();
      for (const b of bookings) {
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
      updateTracked(tx, payee, [id], { deletedAt: new Date().toISOString() }, grouped, 'delete');
    }
    return { moved, groupId: grouped.groupId };
  });
}
