import { and, eq, isNull } from 'drizzle-orm';
import { appSetting, booking, bookingSplit, contactAllocation, contactSettlement } from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { getBooking, type BookingPatch } from './bookings';
import { CONTACT_LINKED_OVERRIDE_PREFIX } from './contact-allocation-lock';
import { contactIdentityIds } from './contact-label';
import { reallocateContactRepayment } from './contact-reallocation';
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
  options: { unlockReconciled?: boolean; reason?: string } = {},
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
        date: booking.date,
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

    /** Cents of the outlay split that remain a contact outlay after the planned change. */
    const sizeAfter = (splitId: string, contactId: string): number | null => {
      if (planned === 'delete') return 0;
      const index = cur.splits.findIndex((s) => s.id === splitId);
      if (planned.splits) {
        const next =
          planned.splits.length === cur.splits.length ? planned.splits[index] : undefined;
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
    const keep = new Map(allocations.map((a) => [a.id, a.amountCents]));
    for (const splitId of new Set(allocations.map((a) => a.outlaySplitId))) {
      const onSplit = allocations
        .filter((a) => a.outlaySplitId === splitId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
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
        { unlock: options.unlockReconciled ?? false },
      );
    }

    const id = `${CONTACT_LINKED_OVERRIDE_PREFIX}${grouped.groupId}`;
    const value = JSON.stringify({
      bookingId,
      operation: planned === 'delete' ? 'delete' : 'update',
      reason: options.reason?.trim() || 'Auslage mit Rückzahlung verknüpft, Änderung bestätigt',
      releasedCents,
      settlementIds: [...touched.keys()],
    });
    const current = tx.select().from(appSetting).where(eq(appSetting.id, id)).get();
    if (current) updateTracked(tx, appSetting, [id], { value }, grouped);
    else insertTracked(tx, appSetting, { id, value }, grouped);
    return { releasedCents, settlementIds: [...touched.keys()] };
  });
}
