import {
  addDays,
  daysBetween,
  todayInVienna,
  registerMonths,
  type RegisterMonth,
  type RegisterMonthsKind,
  type CashValuation,
} from '@budget/domain';
import { cashValuer } from './cash-valuation';
import { reportTables } from './report-tables';
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
  allocationScope: typeof account.$inferSelect.allocationScope;
  allocationAssetClassId: string | null;
  id: string;
  name: string;
  type: string;
  role: string;
  onBudget: boolean;
  contactId: string | null;
  /** Verrechnungskonto of a depot (its cash account). */
  referenceAccountId: string | null;
  currency: string;
  institutionId: string | null;
  openingBalanceCents: number;
  openingDate: string;
  creditLimitCents: number | null;
  overdraftLimitCents: number | null;
  interestRateBp: number | null;
  termEnd: string | null;
  monthlyFeeCents: number | null;
  /** Loan terms: fixed or variable interest, monthly installment, start of the term, original amount. */
  interestKind: 'fixed' | 'variable' | null;
  installmentCents: number | null;
  termStart: string | null;
  originalAmountCents: number | null;
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
    allocationScope: r.account.allocationScope,
    allocationAssetClassId: r.account.allocationAssetClassId,
    contactId: r.account.contactId,
    referenceAccountId: r.account.referenceAccountId,
    currency: r.account.currency,
    institutionId: r.account.institutionId,
    openingBalanceCents: r.account.openingBalanceCents,
    openingDate: r.account.openingDate,
    creditLimitCents: r.account.creditLimitCents,
    overdraftLimitCents: r.account.overdraftLimitCents,
    interestRateBp: r.account.interestRateBp,
    termEnd: r.account.termEnd,
    monthlyFeeCents: r.account.monthlyFeeCents,
    interestKind: r.account.interestKind,
    installmentCents: r.account.installmentCents,
    termStart: r.account.termStart,
    originalAmountCents: r.account.originalAmountCents,
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

/** End-of-day balance of one account for every day of `[from, to]` (at most 100 years). */
export function balanceSeries(
  db: Executor,
  accountId: string,
  range: { from: string; to: string },
): { date: string; balanceCents: number }[] {
  if (range.to < range.from || daysBetween(range.from, range.to) > 36_525) {
    throw new RangeError('The balance series covers at most 100 years');
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
  /** Internal export pagination may omit the repeated complete-filter native read. */
  nativeSummary?: boolean;
  /** Exactly these bookings (after a write, to read them back). */
  ids?: string[];
  accountId?: string;
  /** Inclusive days. */
  from?: string;
  to?: string;
  /** A category id, or `'none'` for bookings with an uncategorised split. */
  categoryId?: string;
  /** Classified Bedarf/Wunsch contributions of this stable report group. */
  categoryGroupId?: string;
  /** Report drill-down: classified net category spending, rather than whole cash movements. */
  basis?: 'category-spending';
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
  categoryKind?: string | null;
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
  categorySpendingCents?: number;
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  incomeNextMonth: boolean;
  amountCents: number;
  payeeId: string | null;
  payeeName: string | null;
  payeeSystemKind?: typeof payee.$inferSelect.systemKind;
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
  fxRateMicro: number | null;
  fxFeeCents: number | null;
  source: string;
  splits: ListedSplit[];
  /** Account balance after this booking (only when the list is filtered to one account). */
  balanceAfterCents: number | null;
  amountValuation: CashValuation;
  balanceValuation: CashValuation | null;
}

export interface BookingPage {
  monthlyTotals?: RegisterMonth[];
  monthlyKind?: RegisterMonthsKind;
  nativeTotals?: { currency: string; count: number; cents: number | null }[];
  categorySpendingCents?: number;
  items: ListedBooking[];
  nextCursor: string | null;
  /** All bookings matching the filter and their summed amount (not only this page). */
  total: number;
  sumCents: number;
  sumEurCents: number | null;
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
export function queryBookings(
  db: Executor,
  query: BookingQuery = {},
  today = todayInVienna(),
): BookingPage {
  const value = cashValuer(db);
  const sort = query.sort ?? 'date';
  const direction = query.direction ?? 'desc';
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const conditions: (SQL | undefined)[] = [isNull(booking.deletedAt), isNull(account.deletedAt)];
  const contributions =
    (query.basis === 'category-spending' && query.categoryId) || query.categoryGroupId
      ? new Map<string, number>()
      : null;
  if (contributions) {
    const facts = reportTables(db, { today, withSources: true });
    const groupCategories = query.categoryGroupId
      ? new Set(
          facts.categories
            .filter((c) => c.groupId === query.categoryGroupId && c.class !== 'future')
            .map((c) => c.id),
        )
      : null;
    for (const s of facts.splits ?? []) {
      if (
        s.kind === 'spend' &&
        s.categoryId !== null &&
        (!query.categoryId || s.categoryId === query.categoryId) &&
        (!groupCategories || groupCategories.has(s.categoryId))
      )
        contributions.set(s.bookingId, (contributions.get(s.bookingId) ?? 0) + s.amountCents);
    }
    conditions.push(inArray(booking.id, [...contributions.keys()]));
  }
  if (query.ids) conditions.push(inArray(booking.id, query.ids));
  if (query.accountId) conditions.push(eq(booking.accountId, query.accountId));
  if (query.from) conditions.push(sql`${booking.date} >= ${query.from}`);
  if (query.to) conditions.push(sql`${booking.date} <= ${query.to}`);
  if (query.payeeId) conditions.push(eq(booking.payeeId, query.payeeId));
  if (query.status) conditions.push(eq(booking.status, query.status));
  if (query.flag === 'none') conditions.push(isNull(booking.flag));
  else if (query.flag) conditions.push(eq(booking.flag, query.flag));
  if (query.categoryId && !contributions) {
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

  // One id/date read serves the category net and the month aggregation of that basis.
  const spendingRows = contributions
    ? db
        .select({ id: booking.id, date: booking.date })
        .from(booking)
        .innerJoin(account, eq(account.id, booking.accountId))
        .leftJoin(payee, eq(payee.id, booking.payeeId))
        .where(base)
        .all()
    : [];
  const categorySpendingCents = contributions
    ? spendingRows.reduce((sum, b) => sum + (contributions.get(b.id) ?? 0), 0)
    : undefined;

  const nativeGroups = new Map<string, { count: number; cents: bigint; unsafe: boolean }>();
  if (query.nativeSummary !== false) {
    for (const row of db
      .select({ currency: booking.currency, amount: booking.amountCents })
      .from(booking)
      .innerJoin(account, eq(account.id, booking.accountId))
      .leftJoin(payee, eq(payee.id, booking.payeeId))
      .where(base)
      .all()) {
      const group = nativeGroups.get(row.currency) ?? { count: 0, cents: 0n, unsafe: false };
      group.count += 1;
      if (Number.isSafeInteger(row.amount)) group.cents += BigInt(row.amount);
      else group.unsafe = true;
      nativeGroups.set(row.currency, group);
    }
  }
  const bound = BigInt(Number.MAX_SAFE_INTEGER);
  const nativeTotals = [...nativeGroups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, value]) => ({
      currency,
      count: value.count,
      cents:
        value.unsafe || value.cents > bound || value.cents < -bound ? null : Number(value.cents),
    }));

  // Month figures: SQL GROUP BY month on the exact list predicate (before cursor/limit). Future-dated
  // rows (the hidden "Kommend" part) never count. Sign: inflow positive, outflow negative.
  const filtered = !!(
    query.text?.trim() ||
    query.categoryId ||
    query.categoryGroupId ||
    query.payeeId ||
    query.status ||
    query.flag ||
    query.ids ||
    query.from ||
    (query.to && query.to < today)
  );
  const accountRow = query.accountId
    ? db.select().from(account).where(eq(account.id, query.accountId)).get()
    : undefined;
  const monthlyKind: RegisterMonthsKind = filtered ? 'filtered' : accountRow ? 'balance' : 'rows';
  const toCents = (v: bigint): number | null => (v > bound || v < -bound ? null : Number(v));
  // EUR groups by month; other currencies by day so each day uses its own rate.
  const monthOrDay = sql<string>`CASE WHEN ${booking.currency} = 'EUR' THEN substr(${booking.date}, 1, 7) ELSE ${booking.date} END`;
  let monthlyTotals: RegisterMonth[] = [];
  if (query.nativeSummary !== false) {
    const upToToday = sql`${booking.date} <= ${today}`;
    const rows: { date: string; cents: number | null; count: number }[] = [];
    if (contributions) {
      // Category basis: report contributions are spending-positive; flip to outflow-negative.
      const byMonth = new Map<string, { count: number; cents: bigint }>();
      for (const r of spendingRows) {
        if (r.date > today) continue;
        const m = r.date.slice(0, 7);
        const g = byMonth.get(m) ?? { count: 0, cents: 0n };
        g.count += 1;
        g.cents -= BigInt(contributions.get(r.id) ?? 0);
        byMonth.set(m, g);
      }
      for (const [m, g] of byMonth)
        rows.push({ date: `${m}-01`, cents: toCents(g.cents), count: g.count });
    } else {
      const splitFilter =
        query.categoryId === 'none'
          ? and(
              isNull(bookingSplit.categoryId),
              isNull(bookingSplit.transferId),
              isNull(booking.transferId),
            )
          : query.categoryId
            ? and(
                eq(bookingSplit.categoryId, query.categoryId),
                isNull(bookingSplit.transferId),
                isNull(booking.transferId),
              )
            : undefined;
      const grouped = splitFilter
        ? db
            .select({
              currency: booking.currency,
              day: monthOrDay,
              count: sql<number>`COUNT(DISTINCT ${booking.id})`.mapWith(Number),
              sum: sql<string>`CAST(SUM(${bookingSplit.amountCents}) AS TEXT)`,
            })
            .from(booking)
            .innerJoin(account, eq(account.id, booking.accountId))
            .leftJoin(payee, eq(payee.id, booking.payeeId))
            .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
            .where(and(base, upToToday, splitFilter))
            .groupBy(booking.currency, monthOrDay)
            .all()
        : db
            .select({
              currency: booking.currency,
              day: monthOrDay,
              count: sql<number>`COUNT(*)`.mapWith(Number),
              sum: sql<string>`CAST(SUM(${booking.amountCents}) AS TEXT)`,
            })
            .from(booking)
            .innerJoin(account, eq(account.id, booking.accountId))
            .leftJoin(payee, eq(payee.id, booking.payeeId))
            .where(and(base, upToToday))
            .groupBy(booking.currency, monthOrDay)
            .all();
      for (const g of grouped) {
        const cents = toCents(BigInt(g.sum));
        rows.push({
          date: g.day.length === 7 ? `${g.day}-01` : g.day,
          cents:
            g.currency === 'EUR' || cents === null
              ? cents
              : value(cents, g.currency, g.day).eurCents,
          count: g.count,
        });
      }
    }
    let endBalance: ((month: string) => number | null) | undefined;
    if (monthlyKind === 'balance' && accountRow?.currency === 'EUR') {
      // Balance at month end = opening balance + every booking since the opening day. The month
      // net IS the balance delta (transfers included), so it replaces the grouped list sums.
      const perMonth = db
        .select({
          month: sql<string>`substr(${booking.date}, 1, 7)`,
          sum: sql<string>`CAST(SUM(${booking.amountCents}) AS TEXT)`,
        })
        .from(booking)
        .where(
          and(
            eq(booking.accountId, accountRow.id),
            isNull(booking.deletedAt),
            sql`${booking.date} >= ${accountRow.openingDate}`,
            sql`${booking.date} <= ${today}`,
          ),
        )
        .groupBy(sql`substr(${booking.date}, 1, 7)`)
        .orderBy(asc(sql`substr(${booking.date}, 1, 7)`))
        .all();
      const ends: { month: string; balance: bigint }[] = [];
      let run = BigInt(accountRow.openingBalanceCents);
      for (const m of perMonth) {
        run += BigInt(m.sum);
        ends.push({ month: m.month, balance: run });
      }
      for (const r of rows) r.cents = 0;
      for (const m of perMonth)
        rows.push({ date: `${m.month}-01`, cents: toCents(BigInt(m.sum)), count: 0 });
      endBalance = (month) => {
        let balance = BigInt(accountRow.openingBalanceCents);
        for (const e of ends) if (e.month <= month) balance = e.balance;
        return toCents(balance);
      };
    }
    monthlyTotals = registerMonths(rows, endBalance);
  }

  const after: SQL | undefined = (() => {
    if (!query.cursor) return undefined;
    const [value, id] = decodeCursor(query.cursor);
    const op = direction === 'asc' ? sql`>` : sql`<`;
    return sql`(${sortExpr} ${op} ${value} OR (${sortExpr} = ${value} AND ${booking.id} ${op} ${id}))`;
  })();

  // Include every matching booking, independent of cursor/page; each movement uses its day.
  const movements = query.accountId
    ? db
        .select({ amount: booking.amountCents, currency: booking.currency, date: booking.date })
        .from(booking)
        .innerJoin(account, eq(account.id, booking.accountId))
        .leftJoin(payee, eq(payee.id, booking.payeeId))
        .where(base)
        .all()
    : [];
  let sumEurCents: number | null = query.accountId ? 0 : null;
  for (const movement of movements) {
    const eur = value(movement.amount, movement.currency, movement.date).eurCents;
    if (eur === null) {
      sumEurCents = null;
      break;
    }
    sumEurCents = (sumEurCents ?? 0) + eur;
  }

  // One chronological pass, independent of filters/cursor. A correlated SUM in the paged
  // SELECT was evaluated before sorting/limiting, making large registers quadratic.
  const balances = new Map<string, number>();
  if (query.accountId) {
    const a = db.select().from(account).where(eq(account.id, query.accountId)).get();
    if (a) {
      let balance = a.openingBalanceCents;
      for (const b of db
        .select({ id: booking.id, date: booking.date, amount: booking.amountCents })
        .from(booking)
        .where(and(eq(booking.accountId, a.id), isNull(booking.deletedAt)))
        .orderBy(asc(booking.date), asc(booking.id))
        .all()) {
        if (b.date >= a.openingDate) balance += b.amount;
        balances.set(b.id, balance);
      }
    }
  }

  const rows = db
    .select({
      booking,
      accountName: account.name,
      payeeName: payee.name,
      payeeSystemKind: payee.systemKind,
      sortValue: sql<string | number>`${sortExpr}`,
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
        .select({ split: bookingSplit, categoryName: category.name, categoryKind: category.kind })
        .from(bookingSplit)
        .leftJoin(category, eq(category.id, bookingSplit.categoryId))
        .where(inArray(bookingSplit.bookingId, ids))
        .orderBy(asc(bookingSplit.bookingId), asc(bookingSplit.sortOrder), asc(bookingSplit.id))
        .all()
    : [];
  const splitsOf = new Map<string, ListedSplit[]>();
  for (const { split, categoryName, categoryKind } of splits) {
    const list = splitsOf.get(split.bookingId) ?? [];
    list.push({
      id: split.id,
      categoryId: split.categoryId,
      categoryName,
      categoryKind,
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
      ...(contributions ? { categorySpendingCents: contributions.get(b.id) ?? 0 } : {}),
      id: b.id,
      accountId: b.accountId,
      accountName: r.accountName,
      date: b.date,
      incomeNextMonth: b.incomeNextMonth,
      amountCents: b.amountCents,
      payeeId: b.payeeId,
      payeeName: r.payeeName,
      payeeSystemKind: r.payeeSystemKind,
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
      fxRateMicro: b.fxRateMicro,
      fxFeeCents: b.fxFeeCents,
      source: b.source,
      splits: own,
      balanceAfterCents: balances.get(b.id) ?? null,
      amountValuation: value(b.amountCents, b.currency, b.date),
      balanceValuation: balances.has(b.id) ? value(balances.get(b.id)!, b.currency, b.date) : null,
    };
  });
  const last = page.at(-1);
  return {
    ...(query.nativeSummary !== false ? { nativeTotals, monthlyTotals, monthlyKind } : {}),
    ...(categorySpendingCents !== undefined ? { categorySpendingCents } : {}),
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(last.sortValue, last.booking.id) : null,
    total: totals.total,
    sumCents: totals.sum,
    sumEurCents,
  };
}
