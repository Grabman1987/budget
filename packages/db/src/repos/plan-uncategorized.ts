import { addMonths } from '@budget/domain';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { account, booking, bookingSplit } from '../schema';
import { assertEurBudgetAccounts } from './account-invariants';
import { queryBookings } from './ledger-queries';
import type { Executor } from './types';

/** Missing classification, rather than the broader pending-money Plan warning. */
function missingCategory(month: string) {
  return and(
    isNull(account.deletedAt),
    isNull(booking.deletedAt),
    eq(account.onBudget, true),
    sql`${booking.date} >= ${month + '-01'}`,
    sql`${booking.date} < ${addMonths(month, 1) + '-01'}`,
    sql`${booking.date} >= ${account.openingDate}`,
    isNull(booking.transferId),
    isNull(bookingSplit.transferId),
    isNull(bookingSplit.categoryId),
    isNull(bookingSplit.incomeTypeId),
    isNull(bookingSplit.contactId),
    sql`${bookingSplit.amountCents} <> 0`,
  );
}

export function planUncategorizedCount(db: Executor, month: string): number {
  assertEurBudgetAccounts(db);
  return db
    .select({ count: sql<number>`count(distinct ${booking.id})`.mapWith(Number) })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(missingCategory(month))
    .get()!.count;
}

/** Call inside the route's snapshot transaction; no unbounded ledger payload. */
export function planUncategorizedPage(
  db: Executor,
  month: string,
  offset: number,
  limit: number,
  today: string,
) {
  const total = planUncategorizedCount(db, month);
  const rows = db
    .select({ id: booking.id })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(missingCategory(month))
    .groupBy(booking.id, booking.date)
    .orderBy(desc(booking.date), desc(booking.id))
    .limit(limit)
    .offset(offset)
    .all();
  const items = rows.length
    ? queryBookings(db, { ids: rows.map((row) => row.id), limit, sort: 'date' }, today).items
    : [];
  return { items, total };
}
