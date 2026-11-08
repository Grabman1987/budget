import { bankAssignmentText, cleanBankPayee, matchesAssignment } from '@budget/domain';
import {
  category,
  expectedOccurrence,
  expectedPayment,
  getBooking,
  listAssignmentRules,
  payee,
  queryBookings,
  readPayeeCleanup,
  type Db,
} from '@budget/db';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiError } from './http';

/** Read-only context, including locked bookings. Never runs assignment or schedule writers. */
export function readBookingInspector(db: Db, id: string, today: string) {
  const booking = getBooking(db, id);
  if (!booking) throw new ApiError(404, 'not_found', 'Booking not found');
  const recipient = booking.payeeId
    ? db.select().from(payee).where(eq(payee.id, booking.payeeId)).get()
    : undefined;
  const usualCategory = recipient?.defaultCategoryId
    ? (db
        .select({ id: category.id, name: category.name })
        .from(category)
        .where(and(eq(category.id, recipient.defaultCategoryId), isNull(category.deletedAt)))
        .get() ?? null)
    : null;
  const history = booking.payeeId
    ? queryBookings(
        db,
        { payeeId: booking.payeeId, to: today, limit: 6, sort: 'date', direction: 'desc' },
        today,
      )
        .items.filter((row) => row.id !== id)
        .slice(0, 5)
        .map(({ id, date, amountCents, currency, accountName }) => ({
          id,
          date,
          amountCents,
          currency,
          accountName,
        }))
    : [];
  const matchRow = {
    ...booking,
    rawText: bankAssignmentText(booking.bankRawPayee, booking.bankRawText ?? booking.memo ?? ''),
    counterparty:
      booking.source === 'bank'
        ? cleanBankPayee(
            booking.bankRawPayee,
            booking.bankRawText ?? booking.memo ?? '',
            readPayeeCleanup(db, booking.bankSourceId ?? ''),
          )
        : (recipient?.name ?? ''),
  };
  const rules = listAssignmentRules(db).flatMap((rule) => {
    const matches = matchesAssignment(rule.match, matchRow);
    const referencesPayee =
      (!!booking.payeeId && rule.actions.payeeId === booking.payeeId) ||
      rule.match.conditions.some(
        (condition) =>
          (condition.type === 'payee' || condition.type === 'counterparty') &&
          matchesAssignment({ mode: 'all', conditions: [condition] }, matchRow),
      );
    return matches || referencesPayee
      ? [{ id: rule.id, name: rule.name, enabled: rule.enabled, matches }]
      : [];
  });
  const repetition =
    db
      .select({
        id: expectedPayment.id,
        name: expectedPayment.name,
        dueDate: expectedOccurrence.dueDate,
      })
      .from(expectedOccurrence)
      .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
      .where(
        and(
          eq(expectedOccurrence.bookingId, id),
          isNull(expectedOccurrence.deletedAt),
          isNull(expectedPayment.deletedAt),
        ),
      )
      .get() ?? null;
  return { usualCategory, history, rules, repetition };
}
