import { paymentsPreview, paymentsPreviewWindow } from '@budget/domain';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import {
  booking,
  category,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentVersion,
} from '../schema';
import { schedulePayment, scheduleVersion } from './expected';
import type { Executor } from './types';

/** Pure read: neither materialises occurrences nor refreshes status or audit. */
export function readPaymentsPreview(db: Executor, asOf: string) {
  const { from, to } = paymentsPreviewWindow(asOf);
  const versions = db
    .select()
    .from(expectedPaymentVersion)
    .where(isNull(expectedPaymentVersion.deletedAt))
    .all();
  const payments = db
    .select({
      payment: expectedPayment,
      categoryName: category.name,
      categoryClass: category.class,
      categoryKind: category.kind,
    })
    .from(expectedPayment)
    .leftJoin(category, eq(category.id, expectedPayment.categoryId))
    .where(and(isNull(expectedPayment.deletedAt), eq(expectedPayment.kind, 'outflow')))
    .all();
  const stored = db
    .select({
      paymentId: expectedOccurrence.expectedPaymentId,
      dueDate: expectedOccurrence.dueDate,
      occurrenceId: expectedOccurrence.id,
      status: expectedOccurrence.status,
      storedExpectedCents: expectedOccurrence.expectedAmountCents,
      bookingId: booking.id,
      bookedAmountCents: booking.amountCents,
      bookedCurrency: booking.currency,
    })
    .from(expectedOccurrence)
    .leftJoin(booking, and(eq(booking.id, expectedOccurrence.bookingId), isNull(booking.deletedAt)))
    .where(
      and(
        isNull(expectedOccurrence.deletedAt),
        gte(expectedOccurrence.dueDate, from),
        lte(expectedOccurrence.dueDate, to),
      ),
    )
    .all();
  return paymentsPreview(
    asOf,
    payments.map(({ payment: p, ...c }) => ({
      ...schedulePayment(p),
      id: p.id,
      name: p.name,
      ...c,
      versions: versions
        .filter((v) => v.expectedPaymentId === p.id)
        .map((v) => ({ ...scheduleVersion(v), currency: v.currency })),
    })),
    stored.map((s) => ({
      ...s,
      status:
        s.bookingId === null && (s.status === 'received' || s.status === 'deviating')
          ? 'expected'
          : s.status,
    })),
  );
}
