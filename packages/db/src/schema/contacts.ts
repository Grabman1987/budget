import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { contact } from './accounts';
import { booking } from './bookings';
import { cents, id, timestamps } from './common';

export const contactSettlement = sqliteTable(
  'contact_settlement',
  {
    id: id(),
    contactId: text('contact_id')
      .notNull()
      .references(() => contact.id),
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id),
    receiptSplitId: text('receipt_split_id').notNull(),
    creditCents: cents('credit_cents').notNull(),
    ...timestamps(),
  },
  (t) => [
    check('contact_credit_chk', sql`${t.creditCents} >= 0`),
    index('contact_settlement_booking_idx').on(t.bookingId),
  ],
);

/** Text split references retain audit history after generic split replacements; validated in repos. */
export const contactAllocation = sqliteTable(
  'contact_allocation',
  {
    id: id(),
    settlementId: text('settlement_id')
      .notNull()
      .references(() => contactSettlement.id),
    outlaySplitId: text('outlay_split_id').notNull(),
    amountCents: cents('amount_cents').notNull(),
    ...timestamps(),
  },
  (t) => [
    check('contact_allocation_amount_chk', sql`${t.amountCents} > 0`),
    index('contact_allocation_settlement_idx').on(t.settlementId),
  ],
);
