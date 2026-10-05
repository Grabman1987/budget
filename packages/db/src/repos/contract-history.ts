import { cents, mulDivRound } from '@budget/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  account,
  payee,
  booking,
  bookingSplit,
  expectedOccurrence,
  expectedPayment,
} from '../schema';
import { bookedAmountIn } from './expected-links';
import type { Executor } from './types';

/**
 * The live bookings matched to a contract's occurrences, in the contract's currency, plus the
 * older history that no occurrence links (imported contracts, bookings before the matching window):
 * the live bookings of the same payee with a split in the contract's category, that split's amount,
 * transfers excluded and bookings of other schedules left out.
 */
export function matchedCharges(db: Executor, paymentId: string, currency: string) {
  const liveAccounts = new Map(
    db
      .select()
      .from(account)
      .where(isNull(account.deletedAt))
      .all()
      .map((a) => [a.id, a.openingDate]),
  );
  const systemPayees = new Set(
    db
      .select()
      .from(payee)
      .all()
      .filter((p) => p.systemKind !== null)
      .map((p) => p.id),
  );
  const eligible = (b: typeof booking.$inferSelect) =>
    liveAccounts.has(b.accountId) &&
    b.date >= liveAccounts.get(b.accountId)! &&
    !systemPayees.has(b.payeeId ?? '') &&
    (b.currency === currency ||
      (b.originalCurrency === currency && b.originalAmountCents !== null));
  const linked = db
    .select({ date: booking.date, b: booking })
    .from(expectedOccurrence)
    .innerJoin(booking, eq(booking.id, expectedOccurrence.bookingId))
    .where(
      and(
        eq(expectedOccurrence.expectedPaymentId, paymentId),
        inArray(expectedOccurrence.status, ['received', 'deviating']),
        isNull(expectedOccurrence.deletedAt),
        isNull(booking.deletedAt),
      ),
    )
    .all()
    .filter((r) => eligible(r.b))
    .map((r) => ({ bookingId: r.b.id, date: r.date, amountCents: bookedAmountIn(r.b, currency) }));
  const p = db.select().from(expectedPayment).where(eq(expectedPayment.id, paymentId)).get();
  if (!p?.payeeId || !p.categoryId) return linked;
  const siblings = db
    .select()
    .from(expectedPayment)
    .where(
      and(
        eq(expectedPayment.payeeId, p.payeeId),
        eq(expectedPayment.categoryId, p.categoryId),
        eq(expectedPayment.kind, 'outflow'),
        isNull(expectedPayment.deletedAt),
      ),
    )
    .all();
  const otherLinks = new Set(
    db
      .select()
      .from(expectedOccurrence)
      .where(isNull(expectedOccurrence.deletedAt))
      .all()
      .filter((o) => o.expectedPaymentId !== p.id && o.bookingId !== null)
      .map((o) => o.bookingId),
  );
  // Occurrences only link the recent bookings inside the matching window; the older history of the
  // same contract stays unlinked, so the linked bookings are the start and the fallback adds the rest.
  const perBooking = new Map(linked.map((l) => [l.bookingId, l]));
  const alreadyLinked = new Set(perBooking.keys());
  const rows = db
    .select({ b: booking, split: bookingSplit.amountCents })
    .from(booking)
    .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .where(
      and(
        eq(booking.payeeId, p.payeeId),
        eq(bookingSplit.categoryId, p.categoryId),
        isNull(booking.deletedAt),
        isNull(booking.transferId),
        isNull(bookingSplit.transferId),
        isNull(bookingSplit.contactId),
      ),
    )
    .all();
  for (const { b, split } of rows) {
    if (!eligible(b) || otherLinks.has(b.id) || alreadyLinked.has(b.id)) continue;
    // With competing schedules only a unique in-force owner can establish a fallback match.
    if (siblings.length > 1) {
      const owners = siblings.filter(
        (s) => (!s.startDate || s.startDate <= b.date) && (!s.endDate || s.endDate >= b.date),
      );
      if (owners.length !== 1 || owners[0]?.id !== p.id) continue;
    }
    // A foreign-currency charge keeps its split's share of the original amount (integer cents).
    const amountCents =
      b.currency === currency || b.originalCurrency !== currency || b.originalAmountCents === null
        ? split
        : b.amountCents === 0
          ? 0
          : mulDivRound(split, Math.abs(b.originalAmountCents), Math.abs(b.amountCents));
    const sum = perBooking.get(b.id);
    if (sum) sum.amountCents = cents(sum.amountCents + amountCents);
    else perBooking.set(b.id, { bookingId: b.id, date: b.date, amountCents });
  }
  return [...perBooking.values()];
}
