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
 * The live bookings matched to a contract's occurrences, in the contract's currency. Without any
 * linked occurrence (imported contracts) the history comes from the live bookings of the same
 * payee with a split in the contract's category: that split's amount, transfers excluded.
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
    .map((r) => ({ date: r.date, amountCents: bookedAmountIn(r.b, currency) }));
  if (linked.length > 0) return linked;
  const p = db.select().from(expectedPayment).where(eq(expectedPayment.id, paymentId)).get();
  if (!p?.payeeId || !p.categoryId) return linked;
  const perBooking = new Map<string, { date: string; amountCents: number }>();
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
    if (!eligible(b)) continue;
    // A foreign-currency charge keeps its split's share of the original amount (integer cents).
    const amountCents =
      b.currency === currency || b.originalCurrency !== currency || b.originalAmountCents === null
        ? split
        : b.amountCents === 0
          ? 0
          : mulDivRound(split, Math.abs(b.originalAmountCents), Math.abs(b.amountCents));
    const sum = perBooking.get(b.id);
    if (sum) sum.amountCents = cents(sum.amountCents + amountCents);
    else perBooking.set(b.id, { date: b.date, amountCents });
  }
  return [...perBooking.values()];
}
