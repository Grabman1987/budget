import { contactCreditRecords, assertContactCreditRecords } from './contact-credit';
import { contactStatement } from '@budget/domain';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import {
  account,
  category,
  booking,
  bookingSplit,
  contact,
  contactAllocation,
  contactSettlement,
  payee,
} from '../schema';
import { BookingInvariantError, ConflictError } from './errors';
import { memoizedShared } from './request-memo';
import type { Executor } from './types';

/** Check only the changed identity: legacy contacts are not renamed or merged implicitly. */
export function assertContactName(tx: Executor, id: string) {
  const row = tx.select().from(contact).where(eq(contact.id, id)).get();
  if (!row || row.deletedAt !== null) return;
  if (
    tx
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.name, row.name), ne(contact.id, id), isNull(contact.deletedAt)))
      .get()
  )
    throw new ConflictError('Ein aktiver Kontakt mit diesem Namen ist bereits vorhanden.');
}

/** A zero booking with contact shares reclassifies money already held, never earned cash. */
/** Read once per request and database state; callers only look ids up (`has`). */
export function cashlessContactBookingIds(db: Executor): Set<string> {
  return memoizedShared(db, 'cashlessContactBookingIds', () => readCashlessContactBookingIds(db));
}

function readCashlessContactBookingIds(db: Executor): Set<string> {
  const gifts = new Set(
    contactCreditRecords(db)
      .filter((r) => r.decision && !r.decision.creditSplitId)
      .map((r) => r.bookingId),
  );
  return new Set(
    db
      .select({ id: booking.id })
      .from(booking)
      .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
      .where(
        and(
          isNull(booking.deletedAt),
          eq(booking.amountCents, 0),
          sql`${bookingSplit.contactId} IS NOT NULL`,
        ),
      )
      .all()
      .map((b) => b.id)
      .filter((id) => !gifts.has(id)),
  );
}

export function actualContactMovements(tx: Executor, contactId: string, asOf?: string) {
  const records = contactCreditRecords(tx);
  return tx
    .select({
      categoryId: category.id,
      categoryKind: category.kind,
      splitId: bookingSplit.id,
      bookingId: booking.id,
      date: booking.date,
      amountCents: bookingSplit.amountCents,
      memo: bookingSplit.memo,
      bookingMemo: booking.memo,
      payeeName: payee.name,
      categoryName: category.name,
      currency: booking.currency,
      status: booking.status,
      accountId: booking.accountId,
      onBudget: account.onBudget,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .leftJoin(category, eq(category.id, bookingSplit.categoryId))
    .where(
      and(
        eq(bookingSplit.contactId, contactId),
        isNull(booking.deletedAt),
        asOf ? sql`${booking.date} <= ${asOf}` : undefined,
      ),
    )
    .orderBy(booking.date, sql`${booking}.rowid`, bookingSplit.sortOrder)
    .all()
    .map((m) => {
      const decision = records.find((r) => r.bookingId === m.bookingId)?.decision;
      const target =
        decision?.categoryId && decision.creditSplitId === m.splitId
          ? tx.select().from(category).where(eq(category.id, decision.categoryId)).get()
          : null;
      return {
        ...m,
        categoryName: target ? `Vorgemerkt: ${target.name}` : m.categoryName,
        categoryId: m.categoryKind === 'advance' ? null : m.categoryId,
        ...(decision?.debitSplitId === m.splitId
          ? { creditSourceSplitId: decision.sourceSplitId }
          : {}),
        ...(decision?.creditSplitId === m.splitId
          ? { creditOnly: true, creditCategoryId: decision.categoryId }
          : {}),
      };
    });
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
    if (
      !envelope ||
      envelope.deletedAt !== null ||
      (envelope.kind !== 'advance' &&
        (envelope.class === null || ['income', 'card_payment'].includes(envelope.kind)))
    )
      throw new BookingInvariantError(
        'Contact movements must retain a live expense or Auslagen category',
      );
  }
  for (const id of new Set(referenced.map((r) => r.contactId!))) {
    const row = tx.select().from(contact).where(eq(contact.id, id)).get();
    if (!row || row.deletedAt !== null)
      throw new BookingInvariantError(
        'A contact with live ledger movements must retain its identity',
      );
  }
  const creditRecords = contactCreditRecords(tx);
  for (const s of tx.select().from(contactSettlement).all()) {
    const modeled = creditRecords.some(
      (r) => r.bookingId === s.bookingId && r.repayments?.includes(s.receiptSplitId),
    );
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
    const receipt = parts.find((p) => p.id === s.receiptSplitId);
    const envelope =
      receipt?.categoryId &&
      tx.select().from(category).where(eq(category.id, receipt.categoryId)).get();
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
      (cash.amountCents <= 0 && !modeled) ||
      cash.currency !== 'EUR' ||
      cash.transferId !== null ||
      cash.originalAmountCents !== null ||
      !receipt ||
      receipt.contactId !== s.contactId ||
      receipt.incomeTypeId !== null ||
      receipt.transferId !== null ||
      receipt.amountCents <= 0
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
  const contacts = new Set(referenced.map((r) => r.contactId!));
  const uses: NonNullable<ReturnType<typeof contactStatement>['creditUses']> = [];
  for (const contactId of contacts) {
    try {
      const statement = contactStatement(
        actualContactMovements(tx, contactId),
        savedContactSettlements(tx, contactId),
      );
      uses.push(...statement.creditUses);
    } catch (error) {
      throw new BookingInvariantError(
        error instanceof Error ? error.message : 'Invalid contact allocation',
      );
    }
  }
  assertContactCreditRecords(tx, uses);
}

/** Write-offs are plain zero bookings, so their outlay must stay unchanged until they are undone. */
function assertNoLaterWriteOff(tx: Executor, bookingId: string): void {
  const row = tx.select().from(booking).where(eq(booking.id, bookingId)).get();
  if (!row || row.amountCents === 0) return;
  const contacts = tx
    .select({ contactId: bookingSplit.contactId })
    .from(bookingSplit)
    .where(and(eq(bookingSplit.bookingId, bookingId), sql`${bookingSplit.contactId} IS NOT NULL`))
    .all()
    .map((r) => r.contactId!);
  for (const contactId of new Set(contacts)) {
    const writeOff = tx
      .select({ date: booking.date })
      .from(booking)
      .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
      .where(
        and(
          eq(bookingSplit.contactId, contactId),
          isNull(booking.deletedAt),
          eq(booking.amountCents, 0),
          sql`${booking.date} >= ${row.date}`,
        ),
      )
      .get();
    if (writeOff) {
      const [y, m, d] = writeOff.date.split('-');
      throw new BookingInvariantError(
        `Auslage ist durch einen Ausgleich vom ${d}.${m}.${y} gebunden; zuerst den Ausgleich rückgängig machen.`,
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
  const fieldList = [...fields];
  const economic =
    operation === 'update' && !fieldList.every((f) => ['memo', 'status', 'flag'].includes(f));
  if (operation === 'delete' || economic) assertNoLaterWriteOff(tx, bookingId);
  const creditRecord = contactCreditRecords(tx).find((r) => r.bookingId === bookingId);
  if (
    !settlement &&
    !allocated &&
    !creditRecord?.decision &&
    !creditRecord?.uses?.length &&
    !creditRecord?.repayments?.length
  )
    return;
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
