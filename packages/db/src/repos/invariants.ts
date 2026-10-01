import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { booking, bookingSplit } from '../schema';
import { BookingInvariantError } from './errors';
import type { Executor } from './types';

/**
 * Ledger invariants that SQL cannot express (SPEC §5), checked after every write that could break
 * them: by the booking repository and by `undo` inside its transaction, so a failed check rolls
 * the whole action back.
 *
 * - a live booking has at least one split and its splits sum to its amount;
 * - a transfer has exactly two live legs (whole bookings or single splits) on two different
 *   accounts, on the same date, with opposite amounts; a leg never survives alone.
 */
export function assertLedgerInvariants(tx: Executor, bookingIds: Iterable<string>): void {
  const ids = [...new Set(bookingIds)];
  if (ids.length === 0) return;
  // Batched reads: an import checks thousands of bookings in one go.
  const rows = chunked(ids, (part) =>
    tx.select().from(booking).where(inArray(booking.id, part)).all(),
  );
  const splitsOf = new Map<string, (typeof bookingSplit.$inferSelect)[]>();
  for (const s of chunked(ids, (part) =>
    tx.select().from(bookingSplit).where(inArray(bookingSplit.bookingId, part)).all(),
  ))
    splitsOf.set(s.bookingId, [...(splitsOf.get(s.bookingId) ?? []), s]);
  const transferIds = new Set<string>();
  for (const b of rows) {
    const splits = splitsOf.get(b.id) ?? [];
    if (b.transferId) transferIds.add(b.transferId);
    for (const s of splits) if (s.transferId) transferIds.add(s.transferId);
    if (b.deletedAt !== null) continue;
    if (splits.length === 0) throw new BookingInvariantError(`Booking ${b.id} has no split`);
    const sum = splits.reduce((a, s) => a + s.amountCents, 0);
    if (sum !== b.amountCents) {
      throw new BookingInvariantError(
        `Booking ${b.id}: splits sum to ${sum} cents but the amount is ${b.amountCents} cents`,
      );
    }
  }
  const legs = transferLegsOfMany(tx, [...transferIds]);
  for (const transferId of transferIds) assertTransfer(transferId, legs.get(transferId) ?? []);
}

/** Bound parameters per statement stay far below SQLite's limit. */
const CHUNK = 500;
function chunked<T>(ids: readonly string[], read: (part: string[]) => T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...read(ids.slice(i, i + CHUNK)));
  return out;
}

type Leg = { bookingId: string; accountId: string; date: string; cents: number };

/** `transferLegsOf` for many transfers at once, by transfer id. */
function transferLegsOfMany(tx: Executor, transferIds: readonly string[]): Map<string, Leg[]> {
  const out = new Map<string, Leg[]>();
  const add = (id: string, leg: Leg) => out.set(id, [...(out.get(id) ?? []), leg]);
  for (const b of chunked(transferIds, (part) =>
    tx
      .select()
      .from(booking)
      .where(and(inArray(booking.transferId, part), isNull(booking.deletedAt)))
      .all(),
  ))
    add(b.transferId as string, {
      bookingId: b.id,
      accountId: b.accountId,
      date: b.date,
      cents: b.amountCents,
    });
  for (const r of chunked(transferIds, (part) =>
    tx
      .select({ split: bookingSplit, booking })
      .from(bookingSplit)
      .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
      .where(and(inArray(bookingSplit.transferId, part), isNull(booking.deletedAt)))
      .all(),
  ))
    add(r.split.transferId as string, {
      bookingId: r.booking.id,
      accountId: r.booking.accountId,
      date: r.booking.date,
      cents: r.split.amountCents,
    });
  return out;
}

/** The live legs of a transfer: whole bookings and single splits (of live bookings). */
export function transferLegsOf(tx: Executor, transferId: string) {
  const whole = tx
    .select()
    .from(booking)
    .where(and(eq(booking.transferId, transferId), isNull(booking.deletedAt)))
    .all()
    .map((b) => ({ bookingId: b.id, accountId: b.accountId, date: b.date, cents: b.amountCents }));
  const parts = tx
    .select({ split: bookingSplit, booking })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(and(eq(bookingSplit.transferId, transferId), isNull(booking.deletedAt)))
    .all()
    .map((r) => ({
      bookingId: r.booking.id,
      accountId: r.booking.accountId,
      date: r.booking.date,
      cents: r.split.amountCents,
    }));
  return [...whole, ...parts];
}

function assertTransfer(transferId: string, legs: readonly Leg[]): void {
  if (legs.length === 0) return; // deleted as a whole
  if (legs.length !== 2) {
    throw new BookingInvariantError(
      `Transfer ${transferId} has ${legs.length} live leg(s); a transfer is exactly two`,
    );
  }
  const [a, b] = legs as [(typeof legs)[number], (typeof legs)[number]];
  if (
    a.accountId === b.accountId ||
    a.date !== b.date ||
    a.cents + b.cents !== 0 ||
    a.cents === 0
  ) {
    throw new BookingInvariantError(
      `Transfer ${transferId} legs must be on two accounts, on one date, with opposite non-zero amounts`,
    );
  }
}

/**
 * Bookings that belong to the same transfers as `row` (both kinds of legs), including `row`:
 * they are deleted and restored together.
 */
export function relatedTransferBookings(tx: Executor, bookingId: string): string[] {
  const own = tx
    .select({ transferId: bookingSplit.transferId })
    .from(bookingSplit)
    .where(eq(bookingSplit.bookingId, bookingId))
    .all()
    .map((r) => r.transferId);
  const row = tx.select().from(booking).where(eq(booking.id, bookingId)).get();
  const transferIds = [row?.transferId, ...own].filter((t): t is string => !!t);
  if (transferIds.length === 0) return [bookingId];
  const whole = tx
    .select({ id: booking.id })
    .from(booking)
    .where(inArray(booking.transferId, transferIds))
    .all();
  const parts = tx
    .select({ id: bookingSplit.bookingId })
    .from(bookingSplit)
    .where(or(inArray(bookingSplit.transferId, transferIds)))
    .all();
  return [...new Set([bookingId, ...whole.map((r) => r.id), ...parts.map((r) => r.id)])];
}
