import { and, eq, isNull, sql } from 'drizzle-orm';
import { appSetting, booking, bookingSplit, contactAllocation, contactSettlement } from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { getBooking, type BookingPatch } from './bookings';
import { CONTACT_LINKED_OVERRIDE_PREFIX } from './contact-allocation-lock';
import { contactCreditRecords, saveContactCreditRecord } from './contact-credit';
import { contactIdentityIds, resolveContactRoot } from './contact-label';
import { reallocateContactRepayment } from './contact-reallocation';
import { getContactStatement } from './contacts';
import { runInTransaction, type Executor } from './types';

export interface LinkedEditResult {
  /** Cents taken out of allocations because the edited outlay no longer covers them. */
  releasedCents: number;
  /** Settlements whose allocation was reduced (their receipts keep the money as credit). */
  settlementIds: string[];
}

/**
 * #1108: before the owner edits (or deletes) an outlay that repayments allocate, shrink those
 * allocations to what the outlay will still cover. Everything runs through the regular
 * reallocation (category returns, credit, history) inside the caller's audit group, so one Undo
 * restores it all. The released cents are not dropped: the repayment keeps them as credit of the
 * contact, and the outlay's open claim grows by the same amount (contact balance is derived from
 * the movements and stays correct). The override itself is audited with its reason.
 */
export function releaseLinkedAllocations(
  db: Executor,
  bookingId: string,
  planned: 'delete' | BookingPatch,
  ctx: AuditContext,
  today: string,
  options: { unlockOutlay: boolean; unlockRepayments: boolean; reason?: string },
): LinkedEditResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const cur = getBooking(tx, bookingId);
    const none: LinkedEditResult = { releasedCents: 0, settlementIds: [] };
    if (!cur) return none;
    const allocations = tx
      .select({
        id: contactAllocation.id,
        settlementId: contactAllocation.settlementId,
        outlaySplitId: contactAllocation.outlaySplitId,
        amountCents: contactAllocation.amountCents,
        receiptSplitId: contactSettlement.receiptSplitId,
        contactId: contactSettlement.contactId,
        receiptBookingId: booking.id,
        date: booking.date,
        order: sql<number>`${booking}.rowid`,
      })
      .from(contactAllocation)
      .innerJoin(bookingSplit, eq(bookingSplit.id, contactAllocation.outlaySplitId))
      .innerJoin(contactSettlement, eq(contactSettlement.id, contactAllocation.settlementId))
      .innerJoin(booking, eq(booking.id, contactSettlement.bookingId))
      .where(
        and(
          eq(bookingSplit.bookingId, bookingId),
          isNull(contactAllocation.deletedAt),
          isNull(contactSettlement.deletedAt),
        ),
      )
      .all();
    if (!allocations.length) return none;
    const movedDate = planned !== 'delete' && planned.date !== cur.date ? planned.date : undefined;
    const outlayOrder = movedDate
      ? tx.get<{ rowid: number }>(sql`select rowid from ${booking} where id = ${bookingId}`)!.rowid
      : 0;
    const records = movedDate ? contactCreditRecords(tx) : [];
    const crossed = new Set(
      allocations
        .filter(
          (a) =>
            movedDate &&
            (a.date < movedDate || (a.date === movedDate && a.order < outlayOrder)) &&
            !records
              .find((record) => record.bookingId === a.receiptBookingId)
              ?.targetedRepayments?.includes(a.receiptSplitId),
        )
        .map((a) => a.id),
    );
    const savedOutlay = records.find((r) => r.bookingId === bookingId);
    if (crossed.size && !savedOutlay?.uses && !savedOutlay?.explicitUses) {
      // A standalone outlay normally infers credit use. Preserve its existing uses before
      // moving it, so the repayment just released cannot automatically pay it again.
      const splitIds = new Set(cur.splits.map((split) => split.id));
      const contacts = new Set(
        cur.splits.flatMap((split) =>
          split.contactId ? [resolveContactRoot(tx, split.contactId)] : [],
        ),
      );
      const uses = [...contacts].flatMap((id) =>
        getContactStatement(tx, id, today).creditUses.filter((u) => splitIds.has(u.outlaySplitId)),
      );
      saveContactCreditRecord(tx, { bookingId, uses }, grouped);
    }

    /** Cents of the outlay split that remain a contact outlay after the planned change. */
    const sizeAfter = (splitId: string, contactId: string): number | null => {
      if (planned === 'delete') return 0;
      const index = cur.splits.findIndex((s) => s.id === splitId);
      if (planned.splits) {
        const next =
          planned.splits.length === cur.splits.length ? planned.splits[index] : undefined;
        // A new category (or to/from Auslagen) would leave the repayment's category return behind
        // on the old one: release the whole allocation first, the new outlay starts unallocated.
        if ((next?.categoryId ?? null) !== (cur.splits[index]?.categoryId ?? null)) return 0;
        return next?.contactId &&
          next.amountCents < 0 &&
          contactIdentityIds(tx, contactId).includes(next.contactId)
          ? -next.amountCents
          : 0;
      }
      if (planned.amountCents !== undefined && cur.splits.length === 1)
        return planned.amountCents < 0 ? -planned.amountCents : 0;
      return null;
    };

    // Newest repayment gives way first; older ones stay as they were as long as the outlay fits.
    const keep = new Map(allocations.map((a) => [a.id, crossed.has(a.id) ? 0 : a.amountCents]));
    for (const splitId of new Set(allocations.map((a) => a.outlaySplitId))) {
      const onSplit = allocations
        .filter((a) => a.outlaySplitId === splitId && !crossed.has(a.id))
        .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
      if (!onSplit.length) continue;
      const size = sizeAfter(splitId, onSplit[0]!.contactId);
      if (size === null) continue;
      let excess = onSplit.reduce((sum, a) => sum + a.amountCents, 0) - size;
      for (const a of onSplit) {
        if (excess <= 0) break;
        const cut = Math.min(excess, a.amountCents);
        keep.set(a.id, a.amountCents - cut);
        excess -= cut;
      }
    }
    const touched = new Map<string, typeof allocations>();
    for (const a of allocations)
      if (keep.get(a.id) !== a.amountCents)
        touched.set(a.settlementId, [...(touched.get(a.settlementId) ?? []), a]);

    const unlockBookingIds = new Set(options.unlockOutlay ? [bookingId] : []);
    if (options.unlockRepayments)
      for (const a of allocations) unlockBookingIds.add(a.receiptBookingId);
    let releasedCents = 0;
    for (const [settlementId, changed] of touched) {
      const first = changed[0]!;
      const all = tx
        .select()
        .from(contactAllocation)
        .where(
          and(
            eq(contactAllocation.settlementId, settlementId),
            isNull(contactAllocation.deletedAt),
          ),
        )
        .all();
      const next = all
        .map((a) => ({
          outlaySplitId: a.outlaySplitId,
          amountCents: keep.get(a.id) ?? a.amountCents,
        }))
        .filter((a) => a.amountCents > 0);
      releasedCents += changed.reduce((sum, a) => sum + a.amountCents - keep.get(a.id)!, 0);
      reallocateContactRepayment(
        tx,
        first.contactId,
        first.receiptSplitId,
        { allocations: next },
        grouped,
        today,
        { unlockBookingIds },
      );
      const movedSplits = new Set(
        changed.filter((a) => crossed.has(a.id)).map((a) => a.outlaySplitId),
      );
      if (movedSplits.size) {
        const record = contactCreditRecords(tx).find(
          (r) => r.bookingId === first.receiptBookingId,
        )!;
        // Historical statements replay against the corrected booking date too.
        const allocationHistory = record.allocationHistory?.map((entry) => {
          if (entry.receiptSplitId !== first.receiptSplitId || entry.allowFutureAllocations)
            return entry;
          const released = entry.allocations.filter((a) => movedSplits.has(a.outlaySplitId));
          return {
            ...entry,
            allocations: entry.allocations.filter((a) => !movedSplits.has(a.outlaySplitId)),
            creditCents: released.reduce((sum, a) => sum + a.amountCents, entry.creditCents),
          };
        });
        if (allocationHistory)
          saveContactCreditRecord(
            tx,
            { bookingId: first.receiptBookingId, allocationHistory },
            grouped,
          );
      }
    }

    const id = `${CONTACT_LINKED_OVERRIDE_PREFIX}${grouped.groupId}`;
    const current = tx.select().from(appSetting).where(eq(appSetting.id, id)).get();
    const previous = current
      ? (JSON.parse(current.value) as { bookingIds: string[]; settlementIds: string[] })
      : { bookingIds: [], settlementIds: [] };
    const value = JSON.stringify({
      bookingIds: [...new Set([...previous.bookingIds, bookingId])],
      // Every repayment that allocated this outlay when the owner confirmed: only these may move
      // with it on Undo. A repayment added later by another action keeps the normal guard.
      settlementIds: [
        ...new Set([...previous.settlementIds, ...allocations.map((a) => a.settlementId)]),
      ],
      operation: planned === 'delete' ? 'delete' : 'update',
      reason: options.reason?.trim() || 'Auslage mit Rückzahlung verknüpft, Änderung bestätigt',
      releasedCents,
    });
    if (current) updateTracked(tx, appSetting, [id], { value }, grouped);
    else insertTracked(tx, appSetting, { id, value }, grouped);
    return { releasedCents, settlementIds: [...touched.keys()] };
  });
}
