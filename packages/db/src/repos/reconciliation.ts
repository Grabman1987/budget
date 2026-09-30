import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { account, accountReconciliation, booking, payee, SYSTEM_PAYEE_IDS } from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { createBooking, deleteBooking } from './bookings';
import { BookingInvariantError, ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

/**
 * Kontostand prüfen (Kontoprüfung): the owner enters the bank balance of a day, the app compares it
 * with its own booked balance (`confirmed` and `reconciled` bookings up to that day, pending ones do
 * not count), explains a difference ("doppelt": the same booking twice; "fehlt": a booking is
 * missing or a pending one is already booked at the bank) and on confirmation stamps the bookings
 * `reconciled`, stores a snapshot and optionally books the Ausgleich.
 */

export interface DuplicateCandidate {
  /** The booking to remove and the one that stays. */
  removeId: string;
  keepId: string;
  date: string;
  payeeName: string | null;
  amountCents: number;
  /** Removing it makes the balances agree. */
  explainsDifference: boolean;
}

export interface PendingMatch {
  bookingIds: string[];
  sumCents: number;
}

export interface ReconciliationPreview {
  accountId: string;
  date: string;
  statementBalanceCents: number;
  /** Opening balance plus `confirmed` and `reconciled` bookings up to `date`. */
  bookedBalanceCents: number;
  /** Pending bookings up to `date` (not part of the check). */
  pendingCents: number;
  /** `statement − booked`. Negative: the app is too high. */
  differenceCents: number;
  /** Confirmed bookings that a successful check will stamp as `reconciled`. */
  toReconcileCount: number;
  duplicates: DuplicateCandidate[];
  /** Sets of pending bookings whose sum is the difference: the bank has booked them already. */
  pendingMatches: PendingMatch[];
  /** Neither a duplicate nor a pending set explains it: a booking is missing. */
  missing: { kind: 'expense' | 'income'; amountCents: number } | null;
}

function liveAccount(db: Executor, accountId: string) {
  const row = db
    .select()
    .from(account)
    .where(and(eq(account.id, accountId), isNull(account.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('account', accountId);
  return row;
}

const isDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** Booked (cleared) balance of `accountId` on `date`, by the one opening-date rule. */
export function bookedBalance(db: Executor, accountId: string, date: string): number {
  const acct = liveAccount(db, accountId);
  if (date < acct.openingDate) return 0;
  const row = db
    .select({ total: sql<number>`COALESCE(SUM(${booking.amountCents}), 0)`.mapWith(Number) })
    .from(booking)
    .where(
      and(
        eq(booking.accountId, accountId),
        isNull(booking.deletedAt),
        inArray(booking.status, ['confirmed', 'reconciled']),
        gte(booking.date, acct.openingDate),
        lte(booking.date, date),
      ),
    )
    .get();
  return acct.openingBalanceCents + (row?.total ?? 0);
}

/** Up to `max` subsets (smallest first) of `items` whose amounts add up to `target`. */
function subsetsSumming(
  items: readonly { id: string; cents: number }[],
  target: number,
  max = 3,
): string[][] {
  const found: string[][] = [];
  const pool = items.slice(0, 18); // exhaustive search stays cheap
  const walk = (start: number, chosen: string[], sum: number, size: number): void => {
    if (chosen.length === size) {
      if (sum === target) found.push([...chosen]);
      return;
    }
    for (let i = start; i < pool.length && found.length < 50; i++) {
      const item = pool[i] as { id: string; cents: number };
      chosen.push(item.id);
      walk(i + 1, chosen, sum + item.cents, size);
      chosen.pop();
    }
  };
  for (let size = 1; size <= Math.min(4, pool.length) && found.length < max; size++) {
    walk(0, [], 0, size);
  }
  return found.slice(0, max);
}

export function previewReconciliation(
  db: Executor,
  input: { accountId: string; date: string; statementBalanceCents: number },
): ReconciliationPreview {
  if (!isDay(input.date)) throw new BookingInvariantError(`Date "${input.date}" is not valid`);
  if (!Number.isSafeInteger(input.statementBalanceCents))
    throw new BookingInvariantError('The bank balance is an integer number of cents');
  const acct = liveAccount(db, input.accountId);
  const booked = bookedBalance(db, acct.id, input.date);
  const rows = db
    .select({ booking, payeeName: payee.name })
    .from(booking)
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(
      and(
        eq(booking.accountId, acct.id),
        isNull(booking.deletedAt),
        gte(booking.date, acct.openingDate),
        lte(booking.date, input.date),
      ),
    )
    .orderBy(asc(booking.date), asc(booking.createdAt), asc(booking.id))
    .all();
  const pending = rows.filter((r) => r.booking.status === 'pending');
  const pendingCents = pending.reduce((a, r) => a + r.booking.amountCents, 0);
  const difference = input.statementBalanceCents - booked;

  // "doppelt": same day, payee and amount twice among the booked bookings (plain, no transfer).
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.booking.status === 'pending' || r.booking.transferId) continue;
    const key = `${r.booking.date}|${r.booking.payeeId ?? ''}|${r.booking.amountCents}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const duplicates: DuplicateCandidate[] = [];
  for (const list of groups.values()) {
    const [keep, ...extra] = list;
    if (!keep) continue;
    for (const r of extra) {
      if (r.booking.status === 'reconciled') continue; // a locked booking is not proposed for removal
      duplicates.push({
        removeId: r.booking.id,
        keepId: keep.booking.id,
        date: r.booking.date,
        payeeName: r.payeeName,
        amountCents: r.booking.amountCents,
        explainsDifference: r.booking.amountCents === -difference,
      });
    }
  }
  duplicates.sort((a, b) => Number(b.explainsDifference) - Number(a.explainsDifference));

  const pendingMatches =
    difference === 0
      ? []
      : subsetsSumming(
          pending.map((r) => ({ id: r.booking.id, cents: r.booking.amountCents })),
          difference,
        ).map((ids) => ({
          bookingIds: ids,
          sumCents: ids.reduce(
            (a, id) => a + (pending.find((r) => r.booking.id === id)?.booking.amountCents ?? 0),
            0,
          ),
        }));

  const explained = duplicates.some((d) => d.explainsDifference) || pendingMatches.length > 0;
  return {
    accountId: acct.id,
    date: input.date,
    statementBalanceCents: input.statementBalanceCents,
    bookedBalanceCents: booked,
    pendingCents,
    differenceCents: difference,
    toReconcileCount: rows.filter((r) => r.booking.status === 'confirmed').length,
    duplicates,
    pendingMatches,
    missing:
      difference === 0 || explained
        ? null
        : { kind: difference < 0 ? 'expense' : 'income', amountCents: Math.abs(difference) },
  };
}

export interface ReconcileInput {
  accountId: string;
  date: string;
  statementBalanceCents: number;
  /** Duplicates to remove first (plain bookings, not reconciled). */
  removeBookingIds?: string[];
  /** Pending bookings the bank has booked: they become `confirmed` first. */
  confirmBookingIds?: string[];
  /** Book the remaining difference as Ausgleich (payee "Korrektur Kontoprüfung"). */
  adjust?: boolean;
  note?: string | null;
}

export interface ReconcileResult {
  reconciliationId: string;
  groupId: string;
  /** Difference before the Ausgleich (after removals and confirmations). */
  differenceCents: number;
  adjustmentBookingId: string | null;
  reconciledCount: number;
}

/**
 * Confirm a Kontostand prüfen in one transaction and one audit group (one undo): remove the
 * chosen duplicates, confirm the chosen pending bookings, book the Ausgleich if asked, stamp every
 * confirmed booking up to the day `reconciled` and store the snapshot. Without `adjust`, a
 * remaining difference is an error and nothing is written.
 */
export function reconcileAccount(
  db: Executor,
  input: ReconcileInput,
  ctx: AuditContext,
): ReconcileResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const acct = liveAccount(tx, input.accountId);
    if (!isDay(input.date) || input.date < acct.openingDate)
      throw new BookingInvariantError(`Date "${input.date}" is not valid for this account`);
    const own = (id: string) => {
      const row = tx
        .select()
        .from(booking)
        .where(and(eq(booking.id, id), isNull(booking.deletedAt)))
        .get();
      if (!row || row.accountId !== acct.id || row.date > input.date)
        throw new BookingInvariantError(`Booking ${id} is not on this account up to the day`);
      return row;
    };
    for (const id of input.removeBookingIds ?? []) {
      if (own(id).transferId)
        throw new BookingInvariantError('Only plain bookings are removed as duplicates');
      deleteBooking(tx, id, grouped);
    }
    for (const id of input.confirmBookingIds ?? []) {
      if (own(id).status !== 'pending')
        throw new BookingInvariantError(`Booking ${id} is not pending`);
      updateTracked(tx, booking, [id], { status: 'confirmed' }, grouped);
    }

    const cleared = bookedBalance(tx, acct.id, input.date);
    const difference = input.statementBalanceCents - cleared;
    let adjustmentBookingId: string | null = null;
    if (difference !== 0) {
      if (!input.adjust) {
        throw new ConflictError(
          `The bank balance differs from the app by ${difference} cents; remove duplicates, confirm bookings or book the Ausgleich`,
        );
      }
      adjustmentBookingId = createBooking(
        tx,
        {
          accountId: acct.id,
          date: input.date,
          amountCents: difference,
          payeeId: SYSTEM_PAYEE_IDS.reconciliation_adjustment.id,
          memo: 'Differenz zum Bank-Saldo',
          status: 'confirmed',
          source: 'system',
          splits: [{ amountCents: difference }],
        },
        grouped,
      );
    }

    const toStamp = tx
      .select({ id: booking.id })
      .from(booking)
      .where(
        and(
          eq(booking.accountId, acct.id),
          isNull(booking.deletedAt),
          eq(booking.status, 'confirmed'),
          gte(booking.date, acct.openingDate),
          lte(booking.date, input.date),
        ),
      )
      .all();
    for (const { id } of toStamp)
      updateTracked(tx, booking, [id], { status: 'reconciled' }, grouped);

    if (bookedBalance(tx, acct.id, input.date) !== input.statementBalanceCents)
      throw new BookingInvariantError('The reconciled balance does not match the bank balance');
    const row = insertTracked(
      tx,
      accountReconciliation,
      {
        id: crypto.randomUUID(),
        accountId: acct.id,
        date: input.date,
        statementBalanceCents: input.statementBalanceCents,
        clearedBalanceCents: cleared,
        adjustmentBookingId,
        note: input.note ?? null,
      },
      grouped,
    );
    return {
      reconciliationId: row.id,
      groupId: grouped.groupId,
      differenceCents: difference,
      adjustmentBookingId,
      reconciledCount: toStamp.length,
    };
  });
}

/** The stored checks of an account, newest first. */
export function listReconciliations(db: Executor, accountId: string) {
  return db
    .select()
    .from(accountReconciliation)
    .where(
      and(eq(accountReconciliation.accountId, accountId), isNull(accountReconciliation.deletedAt)),
    )
    .orderBy(sql`${accountReconciliation.date} DESC`, sql`${accountReconciliation.createdAt} DESC`)
    .all();
}
