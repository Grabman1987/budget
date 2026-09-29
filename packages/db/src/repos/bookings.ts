import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lte, ne, type SQL } from 'drizzle-orm';
import { account, booking, bookingSplit, transfer } from '../schema';
import {
  deleteTracked,
  insertTracked,
  updateTracked,
  withGroup,
  type AuditContext,
  type GroupedContext,
} from './audit';
import { BookingInvariantError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

/**
 * Bookings, splits and transfers (SPEC §5). Invariants enforced here, not in SQL:
 * - the splits of a booking sum to its `amount_cents` (and there is at least one split);
 * - a transfer (Umbuchung) is exactly two bookings with the same `transfer_id` and opposite amounts;
 * - imports are idempotent through `(account_id, import_key)`, also for soft-deleted rows.
 *
 * Every function is one transaction and one audit group (`ctx.groupId` or a fresh id), so a whole
 * user action is undoable with `undo(db, { groupId })`. Deleting is soft; the splits of a deleted
 * booking stay in the table and are ignored by all reads through their parent.
 *
 * The `transfer` row itself is structural (no `deleted_at`) and not audited: undoing a transfer
 * soft-deletes its two bookings and leaves the unreferenced row behind.
 */

export type BookingRow = typeof booking.$inferSelect;
export type SplitRow = typeof bookingSplit.$inferSelect;
export type BookingWithSplits = BookingRow & { splits: SplitRow[] };

export interface SplitInput {
  /** `null` / omitted on an inflow means "Zu verteilen". */
  categoryId?: string | null;
  amountCents: number;
  memo?: string | null;
  contactId?: string | null;
}

type BookingColumns = Omit<
  typeof booking.$inferInsert,
  'id' | 'transferId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

/** Booking input: `amountCents` is signed (outflow negative); `currency` defaults to the account's. */
export interface BookingInput extends BookingColumns {
  splits: SplitInput[];
}
export type ImportBookingInput = BookingInput & { importKey: string };
export type BookingPatch = Partial<BookingColumns> & { splits?: SplitInput[] };

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  date: string;
  /** Positive; the from leg gets `-amountCents`, the to leg `+amountCents`. */
  amountCents: number;
  /** Category of the outflow leg's split (the inflow leg stays uncategorized). */
  categoryId?: string | null;
  memo?: string | null;
  status?: BookingRow['status'];
  source?: BookingRow['source'];
  /** Import key of both legs (unique per account, so the same key may be used twice). */
  importKey?: string | null;
  /** Overrides `importKey` for the inflow leg. */
  toImportKey?: string | null;
  projectId?: string | null;
  payeeId?: string | null;
}
export interface TransferResult {
  transferId: string;
  fromBookingId: string;
  toBookingId: string;
}

export interface BookingReadOptions {
  includeDeleted?: boolean;
}
export interface BookingFilter extends BookingReadOptions {
  accountId?: string;
  /** Inclusive `YYYY-MM-DD`. */
  from?: string;
  /** Inclusive `YYYY-MM-DD`. */
  to?: string;
  /** Bookings with at least one split in this category; `null` = an uncategorized split. */
  categoryId?: string | null;
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

function assertDate(date: string): void {
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);
  if (!valid) throw new BookingInvariantError(`Date "${date}" is not a valid YYYY-MM-DD date`);
}

function assertSplits(amountCents: number, splits: readonly SplitInput[]): void {
  if (!isCents(amountCents)) {
    throw new BookingInvariantError(
      `Booking amount ${amountCents} is not an integer number of cents`,
    );
  }
  if (splits.length < 1) throw new BookingInvariantError('A booking needs at least one split');
  let sum = 0;
  for (const s of splits) {
    if (!isCents(s.amountCents)) {
      throw new BookingInvariantError(
        `Split amount ${s.amountCents} is not an integer number of cents`,
      );
    }
    sum += s.amountCents;
  }
  if (sum !== amountCents) {
    throw new BookingInvariantError(
      `Split amounts sum to ${sum} cents but the booking amount is ${amountCents} cents`,
    );
  }
}

function liveAccount(tx: Executor, accountId: string) {
  const row = tx
    .select()
    .from(account)
    .where(and(eq(account.id, accountId), isNull(account.deletedAt)))
    .get();
  if (!row) throw new BookingInvariantError(`Account ${accountId} does not exist or is deleted`);
  return row;
}

function loadBooking(tx: Executor, id: string, includeDeleted = false): BookingRow | undefined {
  return tx
    .select()
    .from(booking)
    .where(and(eq(booking.id, id), includeDeleted ? undefined : isNull(booking.deletedAt)))
    .get();
}

function loadSplits(tx: Executor, bookingId: string): SplitRow[] {
  return tx
    .select()
    .from(bookingSplit)
    .where(eq(bookingSplit.bookingId, bookingId))
    .orderBy(asc(bookingSplit.sortOrder), asc(bookingSplit.id))
    .all();
}

const splitValues = (s: SplitInput) => ({
  categoryId: s.categoryId ?? null,
  amountCents: s.amountCents,
  memo: s.memo ?? null,
  contactId: s.contactId ?? null,
});

// ---------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------

function insertBooking(
  tx: Executor,
  input: BookingInput,
  transferId: string | null,
  ctx: GroupedContext,
): string {
  assertDate(input.date);
  assertSplits(input.amountCents, input.splits);
  const acct = liveAccount(tx, input.accountId);
  const id = randomUUID();
  const { splits, ...columns } = input;
  insertTracked(
    tx,
    booking,
    { ...columns, id, transferId, currency: columns.currency ?? acct.currency },
    ctx,
  );
  splits.forEach((s, i) => {
    insertTracked(
      tx,
      bookingSplit,
      { ...splitValues(s), id: randomUUID(), bookingId: id, sortOrder: i },
      ctx,
    );
  });
  return id;
}

/** Create a booking with its splits. Returns the booking id. */
export function createBooking(db: Executor, input: BookingInput, ctx: AuditContext): string {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => insertBooking(tx, input, null, grouped));
}

/** Create a transfer (Umbuchung): the `transfer` row and two opposite bookings with one split each. */
export function createTransfer(
  db: Executor,
  input: TransferInput,
  ctx: AuditContext,
): TransferResult {
  const grouped = withGroup(ctx);
  if (!isCents(input.amountCents)) {
    throw new BookingInvariantError(
      `Transfer amount ${input.amountCents} is not an integer number of cents`,
    );
  }
  if (input.amountCents <= 0) throw new BookingInvariantError('Transfer amount must be positive');
  if (input.fromAccountId === input.toAccountId) {
    throw new BookingInvariantError(
      'A transfer needs two different accounts, got the same account twice',
    );
  }
  return runInTransaction(db, (tx) => {
    const from = liveAccount(tx, input.fromAccountId);
    const to = liveAccount(tx, input.toAccountId);
    if (from.currency !== to.currency) {
      throw new BookingInvariantError(
        `Transfers between different currencies (${from.currency}, ${to.currency}) are not supported`,
      );
    }
    const transferId = randomUUID();
    tx.insert(transfer).values({ id: transferId }).run();
    const common = {
      date: input.date,
      memo: input.memo ?? null,
      status: input.status,
      source: input.source,
      projectId: input.projectId ?? null,
      payeeId: input.payeeId ?? null,
    };
    const fromBookingId = insertBooking(
      tx,
      {
        ...common,
        accountId: input.fromAccountId,
        amountCents: -input.amountCents,
        importKey: input.importKey ?? null,
        splits: [{ categoryId: input.categoryId ?? null, amountCents: -input.amountCents }],
      },
      transferId,
      grouped,
    );
    const toBookingId = insertBooking(
      tx,
      {
        ...common,
        accountId: input.toAccountId,
        amountCents: input.amountCents,
        importKey: input.toImportKey ?? input.importKey ?? null,
        splits: [{ amountCents: input.amountCents }],
      },
      transferId,
      grouped,
    );
    return { transferId, fromBookingId, toBookingId };
  });
}

/**
 * Idempotent import: when a booking with the same `(accountId, importKey)` exists, even a
 * soft-deleted one, nothing is written and `{ created: false, id }` is returned, so a booking the
 * user deleted is not resurrected. `source` defaults to `import`.
 */
export function importBooking(
  db: Executor,
  input: ImportBookingInput,
  ctx: AuditContext,
): { created: boolean; id: string } {
  if (!input.importKey) throw new BookingInvariantError('An imported booking needs an import key');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const existing = tx
      .select({ id: booking.id })
      .from(booking)
      .where(and(eq(booking.accountId, input.accountId), eq(booking.importKey, input.importKey)))
      .get();
    if (existing) return { created: false, id: existing.id };
    return { created: true, id: insertBooking(tx, { source: 'import', ...input }, null, grouped) };
  });
}

// ---------------------------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------------------------

/** Bring `current` splits to `next`: in place when the count matches, else replace them all. */
function syncSplits(
  tx: Executor,
  bookingId: string,
  current: SplitRow[],
  next: readonly SplitInput[],
  ctx: GroupedContext,
): void {
  if (current.length === next.length) {
    current.forEach((s, i) => {
      updateTracked(tx, bookingSplit, [s.id], { ...splitValues(next[i]!), sortOrder: i }, ctx);
    });
    return;
  }
  for (const s of current) deleteTracked(tx, bookingSplit, [s.id], ctx);
  next.forEach((s, i) => {
    insertTracked(
      tx,
      bookingSplit,
      { ...splitValues(s), id: randomUUID(), bookingId, sortOrder: i },
      ctx,
    );
  });
}

/**
 * Patch a booking and optionally replace its splits. The split sum is re-validated. Without
 * `splits`, an amount change moves a single split along and is refused for several splits. On a
 * transfer leg, `amountCents` and `date` are mirrored to the partner leg (opposite amount);
 * flipping the sign or moving a leg to another account is refused.
 */
export function updateBooking(
  db: Executor,
  id: string,
  patch: BookingPatch,
  ctx: AuditContext,
): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadBooking(tx, id);
    if (!cur) throw new EntityNotFoundError('booking', id);
    const curSplits = loadSplits(tx, id);

    if (patch.date !== undefined) assertDate(patch.date);
    if (patch.accountId !== undefined && patch.accountId !== cur.accountId) {
      if (cur.transferId)
        throw new BookingInvariantError('A transfer leg cannot be moved to another account');
      liveAccount(tx, patch.accountId);
    }

    const amount = patch.amountCents ?? cur.amountCents;
    const amountChanged = amount !== cur.amountCents;
    let nextSplits: SplitInput[];
    if (patch.splits) {
      nextSplits = patch.splits;
    } else if (amountChanged && curSplits.length === 1) {
      nextSplits = [{ ...curSplits[0]!, amountCents: amount }];
    } else if (amountChanged) {
      throw new BookingInvariantError(
        'Changing the amount of a booking with several splits requires new splits',
      );
    } else {
      nextSplits = curSplits;
    }
    assertSplits(amount, nextSplits);

    if (cur.transferId) {
      const partner = tx
        .select()
        .from(booking)
        .where(
          and(
            eq(booking.transferId, cur.transferId),
            ne(booking.id, id),
            isNull(booking.deletedAt),
          ),
        )
        .get();
      if (!partner)
        throw new BookingInvariantError(`Transfer ${cur.transferId} has no second live leg`);
      const partnerPatch: Record<string, unknown> = {};
      if (patch.date !== undefined) partnerPatch['date'] = patch.date;
      if (amountChanged) {
        if (amount === 0 || Math.sign(amount) !== Math.sign(cur.amountCents)) {
          throw new BookingInvariantError(
            'A transfer leg keeps its direction and a non-zero amount; delete and re-create the transfer to reverse it',
          );
        }
        partnerPatch['amountCents'] = -amount;
        const partnerSplits = loadSplits(tx, partner.id);
        if (partnerSplits.length !== 1) {
          throw new BookingInvariantError('The partner leg has several splits; adjust it directly');
        }
        syncSplits(
          tx,
          partner.id,
          partnerSplits,
          [{ ...partnerSplits[0]!, amountCents: -amount }],
          grouped,
        );
      }
      updateTracked(tx, booking, [partner.id], partnerPatch, grouped);
    }

    const columns: Record<string, unknown> = { ...patch };
    delete columns['splits'];
    updateTracked(tx, booking, [id], columns, grouped);
    if (patch.splits || amountChanged) syncSplits(tx, id, curSplits, nextSplits, grouped);
  });
}

// ---------------------------------------------------------------------------------------------
// Delete / restore
// ---------------------------------------------------------------------------------------------

const transferLegs = (tx: Executor, row: BookingRow): BookingRow[] =>
  row.transferId
    ? tx.select().from(booking).where(eq(booking.transferId, row.transferId)).all()
    : [row];

/** Soft-delete a booking; both legs of a transfer go together. Splits stay but are ignored. */
export function deleteBooking(db: Executor, id: string, ctx: AuditContext): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadBooking(tx, id);
    if (!cur) throw new EntityNotFoundError('booking', id);
    const deletedAt = new Date().toISOString();
    for (const leg of transferLegs(tx, cur)) {
      if (leg.deletedAt === null)
        updateTracked(tx, booking, [leg.id], { deletedAt }, grouped, 'delete');
    }
  });
}

/** Restore a soft-deleted booking (and the deleted legs of its transfer). */
export function restoreBooking(db: Executor, id: string, ctx: AuditContext): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadBooking(tx, id, true);
    if (!cur) throw new EntityNotFoundError('booking', id);
    if (cur.deletedAt === null) throw new BookingInvariantError(`Booking ${id} is not deleted`);
    for (const leg of transferLegs(tx, cur)) {
      if (leg.deletedAt !== null)
        updateTracked(tx, booking, [leg.id], { deletedAt: null }, grouped, 'restore');
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

/** One booking with its splits; soft-deleted only with `includeDeleted`. */
export function getBooking(
  db: Executor,
  id: string,
  options: BookingReadOptions = {},
): BookingWithSplits | undefined {
  const row = loadBooking(db, id, options.includeDeleted);
  return row ? { ...row, splits: loadSplits(db, id) } : undefined;
}

/** Bookings with splits, ordered by date then id; one query (bookings left-joined to splits). */
export function listBookings(db: Executor, filter: BookingFilter = {}): BookingWithSplits[] {
  const conditions: (SQL | undefined)[] = [
    filter.includeDeleted ? undefined : isNull(booking.deletedAt),
    filter.accountId === undefined ? undefined : eq(booking.accountId, filter.accountId),
    filter.from === undefined ? undefined : gte(booking.date, filter.from),
    filter.to === undefined ? undefined : lte(booking.date, filter.to),
  ];
  if (filter.categoryId !== undefined) {
    conditions.push(
      inArray(
        booking.id,
        db
          .select({ id: bookingSplit.bookingId })
          .from(bookingSplit)
          .where(
            filter.categoryId === null
              ? isNull(bookingSplit.categoryId)
              : eq(bookingSplit.categoryId, filter.categoryId),
          ),
      ),
    );
  }
  const rows = db
    .select({ booking, split: bookingSplit })
    .from(booking)
    .leftJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .where(and(...conditions))
    .orderBy(asc(booking.date), asc(booking.id), asc(bookingSplit.sortOrder), asc(bookingSplit.id))
    .all();
  const result: BookingWithSplits[] = [];
  for (const { booking: b, split } of rows) {
    let last = result.at(-1);
    if (last?.id !== b.id) {
      last = { ...b, splits: [] };
      result.push(last);
    }
    if (split) last.splits.push(split);
  }
  return result;
}
