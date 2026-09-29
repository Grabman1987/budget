import { and, asc, count, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { account, booking, bookingSplit } from '../schema';
import type { Executor } from './types';

/**
 * Read models for the domain layer. All are single aggregate queries (no N+1) that ignore
 * soft-deleted bookings and accounts; splits count through their live parent booking. Indexes
 * used: `booking_account_date_idx`, `split_booking_idx`.
 */

export interface AccountBalance {
  accountId: string;
  balanceCents: number;
}
export interface CategoryMonthActivity {
  /** `null` = uncategorized (an inflow that is still "Zu verteilen"). */
  categoryId: string | null;
  /** `YYYY-MM` of the booking date. */
  month: string;
  /** Signed sum of split amounts (outflow negative). */
  cents: number;
}

/**
 * Balance per live account (by `sort_order`): opening balance (counted from its opening date on)
 * plus the booking amounts up to and including `asOfDate` (default: all bookings).
 */
export function accountBalances(db: Executor, asOfDate?: string): AccountBalance[] {
  const opening =
    asOfDate === undefined
      ? sql`${account.openingBalanceCents}`
      : sql`CASE WHEN ${account.openingDate} <= ${asOfDate} THEN ${account.openingBalanceCents} ELSE 0 END`;
  return db
    .select({
      accountId: account.id,
      balanceCents: sql<number>`${opening} + COALESCE(SUM(${booking.amountCents}), 0)`.mapWith(
        Number,
      ),
    })
    .from(account)
    .leftJoin(
      booking,
      and(
        eq(booking.accountId, account.id),
        isNull(booking.deletedAt),
        asOfDate === undefined ? undefined : lte(booking.date, asOfDate),
      ),
    )
    .where(isNull(account.deletedAt))
    .groupBy(account.id)
    .orderBy(asc(account.sortOrder), asc(account.name), asc(account.id))
    .all();
}

/**
 * Activity per split category and booking month, ordered by month then category (uncategorized
 * first). Transfer legs count only when their split carries a category (a plain transfer is
 * neutral and never becomes "Zu verteilen").
 */
export function activityByCategoryMonth(db: Executor): CategoryMonthActivity[] {
  const month = sql<string>`substr(${booking.date}, 1, 7)`;
  return db
    .select({
      categoryId: bookingSplit.categoryId,
      month: month.as('month'),
      cents: sql<number>`SUM(${bookingSplit.amountCents})`.mapWith(Number),
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(
      and(
        isNull(booking.deletedAt),
        or(isNull(booking.transferId), isNotNull(bookingSplit.categoryId)),
      ),
    )
    .groupBy(bookingSplit.categoryId, month)
    .orderBy(asc(sql`month`), asc(bookingSplit.categoryId))
    .all();
}

/** Number of live bookings per account (accounts without bookings are omitted). */
export function bookingCountByAccount(db: Executor): { accountId: string; count: number }[] {
  return db
    .select({ accountId: booking.accountId, count: count() })
    .from(booking)
    .where(isNull(booking.deletedAt))
    .groupBy(booking.accountId)
    .orderBy(asc(booking.accountId))
    .all();
}
