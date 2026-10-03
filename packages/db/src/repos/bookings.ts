import { bookingIncomeDefault } from './income-month';
import { assertContactBookingWrite, assertContactSettlementInvariants } from './contact-invariants';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lte, ne, type SQL } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  category,
  expectedOccurrence,
  project,
  transfer,
} from '../schema';
import {
  deleteTracked,
  insertTracked,
  updateTracked,
  withGroup,
  type AuditContext,
  type GroupedContext,
} from './audit';
import { BookingInvariantError, EntityNotFoundError, ReconciledLockedError } from './errors';
import {
  assertLedgerInvariants,
  assertTradeSettlementBookingWrite,
  relatedTransferBookings,
} from './invariants';
import { expectedLinkPatches } from './expected-links';
import { runInTransaction, type Executor } from './types';

/**
 * Bookings, splits and transfers (SPEC §5). Invariants enforced here, not in SQL:
 * - the splits of a booking sum to its `amount_cents` (and there is at least one split);
 * - a transfer (Umbuchung) has exactly two legs with opposite amounts: two whole bookings, or one
 *   split and one booking (split-level transfer, e.g. part of a salary straight to savings);
 * - a transfer between two budget accounts is neutral and carries no category; between a budget
 *   and a tracking account the category sits on the budget leg (C2);
 * - imports are idempotent through `(account_id, import_key)`, also for soft-deleted rows;
 * - foreign currency: amount = round(original × rate) + fee, ±1 cent (C7);
 * - a split's category is live and never a `card_payment` envelope (that one is filled by the
 *   automatic card move); a split with a contact (receivable share) runs through an `advance`
 *   category ("Auslagen").
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
  /** Receivable share: paid for or repaid by this contact (concept §3.4). */
  contactId?: string | null;
  /** Income type of an inflow (Gehalt, Sonderzahlung, …). */
  incomeTypeId?: string | null;
  /**
   * Make this split a transfer leg: the other leg is a new booking on this account with the
   * opposite amount, same date (C4). The split's category follows the budget-leg rule.
   */
  transferAccountId?: string | null;
  /** Import key of the other leg (unique per account). */
  transferImportKey?: string | null;
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
  /**
   * Envelope of a transfer between a budget and a tracking account; it is put on the budget leg.
   * Refused between two budget accounts (neutral) and between two tracking accounts.
   */
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

/** Options of the writes that touch existing bookings. */
export interface WriteOptions {
  /** Allow changing or deleting `reconciled` bookings (they are locked otherwise). */
  unlockReconciled?: boolean;
}

/** Fields of a reconciled booking that stay editable without an unlock (no effect on any figure). */
const FREE_ON_RECONCILED = new Set(['flag', 'memo']);

function assertUnlocked(rows: readonly BookingRow[], options: WriteOptions): void {
  if (options.unlockReconciled) return;
  const locked = rows.filter((r) => r.status === 'reconciled').map((r) => r.id);
  if (locked.length > 0) throw new ReconciledLockedError(locked);
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

interface FxFields {
  amountCents?: number | undefined;
  originalAmountCents?: number | null | undefined;
  originalCurrency?: string | null | undefined;
  fxRateMicro?: number | null | undefined;
  fxFeeCents?: number | null | undefined;
}

/**
 * Foreign-currency fields are all set or all empty (the fee defaults to 0 when the others are
 * given) and must reproduce the amount: `amount = round(original × rate / 1e6) + fee`, allowing
 * one cent of rounding. The CHECK constraints guard the shape, this guards the arithmetic.
 */
function normalizeFx<T extends FxFields>(input: T): T {
  const given = [input.originalAmountCents, input.originalCurrency, input.fxRateMicro].filter(
    (v) => v !== undefined && v !== null,
  ).length;
  if (given === 0) {
    if (input.fxFeeCents !== undefined && input.fxFeeCents !== null)
      throw new BookingInvariantError('An FX fee needs the original amount, currency and rate');
    return input;
  }
  if (given !== 3) {
    throw new BookingInvariantError(
      'Foreign currency needs original amount, original currency and rate together',
    );
  }
  const fee = input.fxFeeCents ?? 0;
  const original = input.originalAmountCents as number;
  const rate = input.fxRateMicro as number;
  if (!isCents(original) || !isCents(fee))
    throw new BookingInvariantError('Original amount and FX fee must be integer cents');
  if (!Number.isSafeInteger(rate) || rate <= 0)
    throw new BookingInvariantError(`FX rate ${rate} must be a positive integer (micro-units)`);
  const amount = input.amountCents as number;
  const converted = Math.round((original * rate) / 1e6);
  if (Math.abs(amount - (converted + fee)) > 1) {
    throw new BookingInvariantError(
      `Amount ${amount} cents does not match ${original} × ${rate / 1e6} + fee ${fee} = ${converted + fee} cents`,
    );
  }
  return { ...input, fxFeeCents: fee };
}

/** Categories and contacts referenced by splits (see the invariants at the top). */
function assertSplitRefs(tx: Executor, splits: readonly SplitInput[]): void {
  for (const s of splits) {
    const categoryId = s.categoryId ?? null;
    if (categoryId === null) {
      if (s.contactId)
        throw new BookingInvariantError('A split with a contact needs the "Auslagen" category');
      continue;
    }
    const row = tx
      .select({ kind: category.kind })
      .from(category)
      .where(and(eq(category.id, categoryId), isNull(category.deletedAt)))
      .get();
    if (!row)
      throw new BookingInvariantError(`Category ${categoryId} does not exist or is deleted`);
    if (row.kind === 'card_payment') {
      throw new BookingInvariantError(
        'A card payment envelope is filled automatically by card spending; book the spending category instead',
      );
    }
    if (s.contactId && row.kind !== 'advance') {
      throw new BookingInvariantError(
        'A split with a contact (receivable share) must use an "Auslagen" category (kind advance)',
      );
    }
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
  incomeTypeId: s.incomeTypeId ?? null,
});

/** Which leg of a transfer carries the category (C2): the budget leg, if exactly one is. */
function categoryLegs(
  from: { onBudget: boolean },
  to: { onBudget: boolean },
  categoryId: string | null | undefined,
): { from: string | null; to: string | null } {
  if (!categoryId) return { from: null, to: null };
  if (from.onBudget === to.onBudget) {
    throw new BookingInvariantError(
      from.onBudget
        ? 'A transfer between two budget accounts is neutral and takes no category'
        : 'A transfer between two tracking accounts does not touch the budget; no category',
    );
  }
  return from.onBudget ? { from: categoryId, to: null } : { from: null, to: categoryId };
}

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
  assertProjectAssignment(tx, input.projectId);
  assertSplits(input.amountCents, input.splits);
  assertSplitRefs(tx, input.splits);
  const acct = liveAccount(tx, input.accountId);
  const currency = input.currency ?? acct.currency;
  if (currency !== acct.currency)
    throw new BookingInvariantError(
      `Booking currency ${currency} does not match account currency ${acct.currency}`,
    );
  const id = randomUUID();
  const { splits, ...columns } = normalizeFx(input);
  insertTracked(tx, booking, { ...columns, id, transferId, currency }, ctx);
  const partners: { transferId: string; split: SplitInput; categoryId: string | null }[] = [];
  splits.forEach((s, i) => {
    let splitTransferId: string | null = null;
    let categoryId = s.categoryId ?? null;
    if (s.transferAccountId) {
      if (transferId !== null)
        throw new BookingInvariantError('A transfer leg booking cannot hold split transfers');
      if (s.transferAccountId === input.accountId)
        throw new BookingInvariantError('A split transfer needs another account');
      if (s.contactId || s.incomeTypeId)
        throw new BookingInvariantError('A transfer split has no contact or income type');
      const other = liveAccount(tx, s.transferAccountId);
      if (other.currency !== acct.currency)
        throw new BookingInvariantError('Transfers between different currencies are not supported');
      const legs = categoryLegs(acct, other, s.categoryId);
      splitTransferId = randomUUID();
      tx.insert(transfer).values({ id: splitTransferId }).run();
      categoryId = legs.from;
      partners.push({ transferId: splitTransferId, split: s, categoryId: legs.to });
    }
    insertTracked(
      tx,
      bookingSplit,
      {
        ...splitValues(s),
        categoryId,
        transferId: splitTransferId,
        id: randomUUID(),
        bookingId: id,
        sortOrder: i,
      },
      ctx,
    );
  });
  for (const p of partners) {
    insertBooking(
      tx,
      {
        accountId: p.split.transferAccountId as string,
        date: input.date,
        amountCents: -p.split.amountCents,
        memo: p.split.memo ?? input.memo ?? null,
        status: input.status,
        source: input.source,
        importKey: p.split.transferImportKey ?? null,
        importRunId: input.importRunId ?? null,
        splits: [{ categoryId: p.categoryId, amountCents: -p.split.amountCents }],
      },
      p.transferId,
      ctx,
    );
  }
  return id;
}

/** Create a booking with its splits. Returns the booking id. */
export function createBooking(db: Executor, input: BookingInput, ctx: AuditContext): string {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const incomeNextMonth =
      input.incomeNextMonth ??
      ((input.source ?? 'manual') === 'manual' ? bookingIncomeDefault(tx, input) : false);
    const id = insertBooking(tx, { ...input, incomeNextMonth }, null, grouped);
    assertLedgerInvariants(tx, relatedTransferBookings(tx, id));
    return id;
  });
}

/** Internal settlement path: allocations are persisted by its outer transaction before validation. */
export function createContactSettlementBooking(
  db: Executor,
  input: BookingInput,
  ctx: AuditContext,
): string {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const id = insertBooking(tx, input, null, grouped);
    assertLedgerInvariants(tx, [id], false);
    return id;
  });
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
    const legs = categoryLegs(from, to, input.categoryId);
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
        splits: [{ categoryId: legs.from, amountCents: -input.amountCents }],
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
        splits: [{ categoryId: legs.to, amountCents: input.amountCents }],
      },
      transferId,
      grouped,
    );
    assertLedgerInvariants(tx, [fromBookingId, toBookingId]);
    return { transferId, fromBookingId, toBookingId };
  });
}

export interface ImportTransferResult extends TransferResult {
  /** `created`: both legs new; `linked`: an existing leg got its missing partner or both got
   * linked; `existing`: the pair was already there (or a leg was deleted by the user). */
  outcome: 'created' | 'linked' | 'existing';
}

/**
 * Idempotent transfer import (C4). Legs are found by `(account, import key)` on both sides
 * (`toImportKey` defaults to `importKey`):
 * - both exist as one transfer, or one of them was deleted by the user: nothing is written;
 * - both exist as plain bookings (imported one file at a time): they are linked into a transfer;
 * - one exists: the missing leg is created and linked (a one-legged pair is repaired);
 * - none exists: the transfer is created.
 */
export function importTransfer(
  db: Executor,
  input: TransferInput & { importKey: string },
  ctx: AuditContext,
): ImportTransferResult {
  const grouped = withGroup(ctx);
  const toKey = input.toImportKey ?? input.importKey;
  return runInTransaction(db, (tx) => {
    const find = (accountId: string, key: string) =>
      tx
        .select()
        .from(booking)
        .where(and(eq(booking.accountId, accountId), eq(booking.importKey, key)))
        .get();
    const fromLeg = find(input.fromAccountId, input.importKey);
    const toLeg = find(input.toAccountId, toKey);
    if (!fromLeg && !toLeg) {
      const created = createTransfer(tx, { source: 'import', ...input }, grouped);
      return { ...created, outcome: 'created' };
    }
    const existing = (a: BookingRow, b: BookingRow): ImportTransferResult => ({
      transferId: (a.transferId ?? b.transferId) as string,
      fromBookingId: a.id,
      toBookingId: b.id,
      outcome: 'existing',
    });
    if (fromLeg && toLeg) {
      if (fromLeg.transferId && fromLeg.transferId === toLeg.transferId)
        return existing(fromLeg, toLeg);
      if (fromLeg.deletedAt || toLeg.deletedAt) return existing(fromLeg, toLeg);
      if (fromLeg.transferId || toLeg.transferId)
        throw new BookingInvariantError('An import leg already belongs to another transfer');
      const transferId = randomUUID();
      tx.insert(transfer).values({ id: transferId }).run();
      for (const leg of [fromLeg, toLeg])
        updateTracked(tx, booking, [leg.id], { transferId }, grouped);
      assertLedgerInvariants(tx, [fromLeg.id, toLeg.id]);
      return { transferId, fromBookingId: fromLeg.id, toBookingId: toLeg.id, outcome: 'linked' };
    }
    const found = (fromLeg ?? toLeg) as BookingRow;
    if (found.deletedAt || found.transferId) {
      return {
        transferId: found.transferId ?? '',
        fromBookingId: found.id,
        toBookingId: found.id,
        outcome: 'existing',
      };
    }
    const transferId = randomUUID();
    tx.insert(transfer).values({ id: transferId }).run();
    updateTracked(tx, booking, [found.id], { transferId }, grouped);
    const missing = insertBooking(
      tx,
      {
        accountId: fromLeg ? input.toAccountId : input.fromAccountId,
        date: found.date,
        amountCents: -found.amountCents,
        memo: input.memo ?? found.memo,
        status: input.status ?? found.status,
        source: input.source ?? 'import',
        importKey: fromLeg ? toKey : input.importKey,
        splits: [{ amountCents: -found.amountCents }],
      },
      transferId,
      grouped,
    );
    assertLedgerInvariants(tx, [found.id, missing]);
    return {
      transferId,
      fromBookingId: fromLeg ? found.id : missing,
      toBookingId: fromLeg ? missing : found.id,
      outcome: 'linked',
    };
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
function updateBookingImpl(
  db: Executor,
  id: string,
  patch: BookingPatch,
  ctx: AuditContext,
  options: WriteOptions = {},
  tradeNative = false,
): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadBooking(tx, id);
    if (!cur) throw new EntityNotFoundError('booking', id);
    if (!tradeNative)
      assertTradeSettlementBookingWrite(
        tx,
        id,
        'update',
        Object.entries(patch)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key),
      );
    assertContactBookingWrite(
      tx,
      id,
      'update',
      Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k),
    );
    // Reconciled bookings: only flag and memo are free; a status change also needs the unlock.
    const touchesLocked = Object.entries(patch).some(
      ([key, value]) => value !== undefined && !FREE_ON_RECONCILED.has(key),
    );
    if (touchesLocked) assertUnlocked([cur], options);
    const curSplits = loadSplits(tx, id);
    // Split-level transfers are changed by deleting and re-creating them, on both sides.
    const splitTransfer =
      curSplits.some((s) => s.transferId) ||
      (cur.transferId !== null &&
        tx.select().from(bookingSplit).where(eq(bookingSplit.transferId, cur.transferId)).get());
    if (
      splitTransfer &&
      (patch.splits !== undefined ||
        (patch.amountCents !== undefined && patch.amountCents !== cur.amountCents) ||
        (patch.date !== undefined && patch.date !== cur.date) ||
        (patch.accountId !== undefined && patch.accountId !== cur.accountId))
    ) {
      throw new BookingInvariantError(
        'A split-level transfer keeps amount, date and account; delete and re-create it',
      );
    }
    if (patch.splits?.some((s) => s.transferAccountId))
      throw new BookingInvariantError('Add split transfers when creating the booking');

    if (patch.projectId !== undefined && patch.projectId !== cur.projectId)
      assertProjectAssignment(tx, patch.projectId);
    if (patch.date !== undefined) assertDate(patch.date);
    const target = liveAccount(tx, patch.accountId ?? cur.accountId);
    if (patch.accountId !== undefined && patch.accountId !== cur.accountId) {
      if (cur.transferId)
        throw new BookingInvariantError('A transfer leg cannot be moved to another account');
      // Amounts are cents of the account's currency: a move cannot convert them.
      if (target.currency !== cur.currency) {
        throw new BookingInvariantError(
          `A booking in ${cur.currency} cannot move to an account in ${target.currency}; book it there anew`,
        );
      }
    }
    const currency = patch.currency ?? cur.currency;
    if (currency !== target.currency)
      throw new BookingInvariantError(
        `Booking currency ${currency} does not match account currency ${target.currency}`,
      );

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
    if (patch.splits) assertSplitRefs(tx, nextSplits);
    const fx = normalizeFx({ ...cur, ...patch, amountCents: amount });

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
      if (!tradeNative)
        assertTradeSettlementBookingWrite(
          tx,
          partner.id,
          'update',
          Object.keys(patch).filter((key) => key === 'date' || key === 'amountCents'),
        );
      // The other leg follows date and amount, so it must not be reconciled either.
      if (patch.date !== undefined || amountChanged) assertUnlocked([partner], options);
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
    if (
      patch.incomeNextMonth === undefined &&
      patch.splits &&
      cur.source === 'bank' &&
      curSplits.every((s) => !s.categoryId && !s.incomeTypeId && !s.contactId && !s.transferId)
    ) {
      columns['incomeNextMonth'] = bookingIncomeDefault(tx, {
        amountCents: amount,
        payeeId: patch.payeeId === undefined ? cur.payeeId : patch.payeeId,
        splits: nextSplits,
      });
    }
    delete columns['splits'];
    if (fx.fxFeeCents !== cur.fxFeeCents) columns['fxFeeCents'] = fx.fxFeeCents;
    updateTracked(tx, booking, [id], columns, grouped);
    if (patch.splits || amountChanged) syncSplits(tx, id, curSplits, nextSplits, grouped);
    const touchedBookings = relatedTransferBookings(tx, id);
    assertLedgerInvariants(tx, touchedBookings);
    for (const { id: occurrenceId, patch } of expectedLinkPatches(tx, touchedBookings))
      updateTracked(tx, expectedOccurrence, [occurrenceId], patch, grouped);
  });
}

/** Generic booking updates may change metadata on trade cash, but not its financial shape. */
export function updateBooking(
  db: Executor,
  id: string,
  patch: BookingPatch,
  ctx: AuditContext,
  options: WriteOptions = {},
): void {
  updateBookingImpl(db, id, patch, ctx, options);
}

/** Internal repository path used only by trade writes to update their own settlement. */
export function updateTradeSettlementBooking(
  db: Executor,
  id: string,
  patch: BookingPatch,
  ctx: AuditContext,
): void {
  updateBookingImpl(db, id, patch, ctx, {}, true);
}

// ---------------------------------------------------------------------------------------------
// Delete / restore
// ---------------------------------------------------------------------------------------------

/** The booking and every booking of its transfers (both kinds of legs): they go together. */
const transferLegs = (tx: Executor, row: BookingRow): BookingRow[] =>
  relatedTransferBookings(tx, row.id).map((legId) => loadBooking(tx, legId, true) as BookingRow);

/** Soft-delete a booking; both legs of a transfer go together. Splits stay but are ignored. */
function deleteBookingImpl(
  db: Executor,
  id: string,
  ctx: AuditContext,
  options: WriteOptions = {},
  tradeNative = false,
): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadBooking(tx, id);
    if (!cur) throw new EntityNotFoundError('booking', id);
    const legs = transferLegs(tx, cur);
    if (!tradeNative)
      for (const leg of legs) assertTradeSettlementBookingWrite(tx, leg.id, 'delete');
    for (const leg of legs) assertContactBookingWrite(tx, leg.id, 'delete');
    assertUnlocked(
      legs.filter((l) => l.deletedAt === null),
      options,
    );
    const deletedAt = new Date().toISOString();
    for (const leg of legs) {
      if (leg.deletedAt === null)
        updateTracked(tx, booking, [leg.id], { deletedAt }, grouped, 'delete');
    }
    assertContactSettlementInvariants(tx);
    for (const { id: occurrenceId, patch } of expectedLinkPatches(
      tx,
      legs.map((leg) => leg.id),
    ))
      updateTracked(tx, expectedOccurrence, [occurrenceId], patch, grouped);
  });
}

export function deleteBooking(
  db: Executor,
  id: string,
  ctx: AuditContext,
  options: WriteOptions = {},
): void {
  deleteBookingImpl(db, id, ctx, options);
}

/** Internal repository path used only by trade writes to delete their own settlement. */
export function deleteTradeSettlementBooking(db: Executor, id: string, ctx: AuditContext): void {
  deleteBookingImpl(db, id, ctx, {}, true);
}

/** Restore a soft-deleted booking (and the deleted legs of its transfer). */
export function restoreBooking(db: Executor, id: string, ctx: AuditContext): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadBooking(tx, id, true);
    if (!cur) throw new EntityNotFoundError('booking', id);
    if (cur.deletedAt === null) throw new BookingInvariantError(`Booking ${id} is not deleted`);
    assertContactBookingWrite(tx, id, 'restore');
    assertTradeSettlementBookingWrite(tx, id, 'restore');
    for (const leg of transferLegs(tx, cur)) {
      assertTradeSettlementBookingWrite(tx, leg.id, 'restore');
      if (leg.deletedAt !== null)
        updateTracked(tx, booking, [leg.id], { deletedAt: null }, grouped, 'restore');
    }
    const touchedBookings = relatedTransferBookings(tx, id);
    assertLedgerInvariants(tx, touchedBookings);
    for (const { id: occurrenceId, patch } of expectedLinkPatches(tx, touchedBookings))
      updateTracked(tx, expectedOccurrence, [occurrenceId], patch, grouped);
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

/** Archived projects retain their ledger, but cannot receive a new attribution. */
function assertProjectAssignment(tx: Executor, id: string | null | undefined) {
  if (!id) return;
  const row = tx
    .select()
    .from(project)
    .where(and(eq(project.id, id), isNull(project.deletedAt), isNull(project.archivedAt)))
    .get();
  if (!row)
    throw new BookingInvariantError('Projekt ist nicht aktiv. Bitte ein aktives Projekt wählen.');
}
