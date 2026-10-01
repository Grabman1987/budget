import { isIncomeTrade, settlementCents } from '@budget/domain';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { account, auditLog, booking, bookingSplit, INCOME_TYPES, trade } from '../schema';
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

/** Validate the reciprocal trade/cash link after a complete repository action or undo group. */
export function assertTradeSettlementInvariants(
  tx: Executor,
  bookingIds: Iterable<string>,
  tradeIds: Iterable<string> = [],
): void {
  const bookingSet = new Set(bookingIds);
  const tradeSet = new Set(tradeIds);
  if (bookingSet.size) {
    const parts = [...bookingSet];
    for (const row of chunked(parts, (ids) =>
      tx.select({ id: trade.id }).from(trade).where(inArray(trade.bookingId, ids)).all(),
    ))
      tradeSet.add(row.id);
    for (const row of chunked(parts, (ids) =>
      tx
        .select({ id: auditLog.entityId })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entityType, 'trade'),
            or(
              inArray(sql`json_extract(${auditLog.beforeJson}, '$.booking_id')`, ids),
              inArray(sql`json_extract(${auditLog.afterJson}, '$.booking_id')`, ids),
            ),
          ),
        )
        .all(),
    ))
      tradeSet.add(row.id);
  }
  if (!tradeSet.size) return;

  let ids = [...tradeSet];
  let trades = chunked(ids, (part) => tx.select().from(trade).where(inArray(trade.id, part)).all());
  const currentBookingIds = [
    ...new Set(trades.map((row) => row.bookingId).filter((id): id is string => !!id)),
  ];
  if (currentBookingIds.length) {
    for (const row of chunked(currentBookingIds, (part) =>
      tx.select({ id: trade.id }).from(trade).where(inArray(trade.bookingId, part)).all(),
    ))
      tradeSet.add(row.id);
    ids = [...tradeSet];
    trades = chunked(ids, (part) => tx.select().from(trade).where(inArray(trade.id, part)).all());
  }
  const tradeById = new Map(trades.map((row) => [row.id, row]));
  // Build history by trade id (needed for a cash row that was detached by a zero-net transition).
  const historicalByTrade = new Map<string, Set<string>>();
  for (const id of ids) {
    const rows = tx
      .select({ beforeJson: auditLog.beforeJson, afterJson: auditLog.afterJson })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'trade'), eq(auditLog.entityId, id)))
      .all();
    const bookings = new Set<string>();
    for (const row of rows)
      for (const json of [row.beforeJson, row.afterJson]) {
        if (!json) continue;
        const snapshot = JSON.parse(json) as { booking_id?: unknown };
        if (typeof snapshot.booking_id === 'string') bookings.add(snapshot.booking_id);
      }
    const current = tradeById.get(id)?.bookingId;
    if (current) bookings.add(current);
    historicalByTrade.set(id, bookings);
  }

  const liveOwners = new Map<string, string[]>();
  for (const row of trades) {
    if (row.deletedAt !== null) continue;
    const expected = settlementCents(row);
    if (expected === 0) {
      if (row.bookingId !== null)
        throw new BookingInvariantError(`Trade ${row.id} has a trade settlement despite zero cash`);
    } else {
      if (!row.bookingId)
        throw new BookingInvariantError(`Trade ${row.id} is missing its trade settlement`);
      liveOwners.set(row.bookingId, [...(liveOwners.get(row.bookingId) ?? []), row.id]);
      const cash = tx.select().from(booking).where(eq(booking.id, row.bookingId)).get();
      const parts = tx
        .select()
        .from(bookingSplit)
        .where(eq(bookingSplit.bookingId, row.bookingId))
        .all();
      const owner = tx.select().from(account).where(eq(account.id, row.accountId)).get();
      const incomeType = isIncomeTrade(row.kind) ? INCOME_TYPES.capital.id : null;
      if (
        !cash ||
        cash.deletedAt !== null ||
        !owner ||
        cash.accountId !== row.accountId ||
        cash.date !== row.date ||
        cash.amountCents !== expected ||
        cash.currency !== owner.currency ||
        cash.transferId !== null ||
        cash.originalAmountCents !== null ||
        cash.originalCurrency !== null ||
        cash.fxRateMicro !== null ||
        cash.fxFeeCents !== null ||
        parts.length !== 1 ||
        parts[0]?.amountCents !== expected ||
        parts[0]?.categoryId !== null ||
        parts[0]?.contactId !== null ||
        parts[0]?.transferId !== null ||
        parts[0]?.incomeTypeId !== incomeType
      )
        throw new BookingInvariantError(`Trade ${row.id} has an invalid trade settlement`);
    }
    for (const oldId of historicalByTrade.get(row.id) ?? []) {
      if (oldId === row.bookingId) continue;
      const old = tx.select().from(booking).where(eq(booking.id, oldId)).get();
      if (old && old.deletedAt === null)
        throw new BookingInvariantError(`Trade ${row.id} has an orphan live trade settlement`);
    }
  }
  for (const [id, owners] of liveOwners)
    if (owners.length > 1)
      throw new BookingInvariantError(`Trade settlement ${id} is shared by live trades`);

  for (const row of trades.filter((item) => item.deletedAt !== null)) {
    for (const cashId of historicalByTrade.get(row.id) ?? []) {
      const cash = tx.select().from(booking).where(eq(booking.id, cashId)).get();
      if (cash && cash.deletedAt === null)
        throw new BookingInvariantError(`Deleted trade ${row.id} has a live trade settlement`);
    }
  }
}

/** Reject generic changes that could change, remove, or revive cash owned by a trade. */
export function assertTradeSettlementBookingWrite(
  tx: Executor,
  bookingId: string,
  operation: 'update' | 'delete' | 'restore',
  fields: Iterable<string> = [],
): void {
  const hasOwner =
    !!tx.select().from(trade).where(eq(trade.bookingId, bookingId)).get() ||
    !!tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, 'trade'),
          or(
            eq(sql`json_extract(${auditLog.beforeJson}, '$.booking_id')`, bookingId),
            eq(sql`json_extract(${auditLog.afterJson}, '$.booking_id')`, bookingId),
          ),
        ),
      )
      .get();
  if (!hasOwner) return;
  if (
    operation === 'update' &&
    [...fields].every((field) => ['memo', 'status', 'flag'].includes(field))
  )
    return;
  throw new BookingInvariantError(
    `Cannot ${operation} a trade settlement; change the trade instead`,
  );
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
