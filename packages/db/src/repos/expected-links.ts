import { amountGap, versionOn, type Occurrence } from '@budget/domain';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { booking, expectedOccurrence, expectedPayment, expectedPaymentVersion } from '../schema';
import type { Executor } from './types';

type Payment = typeof expectedPayment.$inferSelect;
type Version = typeof expectedPaymentVersion.$inferSelect;
type OccurrenceRow = typeof expectedOccurrence.$inferSelect;
type BookingRow = typeof booking.$inferSelect;
const CHUNK = 400;
const chunks = <T>(values: T[]): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += CHUNK) result.push(values.slice(i, i + CHUNK));
  return result;
};

/** Amount of a live booking in the currency of an expected payment's version. */
export function bookedAmountIn(
  bookingRow: Pick<
    BookingRow,
    'amountCents' | 'currency' | 'originalAmountCents' | 'originalCurrency'
  >,
  currency: string,
): number {
  if (bookingRow.currency === currency) return bookingRow.amountCents;
  if (bookingRow.originalCurrency === currency && bookingRow.originalAmountCents !== null)
    return bookingRow.originalAmountCents;
  return bookingRow.amountCents;
}

function statusForBooking(
  occurrence: OccurrenceRow,
  payment: Payment,
  versions: Version[],
  booked: BookingRow,
): OccurrenceRow['status'] {
  const version = versionOn(versions, occurrence.dueDate);
  const sign = payment.kind === 'outflow' ? -1 : 1;
  const planned: Occurrence = {
    dueDate: occurrence.dueDate,
    amountCents: occurrence.expectedAmountCents,
    amountMaxCents: version?.amountMaxCents == null ? null : sign * version.amountMaxCents,
    contactShareCents: occurrence.contactShareCents,
  };
  const amount = bookedAmountIn(booked, version?.currency ?? 'EUR');
  const inside =
    Math.sign(amount) === Math.sign(planned.amountCents) &&
    amountGap(planned, amount) <= payment.amountToleranceCents;
  return inside ? 'received' : 'deviating';
}

/** Recompute status using the same currency, range, and tolerance logic as lifecycle updates. */
export function expectedLinkedStatus(
  tx: Executor,
  occurrence: OccurrenceRow,
  payment: Payment,
  linkedBooking: BookingRow,
): OccurrenceRow['status'] {
  const versions = tx
    .select()
    .from(expectedPaymentVersion)
    .where(
      and(
        eq(expectedPaymentVersion.expectedPaymentId, payment.id),
        isNull(expectedPaymentVersion.deletedAt),
      ),
    )
    .orderBy(asc(expectedPaymentVersion.validFrom))
    .all();
  return statusForBooking(occurrence, payment, versions, linkedBooking);
}

export interface ExpectedLinkPatch {
  id: string;
  patch: Pick<OccurrenceRow, 'status' | 'bookingId'>;
}

/**
 * Return audited patches for live occurrences linked to the selected bookings (or all live links
 * when omitted). Live links stay attached and get a fresh amount status; deleted or missing cash
 * is unlinked and reopened for a later automatic match.
 */
export function expectedLinkPatches(
  tx: Executor,
  bookingIds?: readonly string[],
): ExpectedLinkPatch[] {
  if (bookingIds && bookingIds.length === 0) return [];
  const liveRows = (part?: string[]) =>
    tx
      .select({ occurrence: expectedOccurrence, payment: expectedPayment, booking })
      .from(expectedOccurrence)
      .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
      .leftJoin(booking, eq(booking.id, expectedOccurrence.bookingId))
      .where(
        and(
          isNull(expectedOccurrence.deletedAt),
          isNull(expectedPayment.deletedAt),
          isNotNull(expectedOccurrence.bookingId),
          part ? inArray(expectedOccurrence.bookingId, part) : undefined,
        ),
      );
  const ids = bookingIds ? [...new Set(bookingIds)] : undefined;
  const rows = ids ? chunks(ids).flatMap((part) => liveRows(part).all()) : liveRows().all();
  if (rows.length === 0) return [];

  const paymentIds = [...new Set(rows.map((row) => row.payment.id))];
  const versions = chunks(paymentIds).flatMap((part) =>
    tx
      .select()
      .from(expectedPaymentVersion)
      .where(
        and(
          isNull(expectedPaymentVersion.deletedAt),
          inArray(expectedPaymentVersion.expectedPaymentId, part),
        ),
      )
      .orderBy(asc(expectedPaymentVersion.validFrom))
      .all(),
  );
  const byPayment = new Map<string, Version[]>();
  for (const version of versions)
    byPayment.set(version.expectedPaymentId, [
      ...(byPayment.get(version.expectedPaymentId) ?? []),
      version,
    ]);

  const patches: ExpectedLinkPatch[] = [];
  for (const row of rows) {
    const linkedBooking = row.booking;
    const patch =
      !linkedBooking || linkedBooking.deletedAt !== null
        ? { bookingId: null, status: 'expected' as const }
        : {
            bookingId: linkedBooking.id,
            status: statusForBooking(
              row.occurrence,
              row.payment,
              byPayment.get(row.payment.id) ?? [],
              linkedBooking,
            ),
          };
    if (patch.bookingId !== row.occurrence.bookingId || patch.status !== row.occurrence.status)
      patches.push({ id: row.occurrence.id, patch });
  }
  return patches;
}
