import { and, eq, isNull, sql } from 'drizzle-orm';
import { booking, payee } from '../schema';
import type { Executor } from './types';
import type { StatementPurchaseBooking } from '@budget/domain';

/** Read the entire requested cycle, never a paginated candidate subset. Settlement
 * transfers are excluded; mixed transfer/expense bookings remain explicitly unsupported. */
export function readStatementPurchaseBookings(
  db: Executor,
  accountId: string,
  period: { from: string; to: string } | null,
): { bookings: StatementPurchaseBooking[]; omitted: number } {
  if (!period) return { bookings: [], omitted: 0 };
  const rows = db
    .select({
      id: booking.id,
      date: booking.date,
      amountCents: booking.amountCents,
      currency: booking.currency,
      description: sql<string>`coalesce(nullif(${booking.bankRawPayee}, ''), CASE WHEN ${payee.deletedAt} IS NULL THEN ${payee.name} END, ${booking.memo}, '')`,
      mixed: sql<number>`EXISTS (SELECT 1 FROM booking_split bs WHERE bs.booking_id=${booking.id} AND bs.transfer_id IS NOT NULL)`,
    })
    .from(booking)
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(
      and(
        eq(booking.accountId, accountId),
        isNull(booking.deletedAt),
        isNull(booking.transferId),
        sql`${booking.date} >= ${period.from} AND ${booking.date} <= ${period.to}`,
      ),
    )
    .orderBy(booking.date, booking.id)
    .all();
  return {
    bookings: rows
      .filter((r) => !r.mixed && r.currency === 'EUR')
      .map(({ id, date, amountCents, description }) => ({ id, date, amountCents, description })),
    omitted: rows.filter((r) => r.mixed || r.currency !== 'EUR').length,
  };
}
