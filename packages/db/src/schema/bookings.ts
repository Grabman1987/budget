import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { account, contact } from './accounts';
import { category, payee } from './budget';
import { cents, id, nowSql, oneOf, timestamps } from './common';

export const BOOKING_STATUSES = ['pending', 'confirmed', 'reconciled'] as const;
export const BOOKING_SOURCES = ['manual', 'bank', 'import', 'migration', 'system'] as const;

/** Side projects (income and costs per project). */
export const project = sqliteTable('project', {
  id: id(),
  name: text('name').notNull(),
  note: text('note'),
  ...timestamps(),
});

/** A transfer (Umbuchung) is exactly two bookings that share a `transfer_id` (checked in the repository). */
export const transfer = sqliteTable('transfer', {
  id: id(),
  createdAt: text('created_at').notNull().default(nowSql),
});

/** Receipts live in object storage; the row is the reference. */
export const receipt = sqliteTable('receipt', {
  id: id(),
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  bookingId: text('booking_id'),
  createdAt: text('created_at').notNull().default(nowSql),
  deletedAt: text('deleted_at'),
});

/**
 * Booking on one account. `amount_cents` is signed (outflow negative) in the account currency.
 * Foreign currency keeps the original amount and the ECB rate of the booking date; a bank
 * deviation becomes `fx_fee_cents`. The sum of the splits equals `amount_cents` (repository invariant).
 */
export const booking = sqliteTable(
  'booking',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    date: text('date').notNull(),
    amountCents: cents('amount_cents').notNull(),
    payeeId: text('payee_id').references(() => payee.id),
    memo: text('memo'),
    status: text('status', { enum: BOOKING_STATUSES }).notNull().default('confirmed'),
    transferId: text('transfer_id').references(() => transfer.id),
    currency: text('currency').notNull().default('EUR'),
    originalAmountCents: cents('original_amount_cents'),
    originalCurrency: text('original_currency'),
    /** EUR per one unit of the original currency, in micro-units (0,9350 = 935000). */
    fxRateMicro: integer('fx_rate_micro'),
    fxFeeCents: cents('fx_fee_cents'),
    projectId: text('project_id').references(() => project.id),
    source: text('source', { enum: BOOKING_SOURCES }).notNull().default('manual'),
    /** Idempotency key of imports and bank sync; unique per account, also for soft-deleted rows. */
    importKey: text('import_key'),
    receiptId: text('receipt_id').references(() => receipt.id),
    ...timestamps(),
  },
  (t) => [
    oneOf('booking_status_chk', t.status, BOOKING_STATUSES),
    oneOf('booking_source_chk', t.source, BOOKING_SOURCES),
    index('booking_account_date_idx').on(t.accountId, t.date),
    index('booking_date_idx').on(t.date),
    index('booking_transfer_idx').on(t.transferId),
    index('booking_payee_idx').on(t.payeeId),
    uniqueIndex('booking_import_key_uq')
      .on(t.accountId, t.importKey)
      .where(sql`${t.importKey} IS NOT NULL`),
  ],
);

/** Part of a booking. `category_id` NULL on an inflow means "Zu verteilen". */
export const bookingSplit = sqliteTable(
  'booking_split',
  {
    id: id(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id),
    categoryId: text('category_id').references(() => category.id),
    amountCents: cents('amount_cents').notNull(),
    memo: text('memo'),
    contactId: text('contact_id').references(() => contact.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('split_booking_idx').on(t.bookingId), index('split_category_idx').on(t.categoryId)],
);
