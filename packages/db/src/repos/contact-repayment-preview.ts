import { allocateContactReceipt } from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { booking, bookingSplit, category, payee } from '../schema';
import { getContactStatement } from './contacts';
import type { Executor } from './types';
import { contactCreditRecords } from './contact-credit';

/** Report only. No legacy category is inferred as fact and no row is written. */
export function previewContactRepayments(db: Executor) {
  const records = contactCreditRecords(db);
  const current = new Set(records.flatMap((r) => r.repayments ?? []));
  const rows = db
    .select({
      split: bookingSplit,
      booking,
      categoryName: category.name,
      categoryKind: category.kind,
      payeeContactId: payee.contactId,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .leftJoin(category, eq(category.id, bookingSplit.categoryId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(and(isNull(booking.deletedAt)))
    .all();
  return rows
    .filter(
      (r) =>
        !current.has(r.split.id) &&
        r.booking.amountCents >= 0 &&
        r.split.amountCents > 0 &&
        (r.categoryName === 'Rückzahlung von Kontakt' ||
          ((r.split.categoryId === null || r.categoryKind === 'advance') &&
            (r.split.contactId ||
              r.payeeContactId ||
              (r.booking.amountCents === 0 &&
                rows.some((s) => s.booking.id === r.booking.id && s.split.contactId))))),
    )
    .map((r) => {
      const contactId =
        r.split.contactId ??
        r.payeeContactId ??
        (r.booking.amountCents === 0
          ? rows.find((s) => s.booking.id === r.booking.id && s.split.contactId)?.split.contactId
          : null) ??
        null;
      const base = {
        bookingId: r.booking.id,
        splitId: r.split.id,
        contactId,
        amountCents: r.split.amountCents,
        fromCategoryId: r.split.categoryId,
      };
      if (r.booking.amountCents === 0)
        return { ...base, status: 'existing-credit-conversion-needs-owner-review', mappings: [] };
      if (!contactId) return { ...base, status: 'needs-contact', mappings: [] };
      try {
        const statement = getContactStatement(db, contactId, r.booking.date, records);
        const receipt = statement.receipts.find((s) => s.receiptSplitId === r.split.id);
        const plan = receipt ?? allocateContactReceipt(statement.outlays, r.split.amountCents);
        return {
          ...base,
          status: receipt?.recorded ? 'recorded-allocation' : 'needs-allocation-review',
          creditCents: plan.creditCents,
          mappings: plan.allocations.map((a) => {
            const outlay = statement.outlays.find((o) => o.splitId === a.outlaySplitId)!;
            const candidates = [
              ...new Set(
                rows
                  .filter(
                    (s) =>
                      s.booking.id === outlay.bookingId &&
                      s.split.amountCents < 0 &&
                      !s.split.contactId &&
                      s.categoryKind !== 'advance' &&
                      s.split.categoryId,
                  )
                  .map((s) => s.split.categoryId!),
              ),
            ];
            return {
              ...a,
              categoryId: outlay.categoryId ?? null,
              status: outlay.categoryId ? 'original-category' : 'needs-original-category',
              candidateCategoryIds: outlay.categoryId ? [] : candidates,
            };
          }),
        };
      } catch {
        return { ...base, status: 'unavailable-needs-review', mappings: [] };
      }
    });
}
