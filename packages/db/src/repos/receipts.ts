import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { booking, bookingReceipt, receipt } from '../schema';
import {
  insertTracked,
  nowIso,
  updateTracked,
  withGroup,
  type AuditContext,
  type AuditEntry,
} from './audit';
import { AuditError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

export function getReceipt(db: Executor, id: string) {
  const row = db
    .select()
    .from(receipt)
    .where(and(eq(receipt.id, id), isNull(receipt.deletedAt)))
    .get();
  if (!row?.sha256) throw new EntityNotFoundError('receipt', id);
  return row;
}

function liveBooking(db: Executor, id: string) {
  if (
    !db
      .select({ id: booking.id })
      .from(booking)
      .where(and(eq(booking.id, id), isNull(booking.deletedAt)))
      .get()
  )
    throw new EntityNotFoundError('booking', id);
}

/** Deleted bookings return their receipts to the inbox without removing historical links. */
export function listReceipts(db: Executor, bookingId?: string) {
  if (bookingId) liveBooking(db, bookingId);
  const liveLink = sql`EXISTS (SELECT 1 FROM booking_receipt br JOIN booking b ON b.id = br.booking_id
    WHERE br.receipt_id = ${receipt.id} AND br.deleted_at IS NULL AND b.deleted_at IS NULL
    ${bookingId ? sql`AND b.id = ${bookingId}` : sql``})`;
  return db
    .select()
    .from(receipt)
    .where(
      and(
        isNull(receipt.deletedAt),
        sql`${receipt.sha256} IS NOT NULL`,
        bookingId ? liveLink : sql`NOT ${liveLink}`,
        bookingId
          ? undefined
          : sql`NOT EXISTS (SELECT 1 FROM payslip_intake pi WHERE pi.receipt_id = ${receipt.id} AND pi.deleted_at IS NULL) AND NOT EXISTS (SELECT 1 FROM payslip p WHERE p.receipt_id = ${receipt.id} AND p.deleted_at IS NULL)`,
      ),
    )
    .orderBy(desc(receipt.createdAt), receipt.id)
    .all();
}

export function linkReceipt(db: Executor, receiptId: string, bookingId: string, ctx: AuditContext) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    getReceipt(tx, receiptId);
    liveBooking(tx, bookingId);
    const old = tx
      .select()
      .from(bookingReceipt)
      .where(and(eq(bookingReceipt.bookingId, bookingId), eq(bookingReceipt.receiptId, receiptId)))
      .get();
    if (old)
      updateTracked(
        tx,
        bookingReceipt,
        [bookingId, receiptId],
        { deletedAt: null },
        grouped,
        'restore',
      );
    else insertTracked(tx, bookingReceipt, { bookingId, receiptId }, grouped);
    return { groupId: grouped.groupId };
  });
}

export function addReceipt(
  db: Executor,
  input: { sha256: string; mime: string; sizeBytes: number; originalFilename: string },
  bookingId: string | undefined,
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (bookingId) liveBooking(tx, bookingId);
    const row = insertTracked(
      tx,
      receipt,
      { id: randomUUID(), ...input, storageKey: input.sha256, createdBy: ctx.actor },
      grouped,
    );
    if (bookingId) linkReceipt(tx, row.id, bookingId, grouped);
    return { receipt: row, groupId: grouped.groupId };
  });
}

export function unlinkReceipt(
  db: Executor,
  receiptId: string,
  bookingId: string,
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    getReceipt(tx, receiptId);
    liveBooking(tx, bookingId);
    updateTracked(
      tx,
      bookingReceipt,
      [bookingId, receiptId],
      { deletedAt: nowIso() },
      grouped,
      'delete',
    );
    return { groupId: grouped.groupId };
  });
}

/** Remove an unlinked inbox receipt; the blob is retained for undo and older backups. */
export function removeReceipt(db: Executor, id: string, ctx: AuditContext) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    getReceipt(tx, id);
    if (!listReceipts(tx).some((r) => r.id === id))
      throw new AuditError('Unlink the receipt before removing it');
    // Historical links on deleted bookings must not become live through a later booking undo.
    for (const link of tx
      .select()
      .from(bookingReceipt)
      .where(and(eq(bookingReceipt.receiptId, id), isNull(bookingReceipt.deletedAt)))
      .all())
      updateTracked(
        tx,
        bookingReceipt,
        [link.bookingId, id],
        { deletedAt: nowIso() },
        grouped,
        'delete',
      );
    updateTracked(tx, receipt, [id], { deletedAt: nowIso() }, grouped, 'delete');
    return { groupId: grouped.groupId };
  });
}

/** Even forced or partial undo must not leave a live link pointing to a deleted receipt. */
export function assertReceiptUndo(db: Executor, entries: AuditEntry[]) {
  if (!entries.some((e) => e.entityType === 'receipt' || e.entityType === 'booking_receipt'))
    return;
  const invalid = db
    .select({ id: receipt.id })
    .from(bookingReceipt)
    .innerJoin(receipt, eq(receipt.id, bookingReceipt.receiptId))
    .where(and(isNull(bookingReceipt.deletedAt), sql`${receipt.deletedAt} IS NOT NULL`))
    .get();
  if (invalid)
    throw new AuditError('Cannot undo: a receipt is still linked; undo the link action first');
  const payrollReference = db
    .select({ id: receipt.id })
    .from(receipt)
    .where(
      sql`${receipt.deletedAt} IS NOT NULL AND EXISTS (SELECT 1 FROM payslip p WHERE p.receipt_id = ${receipt.id} AND p.deleted_at IS NULL)`,
    )
    .get();
  if (payrollReference)
    throw new AuditError('Cannot undo: a receipt is still referenced by a payslip.');
}
