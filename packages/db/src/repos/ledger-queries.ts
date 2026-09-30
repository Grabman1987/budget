import { addDays, daysBetween } from '@budget/domain';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import { account, accountReconciliation, booking, bookingSplit, category, payee } from '../schema';
import type { BOOKING_FLAGS, BOOKING_STATUSES } from '../schema';
import type { Executor } from './types';

/**
 * Read models for the Konten pages: account summaries with balances, the balance line of one
 * account and the booking list with filters, sorting and cursor pagination. All ignore
 * soft-deleted bookings and accounts.
 */

// ---------------------------------------------------------------------------------------------
// Accounts with balances
// ---------------------------------------------------------------------------------------------

export interface AccountSummary {
  id: string;
  name: string;
  type: string;
  role: string;
  onBudget: boolean;
  currency: string;
  institutionId: string | null;
  openingBalanceCents: number;
  openingDate: string;
  creditLimitCents: number | null;
  overdraftLimitCents: number | null;
  interestRateBp: number | null;
  termEnd: string | null;
  monthlyFeeCents: number | null;
  sortOrder: number;
  closedAt: string | null;
  note: string | null;
  /** Balance as of the day: opening balance plus every booking up to and including it. */
  balanceCents: number;
  /** The part of `balanceCents` the bank has confirmed (`confirmed` and `reconciled`). */
  clearedCents: number;
  /** The part that is still `pending` (vorgemerkt). `balanceCents = clearedCents + unclearedCents`. */
  unclearedCents: number;
  /** Sum of bookings dated after the day (scheduled, not part of the balance). */
  scheduledCents: number;
  /** Live bookings on the account. */
  bookingCount: number;
  pendingCount: number;
  /** Day of the latest Kontostand prüfen, if any. */
  lastReconciledOn: string | null;
}

/**
 * Every live account by `sort_order` with its balances as of `asOf` (a `YYYY-MM-DD` day). One
 * opening-date rule (C5): 0 before the opening date, afterwards opening balance plus the bookings
 * dated on or after it. Closed accounts are included (`closedAt`).
 */
export function accountSummaries(db: Executor, asOf: string): AccountSummary[] {
  const inRange = sql`${booking.date} >= ${account.openingDate} AND ${booking.date} <= ${asOf}`;
  const opening = sql`CASE WHEN ${account.openingDate} <= ${asOf} THEN ${account.openingBalanceCents} ELSE 0 END`;
  const sumOf = (extra: SQL) =>
    sql<number>`COALESCE(SUM(CASE WHEN ${inRange} AND ${extra} THEN ${booking.amountCents} ELSE 0 END), 0)`.mapWith(
      Number,
    );
  const pending = sql`${booking.status} = 'pending'`;
  const rows = db
    .select({
      account,
      opening: sql<number>`${opening}`.mapWith(Number),
      all: sumOf(sql`1 = 1`),
      pending: sumOf(pending),
      scheduled:
        sql<number>`COALESCE(SUM(CASE WHEN ${booking.date} > ${asOf} THEN ${booking.amountCents} ELSE 0 END), 0)`.mapWith(
          Number,
        ),
      bookingCount: sql<number>`COUNT(${booking.id})`.mapWith(Number),
      pendingCount: sql<number>`COUNT(CASE WHEN ${pending} THEN 1 END)`.mapWith(Number),
      lastReconciledOn: sql<
        string | null
      >`(SELECT MAX(${accountReconciliation.date}) FROM ${accountReconciliation} WHERE ${accountReconciliation.accountId} = ${account.id} AND ${accountReconciliation.deletedAt} IS NULL)`,
    })
    .from(account)
    .leftJoin(booking, and(eq(booking.accountId, account.id), isNull(booking.deletedAt)))
    .where(isNull(account.deletedAt))
    .groupBy(account.id)
    .orderBy(asc(account.sortOrder), asc(account.name), asc(account.id))
    .all();
  return rows.map((r) => ({
    id: r.account.id,
    name: r.account.name,
    type: r.account.type,
    role: r.account.role,
    onBudget: r.account.onBudget,
    currency: r.account.currency,
    institutionId: r.account.institutionId,
    openingBalanceCents: r.account.openingBalanceCents,
    openingDate: r.account.openingDate,
    creditLimitCents: r.account.creditLimitCents,
    overdraftLimitCents: r.account.overdraftLimitCents,
    interestRateBp: r.account.interestRateBp,
    termEnd: r.account.termEnd,
    monthlyFeeCents: r.account.monthlyFeeCents,
    sortOrder: r.account.sortOrder,
    closedAt: r.account.closedAt,
    note: r.account.note,
    balanceCents: r.opening + r.all,
    clearedCents: r.opening + r.all - r.pending,
    unclearedCents: r.pending,
    scheduledCents: r.scheduled,
    bookingCount: r.bookingCount,
    pendingCount: r.pendingCount,
    lastReconciledOn: r.lastReconciledOn,
  }));
}

/** End-of-day balance of one account for every day of `[from, to]` (at most 400 days). */
export function balanceSeries(
  db: Executor,
  accountId: string,
  range: { from: string; to: string },
): { date: string; balanceCents: number }[] {
  if (range.to < range.from || daysBetween(range.from, range.to) > 400) {
    throw new RangeError('The balance series covers 1 to 401 days');
  }
  const acct = db.select().from(account).where(eq(account.id, accountId)).get();
  if (!acct) return [];
  const sums = db
    .select({
      date: booking.date,
      total: sql<number>`SUM(${booking.amountCents})`.mapWith(Number),
    })
    .from(booking)
    .where(
      and(
        eq(booking.accountId, accountId),
        isNull(booking.deletedAt),
        sql`${booking.date} >= ${acct.openingDate}`,
        sql`${booking.date} <= ${range.to}`,
      ),
    )
    .groupBy(booking.date)
    .orderBy(asc(booking.date))
    .all();
  let balance = acct.openingBalanceCents;
  let index = 0;
  const series: { date: string; balanceCents: number }[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    while (sums[index] && (sums[index] as { date: string }).date <= day) {
      balance += (sums[index] as { total: number }).total;
      index += 1;
    }
    series.push({ date: day, balanceCents: day < acct.openingDate ? 0 : balance });
  }
  return series;
}

// ---------------------------------------------------------------------------------------------
// Booking list
// ---------------------------------------------------------------------------------------------

export const BOOKING_SORTS = ['date', 'amount', 'payee', 'account'] as const;
export type BookingSort = (typeof BOOKING_SORTS)[number];

export interface BookingQuery {
  /** Exactly these bookings (after a write, to read them back). */
  ids?: string[];
  accountId?: string;
  /** Inclusive days. */
  from?: string;
  to?: string;
  /** A category id, or `'none'` for bookings with an uncategorised split. */
  categoryId?: string;
  payeeId?: string;
  status?: (typeof BOOKING_STATUSES)[number];
  flag?: (typeof BOOKING_FLAGS)[number] | 'none';
  /** Free text over memo, split memo, payee, category and account name. */
  text?: string;
  sort?: BookingSort;
  direction?: 'asc' | 'desc';
  /** Default 50, at most 200. */
  limit?: number;
  /** `nextCursor` of the previous page. */
  cursor?: string;
}

export interface ListedSplit {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  amountCents: number;
  memo: string | null;
  contactId: string | null;
  incomeTypeId: string | null;
  transferId: string | null;
}

export interface ListedBooking {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  amountCents: number;
  payeeId: string | null;
  payeeName: string | null;
  memo: string | null;
  status: (typeof BOOKING_STATUSES)[number];
  flag: (typeof BOOKING_FLAGS)[number] | null;
  transferId: string | null;
  /** The other account of a transfer (whole-booking or split leg). */
  transferAccountId: string | null;
  transferAccountName: string | null;
  projectId: string | null;
  currency: string;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  splits: ListedSplit[];
  /** Account balance after this booking (only when the list is filtered to one account). */
  balanceAfterCents: number | null;
}

export interface BookingPage {
  items: ListedBooking[];
  nextCursor: string | null;
  /** All bookings matching the filter and their summed amount (not only this page). */
  total: number;
  sumCents: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Escape `%`, `_` and the escape character for `LIKE ... ESCAPE '\'`. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Case variants of a search word: SQLite `LIKE` folds ASCII only, umlauts need the variants. */
const textVariants = (text: string): string[] => {
  const t = text.trim();
  const capitalised = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  return [...new Set([t, t.toLowerCase(), t.toUpperCase(), capitalised])];
};

function encodeCursor(value: string | number, id: string): string {
  return Buffer.from(JSON.stringify([value, id])).toString('base64url');
}
function decodeCursor(cursor: string): [string | number, string] {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      (typeof parsed[0] === 'string' || typeof parsed[0] === 'number') &&
      typeof parsed[1] === 'string'
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // fall through
  }
  throw new RangeError('Invalid cursor');
}

/**
 * Bookings with filters, one sort and cursor pagination (keyset: stable while bookings are added
 * or removed). Ties in the sort value are ordered by id in the same direction.
 */
export function queryBookings(db: Executor, query: BookingQuery = {}): BookingPage {
  const sort = query.sort ?? 'date';
  const direction = query.direction ?? 'desc';
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const conditions: (SQL | undefined)[] = [isNull(booking.deletedAt), isNull(account.deletedAt)];
  if (query.ids) conditions.push(inArray(booking.id, query.ids));
  if (query.accountId) conditions.push(eq(booking.accountId, query.accountId));
  if (query.from) conditions.push(sql`${booking.date} >= ${query.from}`);
  if (query.to) conditions.push(sql`${booking.date} <= ${query.to}`);
  if (query.payeeId) conditions.push(eq(booking.payeeId, query.payeeId));
  if (query.status) conditions.push(eq(booking.status, query.status));
  if (query.flag === 'none') conditions.push(isNull(booking.flag));
  else if (query.flag) conditions.push(eq(booking.flag, query.flag));
  if (query.categoryId) {
    conditions.push(
      inArray(
        booking.id,
        db
          .select({ id: bookingSplit.bookingId })
          .from(bookingSplit)
          .where(
            query.categoryId === 'none'
              ? isNull(bookingSplit.categoryId)
              : eq(bookingSplit.categoryId, query.categoryId),
          ),
      ),
    );
  }
  const text = query.text?.trim();
  if (text) {
    const patterns = textVariants(text).map(likePattern);
    const any = (column: SQLWrapper) =>
      or(...patterns.map((p) => sql`${column} LIKE ${p} ESCAPE '\\'`));
    conditions.push(
      or(
        any(booking.memo),
        any(payee.name),
        any(account.name),
        inArray(
          booking.id,
          db
            .select({ id: bookingSplit.bookingId })
            .from(bookingSplit)
            .leftJoin(category, eq(category.id, bookingSplit.categoryId))
            .where(or(any(bookingSplit.memo), any(category.name))),
        ),
      ),
    );
  }

  const sortExpr: SQL =
    sort === 'amount'
      ? sql`${booking.amountCents}`
      : sort === 'payee'
        ? sql`COALESCE(${payee.name}, '')`
        : sort === 'account'
          ? sql`${account.name}`
          : sql`${booking.date}`;
  const order = direction === 'asc' ? asc : desc;
  const base = and(...conditions);

  const totals = db
    .select({
      total: sql<number>`COUNT(*)`.mapWith(Number),
      sum: sql<number>`COALESCE(SUM(${booking.amountCents}), 0)`.mapWith(Number),
    })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(base)
    .get() as { total: number; sum: number };

  const after: SQL | undefined = (() => {
    if (!query.cursor) return undefined;
    const [value, id] = decodeCursor(query.cursor);
    const op = direction === 'asc' ? sql`>` : sql`<`;
    return sql`(${sortExpr} ${op} ${value} OR (${sortExpr} = ${value} AND ${booking.id} ${op} ${id}))`;
  })();

  // Balance after the booking: opening balance plus every booking up to it in (date, id) order.
  const running = sql<number | null>`CASE WHEN ${query.accountId ?? null} IS NULL THEN NULL ELSE (
    SELECT ${account.openingBalanceCents} + COALESCE(SUM(b2.amount_cents), 0) FROM booking b2
    WHERE b2.account_id = ${booking.accountId} AND b2.deleted_at IS NULL
      AND b2.date >= ${account.openingDate}
      AND (b2.date < ${booking.date} OR (b2.date = ${booking.date} AND b2.id <= ${booking.id}))) END`;

  const rows = db
    .select({
      booking,
      accountName: account.name,
      payeeName: payee.name,
      sortValue: sql<string | number>`${sortExpr}`,
      balanceAfter: running,
    })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(and(base, after))
    .orderBy(order(sortExpr), order(booking.id))
    .limit(limit + 1)
    .all();

  const page = rows.slice(0, limit);
  const ids = page.map((r) => r.booking.id);
  const splits = ids.length
    ? db
        .select({ split: bookingSplit, categoryName: category.name })
        .from(bookingSplit)
        .leftJoin(category, eq(category.id, bookingSplit.categoryId))
        .where(inArray(bookingSplit.bookingId, ids))
        .orderBy(asc(bookingSplit.bookingId), asc(bookingSplit.sortOrder), asc(bookingSplit.id))
        .all()
    : [];
  const splitsOf = new Map<string, ListedSplit[]>();
  for (const { split, categoryName } of splits) {
    const list = splitsOf.get(split.bookingId) ?? [];
    list.push({
      id: split.id,
      categoryId: split.categoryId,
      categoryName,
      amountCents: split.amountCents,
      memo: split.memo,
      contactId: split.contactId,
      incomeTypeId: split.incomeTypeId,
      transferId: split.transferId,
    });
    splitsOf.set(split.bookingId, list);
  }

  // The other leg of every transfer on the page, whole-booking legs and split legs alike.
  const transferIds = new Set<string>();
  for (const r of page) {
    if (r.booking.transferId) transferIds.add(r.booking.transferId);
    for (const s of splitsOf.get(r.booking.id) ?? [])
      if (s.transferId) transferIds.add(s.transferId);
  }
  interface Leg {
    bookingId: string;
    accountId: string;
    accountName: string;
  }
  const legsOf = new Map<string, Leg[]>();
  if (transferIds.size > 0) {
    const ids2 = [...transferIds];
    const whole = db
      .select({
        transferId: booking.transferId,
        bookingId: booking.id,
        accountId: booking.accountId,
        accountName: account.name,
      })
      .from(booking)
      .innerJoin(account, eq(account.id, booking.accountId))
      .where(and(isNull(booking.deletedAt), inArray(booking.transferId, ids2)))
      .all();
    const parts = db
      .select({
        transferId: bookingSplit.transferId,
        bookingId: booking.id,
        accountId: booking.accountId,
        accountName: account.name,
      })
      .from(bookingSplit)
      .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
      .innerJoin(account, eq(account.id, booking.accountId))
      .where(and(isNull(booking.deletedAt), inArray(bookingSplit.transferId, ids2)))
      .all();
    for (const { transferId, ...leg } of [...whole, ...parts]) {
      if (!transferId) continue;
      legsOf.set(transferId, [...(legsOf.get(transferId) ?? []), leg]);
    }
  }
  const otherLeg = (bookingId: string, transfers: string[]): Leg | null => {
    for (const t of transfers) {
      const other = (legsOf.get(t) ?? []).find((l) => l.bookingId !== bookingId);
      if (other) return other;
    }
    return null;
  };

  const items: ListedBooking[] = page.map((r) => {
    const b = r.booking;
    const own = splitsOf.get(b.id) ?? [];
    const tids = [b.transferId, ...own.map((s) => s.transferId)].filter((t): t is string => !!t);
    const other = otherLeg(b.id, tids);
    return {
      id: b.id,
      accountId: b.accountId,
      accountName: r.accountName,
      date: b.date,
      amountCents: b.amountCents,
      payeeId: b.payeeId,
      payeeName: r.payeeName,
      memo: b.memo,
      status: b.status,
      flag: b.flag,
      transferId: b.transferId ?? own.find((s) => s.transferId)?.transferId ?? null,
      transferAccountId: other?.accountId ?? null,
      transferAccountName: other?.accountName ?? null,
      projectId: b.projectId,
      currency: b.currency,
      originalAmountCents: b.originalAmountCents,
      originalCurrency: b.originalCurrency,
      splits: own,
      balanceAfterCents: r.balanceAfter === null ? null : Number(r.balanceAfter),
    };
  });
  const last = page.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(last.sortValue, last.booking.id) : null,
    total: totals.total,
    sumCents: totals.sum,
  };
}
