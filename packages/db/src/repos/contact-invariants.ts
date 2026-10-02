import { contactStatement } from '@budget/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  account,
  category,
  booking,
  bookingSplit,
  contact,
  contactAllocation,
  contactSettlement,
} from '../schema';
import { BookingInvariantError } from './errors';
import type { Executor } from './types';

export function actualContactMovements(tx: Executor, contactId: string, asOf?: string) {
  return tx
    .select({
      splitId: bookingSplit.id,
      bookingId: booking.id,
      date: booking.date,
      amountCents: bookingSplit.amountCents,
      memo: bookingSplit.memo,
      currency: booking.currency,
      status: booking.status,
      accountId: booking.accountId,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(
      and(
        eq(bookingSplit.contactId, contactId),
        isNull(booking.deletedAt),
        asOf ? sql`${booking.date} <= ${asOf}` : undefined,
      ),
    )
    .orderBy(booking.date, sql`${booking}.rowid`, bookingSplit.sortOrder)
    .all();
}

export function savedContactSettlements(tx: Executor, contactId: string, asOf?: string) {
  return tx
    .select({ settlement: contactSettlement, date: booking.date })
    .from(contactSettlement)
    .innerJoin(booking, eq(booking.id, contactSettlement.bookingId))
    .where(
      and(
        eq(contactSettlement.contactId, contactId),
        isNull(contactSettlement.deletedAt),
        asOf ? sql`${booking.date} <= ${asOf}` : undefined,
      ),
    )
    .all()
    .map(({ settlement: s }) => ({
      receiptSplitId: s.receiptSplitId,
      creditCents: s.creditCents,
      allocations: tx
        .select({
          outlaySplitId: contactAllocation.outlaySplitId,
          amountCents: contactAllocation.amountCents,
        })
        .from(contactAllocation)
        .where(and(eq(contactAllocation.settlementId, s.id), isNull(contactAllocation.deletedAt)))
        .all(),
    }));
}

/** Always checked after undo (including force); receipt, allocation and credit are inseparable. */
export function assertContactSettlementInvariants(tx: Executor): void {
  const referenced = tx
    .select({ contactId: bookingSplit.contactId, categoryId: bookingSplit.categoryId })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(and(isNull(booking.deletedAt), sql`${bookingSplit.contactId} IS NOT NULL`))
    .all();
  for (const ref of referenced) {
    const envelope =
      ref.categoryId && tx.select().from(category).where(eq(category.id, ref.categoryId)).get();
    if (!envelope || envelope.deletedAt !== null || envelope.kind !== 'advance')
      throw new BookingInvariantError('Contact movements must retain their live Auslagen category');
  }
  for (const id of new Set(referenced.map((r) => r.contactId!))) {
    const row = tx.select().from(contact).where(eq(contact.id, id)).get();
    if (!row || row.deletedAt !== null)
      throw new BookingInvariantError(
        'A contact with live ledger movements must retain its identity',
      );
  }
  for (const s of tx.select().from(contactSettlement).all()) {
    const cash = tx.select().from(booking).where(eq(booking.id, s.bookingId)).get();
    const parts = tx
      .select()
      .from(bookingSplit)
      .where(eq(bookingSplit.bookingId, s.bookingId))
      .all();
    const live = s.deletedAt === null;
    if (live !== (cash?.deletedAt === null))
      throw new BookingInvariantError('Contact receipt and settlement must be undone together');
    if (!live) continue;
    const cashAccount =
      cash && tx.select().from(account).where(eq(account.id, cash.accountId)).get();
    const envelope =
      parts[0]?.categoryId &&
      tx.select().from(category).where(eq(category.id, parts[0].categoryId)).get();
    if (
      !cashAccount ||
      cashAccount.deletedAt !== null ||
      cashAccount.currency !== 'EUR' ||
      !envelope ||
      envelope.deletedAt !== null ||
      envelope.kind !== 'advance'
    )
      throw new BookingInvariantError(
        'Contact settlement needs its live EUR cash account and Auslagen category',
      );
    const owner = tx.select().from(contact).where(eq(contact.id, s.contactId)).get();
    if (
      !owner ||
      owner.deletedAt !== null ||
      !cash ||
      cash.amountCents <= 0 ||
      cash.currency !== 'EUR' ||
      cash.transferId !== null ||
      cash.originalAmountCents !== null ||
      parts.length !== 1 ||
      parts[0]?.id !== s.receiptSplitId ||
      parts[0]?.contactId !== s.contactId ||
      parts[0]?.incomeTypeId !== null ||
      parts[0]?.amountCents !== cash.amountCents
    )
      throw new BookingInvariantError('Invalid contact settlement cash booking');
  }
  for (const a of tx
    .select()
    .from(contactAllocation)
    .where(isNull(contactAllocation.deletedAt))
    .all()) {
    const owner = tx
      .select()
      .from(contactSettlement)
      .where(eq(contactSettlement.id, a.settlementId))
      .get();
    if (!owner || owner.deletedAt !== null)
      throw new BookingInvariantError('Contact allocation has no live settlement');
  }
  const contacts = new Set(
    tx
      .select({ contactId: contactSettlement.contactId })
      .from(contactSettlement)
      .where(isNull(contactSettlement.deletedAt))
      .all()
      .map((s) => s.contactId),
  );
  for (const contactId of contacts) {
    try {
      contactStatement(
        actualContactMovements(tx, contactId),
        savedContactSettlements(tx, contactId),
      );
    } catch (error) {
      throw new BookingInvariantError(
        error instanceof Error ? error.message : 'Invalid contact allocation',
      );
    }
  }
}

/** Economic edits of a settlement or its allocated outlay must go through undo of the settlement. */
export function assertContactBookingWrite(
  tx: Executor,
  bookingId: string,
  operation: 'update' | 'delete' | 'restore',
  fields: Iterable<string> = [],
): void {
  const settlement = tx
    .select()
    .from(contactSettlement)
    .where(eq(contactSettlement.bookingId, bookingId))
    .get();
  const allocated = tx
    .select({ id: contactAllocation.id })
    .from(contactAllocation)
    .innerJoin(bookingSplit, eq(bookingSplit.id, contactAllocation.outlaySplitId))
    .innerJoin(contactSettlement, eq(contactSettlement.id, contactAllocation.settlementId))
    .where(
      and(
        eq(bookingSplit.bookingId, bookingId),
        isNull(contactAllocation.deletedAt),
        isNull(contactSettlement.deletedAt),
      ),
    )
    .get();
  if (!settlement && !allocated) return;
  if (operation === 'update' && [...fields].every((f) => ['memo', 'status', 'flag'].includes(f)))
    return;
  throw new BookingInvariantError(
    'Undo the related contact settlement before changing its receipt or allocated outlay',
  );
}

/** A forced undo cannot bypass a live allocation's economic dependency on its outlay. */
export function assertContactUndoDependencies(
  tx: Executor,
  entries: readonly {
    entityType: string;
    entityId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }[],
): void {
  const targets = tx
    .select({ splitId: bookingSplit.id, bookingId: bookingSplit.bookingId })
    .from(contactAllocation)
    .innerJoin(contactSettlement, eq(contactSettlement.id, contactAllocation.settlementId))
    .innerJoin(bookingSplit, eq(bookingSplit.id, contactAllocation.outlaySplitId))
    .where(and(isNull(contactAllocation.deletedAt), isNull(contactSettlement.deletedAt)))
    .all();
  for (const t of targets) {
    for (const entry of entries) {
      const fields =
        entry.entityType === 'booking' && entry.entityId === t.bookingId
          ? ['account_id', 'date', 'amount_cents', 'currency', 'deleted_at']
          : entry.entityType === 'booking_split' && entry.entityId === t.splitId
            ? [
                'booking_id',
                'amount_cents',
                'contact_id',
                'category_id',
                'income_type_id',
                'transfer_id',
              ]
            : [];
      if (fields.some((f) => (entry.before?.[f] ?? null) !== (entry.after?.[f] ?? null)))
        throw new BookingInvariantError(
          'Undo the related contact settlement before undoing its allocated outlay',
        );
    }
  }
}
