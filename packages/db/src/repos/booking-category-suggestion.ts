import { and, desc, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import { booking, bookingSplit, category, payee } from '../schema';
import type { Executor } from './types';

export interface BookingCategorySuggestion {
  categoryId: string;
  categoryName: string;
  basis: string;
}

const WINDOW_DAYS = 365;
/** Kinds a person never picks by hand for an ordinary bank booking. */
const NOT_SUGGESTED = new Set(['card_payment', 'advance']);

/**
 * Category proposal for a payee: its default category, else the most frequent category of its
 * single-split bookings of the last 12 months (tie: the most recent). Read-only.
 */
export function suggestedBookingCategory(
  db: Executor,
  payeeId: string,
  amountCents: number,
  today: string = new Date().toISOString().slice(0, 10),
): BookingCategorySuggestion | null {
  const usable = (c: typeof category.$inferSelect | undefined) =>
    !!c &&
    c.hiddenAt === null &&
    c.deletedAt === null &&
    !NOT_SUGGESTED.has(c.kind) &&
    !(amountCents < 0 && c.kind === 'income');
  const owner = db.select().from(payee).where(eq(payee.id, payeeId)).get();
  if (owner?.defaultCategoryId) {
    const c = db.select().from(category).where(eq(category.id, owner.defaultCategoryId)).get();
    if (c && usable(c))
      return { categoryId: c.id, categoryName: c.name, basis: 'Standardkategorie' };
  }
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const rows = db
    .select({
      bookingId: booking.id,
      date: booking.date,
      categoryId: bookingSplit.categoryId,
    })
    .from(booking)
    .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .where(
      and(
        eq(booking.payeeId, payeeId),
        isNull(booking.deletedAt),
        ne(booking.status, 'pending'),
        isNull(booking.transferId),
        gte(booking.date, since),
        sql`(SELECT COUNT(*) FROM ${bookingSplit} s WHERE s.booking_id = ${booking.id}) = 1`,
        sql`${bookingSplit.categoryId} IS NOT NULL`,
        isNull(bookingSplit.transferId),
      ),
    )
    .orderBy(desc(booking.date))
    .all();
  const stats = new Map<string, { n: number; latest: string }>();
  for (const r of rows) {
    const s = stats.get(r.categoryId!) ?? { n: 0, latest: r.date };
    s.n += 1;
    if (r.date > s.latest) s.latest = r.date;
    stats.set(r.categoryId!, s);
  }
  const ranked = [...stats].sort(
    (a, b) => b[1].n - a[1].n || b[1].latest.localeCompare(a[1].latest),
  );
  for (const [id, s] of ranked) {
    const c = db.select().from(category).where(eq(category.id, id)).get();
    if (!c || !usable(c)) continue;
    return {
      categoryId: c.id,
      categoryName: c.name,
      basis: `häufigste Kategorie (${s.n} von ${rows.length} Buchungen, 12 Monate)`,
    };
  }
  return null;
}
