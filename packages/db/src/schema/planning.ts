import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { expectedPayment } from './budget';
import { booking } from './bookings';
import { cents, id, isoDay, oneOf, timestamps } from './common';

/**
 * Status of an occurrence (concept §3.3): erwartet, eingegangen, abweichend, ausgefallen (a
 * warning: it should have come), gestrichen (`skipped`: a deliberate plan change, no warning).
 */
export const OCCURRENCE_STATUSES = [
  'expected',
  'received',
  'deviating',
  'missed',
  'skipped',
] as const;

/**
 * Occurrence (Vorkommen) of an expected payment: computed ahead (12 months) from the versions,
 * then matched to a booking within the payment's amount tolerance and date window.
 * `contact_share_cents` is the part paid on behalf of the payment's contact (receivable).
 */
export const expectedOccurrence = sqliteTable(
  'expected_occurrence',
  {
    id: id(),
    expectedPaymentId: text('expected_payment_id')
      .notNull()
      .references(() => expectedPayment.id),
    dueDate: text('due_date').notNull(),
    expectedAmountCents: cents('expected_amount_cents').notNull(),
    contactShareCents: cents('contact_share_cents').notNull().default(0),
    status: text('status', { enum: OCCURRENCE_STATUSES }).notNull().default('expected'),
    bookingId: text('booking_id').references(() => booking.id),
    ...timestamps(),
  },
  (t) => [
    oneOf('occurrence_status_chk', t.status, OCCURRENCE_STATUSES),
    isoDay('occurrence_due_date_chk', t.dueDate),
    check(
      'occurrence_booking_chk',
      sql`(${t.status} IN ('received', 'deviating')) = (${t.bookingId} IS NOT NULL)`,
    ),
    uniqueIndex('occurrence_uq').on(t.expectedPaymentId, t.dueDate),
    index('occurrence_booking_idx').on(t.bookingId),
    // A booking belongs to at most one live occurrence.
    uniqueIndex('occurrence_booking_uq')
      .on(t.bookingId)
      .where(sql`${t.bookingId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
  ],
);

/** Forecast-only zero-income interval for one recurring expected payment. */
export const incomePause = sqliteTable(
  'income_pause',
  {
    id: id(),
    expectedPaymentId: text('expected_payment_id')
      .notNull()
      .references(() => expectedPayment.id),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    ...timestamps(),
  },
  (t) => [
    isoDay('income_pause_start_date_chk', t.startDate),
    isoDay('income_pause_end_date_chk', t.endDate),
    check('income_pause_range_chk', sql`${t.startDate} <= ${t.endDate}`),
    index('income_pause_source_idx').on(t.expectedPaymentId, t.startDate, t.endDate),
  ],
);
