import { amountGap, versionOn, type Occurrence } from '@budget/domain';
import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import {
  booking,
  bookingSplit,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentVersion,
} from '../schema';
import { ConflictError } from './errors';
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

/**
 * Manual, automatic and payslip linking attach at most one occurrence to a booking (only the
 * contact checklist links several, #1336); the unique index is gone, so this guards it in code.
 */
export function assertBookingUnclaimed(
  db: Executor,
  bookingId: string,
  exceptOccurrenceId: string,
): void {
  const other = db
    .select({ id: expectedOccurrence.id })
    .from(expectedOccurrence)
    .where(
      and(
        eq(expectedOccurrence.bookingId, bookingId),
        isNull(expectedOccurrence.deletedAt),
        ne(expectedOccurrence.id, exceptOccurrenceId),
      ),
    )
    .get();
  if (other) throw new ConflictError('This booking already belongs to another occurrence');
}

type ShareSplit = Pick<
  typeof bookingSplit.$inferSelect,
  'amountCents' | 'categoryId' | 'incomeTypeId' | 'contactId' | 'transferId' | 'memo'
>;
type SharePayment = Pick<Payment, 'categoryId' | 'incomeTypeId'> & Partial<Pick<Payment, 'name'>>;

/** Memo of the automatic split that returns a repayment to the outlay's category. */
const CATEGORY_RETURN_MEMO = 'Rückzahlung in die ursprüngliche Kategorie';

const splitMatches = (s: ShareSplit, p: SharePayment) =>
  s.contactId === null &&
  s.transferId === null &&
  (p.categoryId ? s.categoryId === p.categoryId : s.incomeTypeId === p.incomeTypeId);

/**
 * SHARE RULE (#1336, the one rule for a booking linked to several occurrences): an occurrence owns
 * only its own split(s), never the whole booking amount. Linked occurrences are taken in due-date
 * order and each claims one still unclaimed split of its category / income type (preferring the
 * split named like the payment and sized like it, then named, then sized, then the first; the
 * automatic category-return split only as a last resort). No matching split = share 0. `null` = the
 * booking is linked to one occurrence that the checklist did not split, the caller then uses the
 * single-link rules below. Summing the shares never exceeds the booking.
 */
export function linkedOccurrenceShares(
  db: Executor,
  bookingId: string,
): Map<string, number> | null {
  const linked = db
    .select({ occ: expectedOccurrence, payment: expectedPayment })
    .from(expectedOccurrence)
    .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
    .where(and(eq(expectedOccurrence.bookingId, bookingId), isNull(expectedOccurrence.deletedAt)))
    .orderBy(asc(expectedOccurrence.dueDate), asc(expectedOccurrence.id))
    .all();
  if (linked.length === 0) return null;
  const splits = db
    .select()
    .from(bookingSplit)
    .where(eq(bookingSplit.bookingId, bookingId))
    .orderBy(asc(bookingSplit.sortOrder))
    .all();
  // One remaining link keeps its own share only when the checklist split it (its split is named
  // like the payment and other splits exist), e.g. after a sibling link was removed (#1336).
  if (
    linked.length === 1 &&
    !(
      splits.length > 1 &&
      splits.some((s) => s.memo === linked[0]!.payment.name && splitMatches(s, linked[0]!.payment))
    )
  )
    return null;
  const used = new Set<number>();
  const shares = new Map<string, number>();
  for (const { occ, payment } of linked) {
    let open = splits
      .map((s, i) => ({ s, i }))
      .filter(
        ({ s, i }) =>
          !used.has(i) && (payment.categoryId || payment.incomeTypeId) && splitMatches(s, payment),
      );
    // The automatic category return of a repayment is never a contribution split.
    const plain = open.filter(({ s }) => s.memo !== CATEGORY_RETURN_MEMO);
    if (plain.length) open = plain;
    const named = (x: (typeof open)[number]) => x.s.memo === payment.name;
    const sized = (x: (typeof open)[number]) => x.s.amountCents === occ.expectedAmountCents;
    const pick =
      open.find((x) => named(x) && sized(x)) ?? open.find(named) ?? open.find(sized) ?? open[0];
    if (pick) used.add(pick.i);
    shares.set(occ.id, pick?.s.amountCents ?? 0);
  }
  return shares;
}

/**
 * Amount of a booking that belongs to one occurrence (#1322, #1336), `null` = use the booking
 * amount. A booking linked to several occurrences follows the share rule above. A mixed contact
 * receipt (it also repays outlays or leaves credit) only counts the split(s) of the payment's
 * category / income type.
 */
export function mixedReceiptShareCents(
  db: Executor,
  bookingId: string,
  payment: SharePayment & Pick<Payment, 'contactId'>,
  occurrenceId?: string,
): number | null {
  if (occurrenceId) {
    const share = linkedOccurrenceShares(db, bookingId)?.get(occurrenceId);
    if (share !== undefined) return share;
  }
  if (!payment.contactId || (!payment.categoryId && !payment.incomeTypeId)) return null;
  const splits = db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, bookingId)).all();
  if (!splits.some((s) => s.contactId !== null)) return null;
  const own = splits.filter((s) => splitMatches(s, payment));
  return own.length ? own.reduce((sum, s) => sum + s.amountCents, 0) : null;
}

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

function statusForAmount(
  occurrence: OccurrenceRow,
  payment: Payment,
  versions: Version[],
  amount: number,
): OccurrenceRow['status'] {
  const version = versionOn(versions, occurrence.dueDate);
  const sign = payment.kind === 'outflow' ? -1 : 1;
  const planned: Occurrence = {
    dueDate: occurrence.dueDate,
    amountCents: occurrence.expectedAmountCents,
    amountMaxCents: version?.amountMaxCents == null ? null : sign * version.amountMaxCents,
    contactShareCents: occurrence.contactShareCents,
  };
  const inside =
    Math.sign(amount) === Math.sign(planned.amountCents) &&
    amountGap(planned, amount) <= payment.amountToleranceCents;
  return inside ? 'received' : 'deviating';
}

function statusForBooking(
  db: Executor,
  occurrence: OccurrenceRow,
  payment: Payment,
  versions: Version[],
  booked: BookingRow,
): OccurrenceRow['status'] {
  const version = versionOn(versions, occurrence.dueDate);
  const amount =
    mixedReceiptShareCents(db, booked.id, payment, occurrence.id) ??
    bookedAmountIn(booked, version?.currency ?? 'EUR');
  return statusForAmount(occurrence, payment, versions, amount);
}

/**
 * Status of an occurrence that receives `amountCents` of a booking (the checklist knows the amount
 * before the links exist): same range and tolerance rule as every other link.
 */
export function expectedStatusForAmount(
  tx: Executor,
  occurrenceId: string,
  amountCents: number,
): OccurrenceRow['status'] {
  const { occurrence, payment } = tx
    .select({ occurrence: expectedOccurrence, payment: expectedPayment })
    .from(expectedOccurrence)
    .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
    .where(eq(expectedOccurrence.id, occurrenceId))
    .get()!;
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
  return statusForAmount(occurrence, payment, versions, amountCents);
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
  return statusForBooking(tx, occurrence, payment, versions, linkedBooking);
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
              tx,
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
