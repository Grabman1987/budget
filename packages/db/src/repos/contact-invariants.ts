import {
  contactCreditRecords,
  assertContactCreditRecords,
  parseContactCreditRecord,
} from './contact-credit';
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
  auditLog,
} from '../schema';
import { BookingInvariantError, ConflictError, ReconciledLockedError } from './errors';
import { memoizedShared } from './request-memo';
import type { Executor } from './types';
import { CONTACT_UNLOCK_PREFIX } from './contact-allocation-lock';

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

export function actualContactMovements(
  tx: Executor,
  contactId: string,
  asOf?: string,
  records = contactCreditRecords(tx),
) {
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
      const record = records.find((r) => r.bookingId === m.bookingId);
      const decision = record?.decision;
      const historical = asOf ? record?.useHistory?.find((h) => h.date > asOf) : undefined;
      const explicitUses = historical?.explicitUses ?? record?.explicitUses;
      const uses = historical?.uses ?? record?.uses;
      const target =
        decision?.categoryId && decision.creditSplitId === m.splitId
          ? tx.select().from(category).where(eq(category.id, decision.categoryId)).get()
          : null;
      return {
        ...m,
        categoryName: target ? `Vorgemerkt: ${target.name}` : m.categoryName,
        categoryId: m.categoryKind === 'advance' ? null : m.categoryId,
        ...(explicitUses && m.amountCents < 0 && !decision
          ? {
              creditAllocations: (uses ?? [])
                .filter((u) => u.outlaySplitId === m.splitId)
                .map(({ receiptSplitId, amountCents }) => ({ receiptSplitId, amountCents })),
            }
          : {}),
        ...(decision?.debitSplitId === m.splitId
          ? { creditSourceSplitId: decision.sourceSplitId }
          : {}),
        ...(decision?.creditSplitId === m.splitId
          ? { creditOnly: true, creditCategoryId: decision.categoryId }
          : {}),
      };
    });
}

export function savedContactSettlements(
  tx: Executor,
  contactId: string,
  asOf?: string,
  records = contactCreditRecords(tx),
) {
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
    .filter(
      ({ settlement: s }) =>
        !asOf ||
        !records
          .find((r) => r.bookingId === s.bookingId)
          ?.adoptedRepayments?.some(
            (a) => a.receiptSplitId === s.receiptSplitId && !a.previouslyRecorded && a.date > asOf,
          ),
    )
    .map(({ settlement: s }) => {
      const record = records.find((r) => r.bookingId === s.bookingId);
      const historical = asOf
        ? record?.allocationHistory?.find(
            (h) => h.receiptSplitId === s.receiptSplitId && h.date > asOf,
          )
        : undefined;
      return {
        receiptSplitId: s.receiptSplitId,
        creditCents: historical?.creditCents ?? s.creditCents,
        ...((
          historical
            ? historical.allowFutureAllocations
            : record?.targetedRepayments?.includes(s.receiptSplitId)
        )
          ? { allowFutureAllocations: true }
          : {}),
        allocations:
          historical?.allocations ??
          tx
            .select({
              outlaySplitId: contactAllocation.outlaySplitId,
              amountCents: contactAllocation.amountCents,
            })
            .from(contactAllocation)
            .where(
              and(eq(contactAllocation.settlementId, s.id), isNull(contactAllocation.deletedAt)),
            )
            .all(),
      };
    });
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
      (r) =>
        r.bookingId === s.bookingId &&
        (r.repayments?.includes(s.receiptSplitId) || r.waiver?.receiptSplitId === s.receiptSplitId),
    );
    const cash = tx.select().from(booking).where(eq(booking.id, s.bookingId)).get();
    const parts = tx
      .select()
      .from(bookingSplit)
      .where(eq(bookingSplit.bookingId, s.bookingId))
      .all();
    const live = s.deletedAt === null;
    if (live !== (cash?.deletedAt === null)) {
      // Adoption adds metadata to pre-existing cash. Undo must be able to remove only
      // that metadata; the immutable audit records prove this was not a cash settlement.
      const adoption =
        !live &&
        tx
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.entityType, 'app_setting'),
              eq(auditLog.entityId, `contacts.credit.${s.bookingId}`),
            ),
          )
          .all()
          .some((entry) => {
            const snapshot = entry.afterJson
              ? (JSON.parse(entry.afterJson) as { value?: string })
              : null;
            const record =
              snapshot?.value &&
              parseContactCreditRecord({
                id: `contacts.credit.${s.bookingId}`,
                value: snapshot.value,
              });
            return (
              record &&
              record.adoptedRepayments?.some(
                (a) => a.receiptSplitId === s.receiptSplitId && !a.previouslyRecorded,
              )
            );
          });
      if (!adoption)
        throw new BookingInvariantError('Contact receipt and settlement must be undone together');
    }
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
        actualContactMovements(tx, contactId, undefined, creditRecords),
        savedContactSettlements(tx, contactId, undefined, creditRecords),
      );
      uses.push(...statement.creditUses);
    } catch (error) {
      throw new BookingInvariantError(
        error instanceof Error ? error.message : 'Invalid contact allocation',
      );
    }
  }
  assertContactCreditRecords(tx, uses, creditRecords);
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
    !creditRecord?.waiver &&
    !creditRecord?.adjustmentFor &&
    !creditRecord?.explicitUses &&
    !creditRecord?.useHistory?.length &&
    !creditRecord?.refundCorrections?.length &&
    !creditRecord?.repaymentRefundCorrections?.length &&
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
  const records = entries
    .filter((e) => e.entityType === 'app_setting' && e.entityId.startsWith('contacts.credit.'))
    .flatMap((e) =>
      [e.before, e.after].flatMap((snapshot) => {
        if (typeof snapshot?.value !== 'string') return [];
        const record = parseContactCreditRecord({ id: e.entityId, value: snapshot.value });
        return record ? [record] : [];
      }),
    )
    .filter(
      (r) =>
        r.decision ||
        r.waiver ||
        r.adoptedRepayments?.length ||
        r.explicitUses ||
        r.targetedRepayments?.length ||
        r.adjustmentFor,
    );
  const unlocked = new Set<string>();
  for (const e of entries.filter(
    (e) => e.entityType === 'app_setting' && e.entityId.startsWith(CONTACT_UNLOCK_PREFIX),
  )) {
    for (const snapshot of [e.before, e.after]) {
      if (typeof snapshot?.value !== 'string') continue;
      const marker = JSON.parse(snapshot.value) as {
        allocationOnly?: boolean;
        bookingIds?: unknown[];
      };
      if (marker.allocationOnly === true)
        for (const id of marker.bookingIds ?? []) if (typeof id === 'string') unlocked.add(id);
    }
  }
  // An allocation authorization never grants permission to undo bank facts.
  if (
    unlocked.size &&
    entries.some(
      (e) =>
        e.entityType === 'booking' && [e.before, e.after].some((s) => s && s.amount_cents !== 0),
    )
  )
    unlocked.clear();
  if (records.length) {
    for (const record of records) {
      for (const adopted of record.adoptedRepayments ?? []) {
        if (contactCreditRecords(tx).some((r) => r.repayments?.includes(adopted.receiptSplitId)))
          continue;
        const settlement = tx
          .select()
          .from(contactSettlement)
          .where(
            and(
              eq(contactSettlement.receiptSplitId, adopted.receiptSplitId),
              isNull(contactSettlement.deletedAt),
            ),
          )
          .get();
        if (!settlement) continue;
        const allocations = tx
          .select()
          .from(contactAllocation)
          .where(
            and(
              eq(contactAllocation.settlementId, settlement.id),
              isNull(contactAllocation.deletedAt),
            ),
          )
          .all();
        const canonical = (rows: { outlaySplitId: string; amountCents: number }[]) =>
          JSON.stringify(rows.map((a) => [a.outlaySplitId, a.amountCents]).sort());
        if (
          settlement.creditCents !== adopted.creditCents ||
          canonical(allocations) !== canonical(adopted.allocations)
        )
          throw new BookingInvariantError(
            'Undo the later allocation before undoing repayment adoption',
          );
      }
    }
    const bookingIds = new Set(records.map((r) => r.bookingId));
    for (const record of records) {
      if (record.adjustmentFor) bookingIds.add(record.adjustmentFor.bookingId);
    }
    const splitIds = new Set(
      records.flatMap((r) => (r.decision ? [r.decision.sourceSplitId] : [])),
    );
    for (const entry of entries.filter((e) => e.entityType === 'contact_allocation'))
      for (const snapshot of [entry.before, entry.after])
        if (typeof snapshot?.outlay_split_id === 'string') splitIds.add(snapshot.outlay_split_id);
    for (const id of splitIds) {
      const part = tx.select().from(bookingSplit).where(eq(bookingSplit.id, id)).get();
      if (part) bookingIds.add(part.bookingId);
      else
        for (const e of entries.filter(
          (e) => e.entityType === 'booking_split' && e.entityId === id,
        ))
          for (const snapshot of [e.before, e.after])
            if (typeof snapshot?.booking_id === 'string') bookingIds.add(snapshot.booking_id);
    }
    const locked = [...bookingIds].filter(
      (id) =>
        !unlocked.has(id) &&
        tx.select().from(booking).where(eq(booking.id, id)).get()?.status === 'reconciled',
    );
    if (locked.length) throw new ReconciledLockedError(locked);
  }
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
