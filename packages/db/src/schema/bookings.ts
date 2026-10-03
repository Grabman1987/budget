import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { account, contact } from './accounts';
import { category, incomeType, payee } from './budget';
import { cents, id, isoDay, nowSql, oneOf, timestamps } from './common';
import { importRun } from './imports';

/**
 * Booking status. YNAB's `Cleared` column maps 1:1: `Uncleared` → `pending` (vorgemerkt, also
 * future-dated scheduled bookings), `Cleared` → `confirmed` (bestätigt), `Reconciled` →
 * `reconciled` (geprüft, part of a Kontoprüfung).
 */
export const BOOKING_STATUSES = ['pending', 'confirmed', 'reconciled'] as const;
export const BOOKING_SOURCES = ['manual', 'bank', 'import', 'migration', 'system'] as const;
/** Colour flag of a booking (YNAB flags); purely a marker, no effect on any figure. */
export const BOOKING_FLAGS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;

/** Side projects (income and costs per project). */
export const project = sqliteTable('project', {
  id: id(),
  name: text('name').notNull(),
  note: text('note'),
  ...timestamps(),
});

/**
 * A transfer (Umbuchung) has exactly two legs with opposite amounts (checked in the repository).
 * A leg is a whole booking (`booking.transfer_id`) or one split of a booking
 * (`booking_split.transfer_id`), e.g. part of a salary moved straight to savings.
 */
export const transfer = sqliteTable('transfer', {
  id: id(),
  createdAt: text('created_at').notNull().default(nowSql),
});

/** Immutable receipt blobs on the volume; legacy storage references remain readable. */
export const receipt = sqliteTable('receipt', {
  id: id(),
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256'),
  originalFilename: text('original_filename'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(nowSql),
  deletedAt: text('deleted_at'),
});

/** Booking-level links survive split edits; unlinking is soft deletion with audit/undo. */
export const bookingReceipt = sqliteTable(
  'booking_receipt',
  {
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => receipt.id),
    createdAt: text('created_at').notNull().default(nowSql),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.receiptId] }),
    index('booking_receipt_receipt_idx').on(t.receiptId),
  ],
);

/**
 * Booking on one account. `amount_cents` is signed (outflow negative) in the account currency.
 * Foreign currency: `original_amount_cents` (signed like `amount_cents`) in `original_currency`,
 * the ECB rate of the booking date (`fx_rate_micro`, EUR per unit) and the bank deviation as
 * `fx_fee_cents` (signed, negative = cost): amount = round(original × rate) + fee. The four fields
 * are all set or all NULL. The sum of the splits equals `amount_cents` (repository invariant).
 * Future dates are allowed (scheduled, usually `pending`); balances "as of" a day ignore them.
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
    flag: text('flag', { enum: BOOKING_FLAGS }),
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
    importRunId: text('import_run_id').references(() => importRun.id),
    ...timestamps(),
  },
  (t) => [
    oneOf('booking_status_chk', t.status, BOOKING_STATUSES),
    oneOf('booking_source_chk', t.source, BOOKING_SOURCES),
    oneOf('booking_flag_chk', t.flag, BOOKING_FLAGS),
    isoDay('booking_date_chk', t.date),
    check(
      'booking_fx_all_or_none_chk',
      sql`(${t.originalAmountCents} IS NULL) = (${t.originalCurrency} IS NULL)
        AND (${t.originalCurrency} IS NULL) = (${t.fxRateMicro} IS NULL)
        AND (${t.fxRateMicro} IS NULL) = (${t.fxFeeCents} IS NULL)`,
    ),
    check(
      'booking_fx_values_chk',
      sql`${t.originalAmountCents} IS NULL OR (
        ${t.fxRateMicro} > 0
        AND ${t.originalCurrency} <> ${t.currency}
        AND (${t.originalAmountCents} > 0) = (${t.amountCents} > 0)
        AND (${t.originalAmountCents} < 0) = (${t.amountCents} < 0))`,
    ),
    index('booking_account_date_idx').on(t.accountId, t.date),
    index('booking_date_idx').on(t.date),
    index('booking_transfer_idx').on(t.transferId),
    index('booking_payee_idx').on(t.payeeId),
    index('booking_project_idx').on(t.projectId),
    index('booking_import_run_idx').on(t.importRunId),
    uniqueIndex('booking_import_key_uq')
      .on(t.accountId, t.importKey)
      .where(sql`${t.importKey} IS NOT NULL`),
  ],
);

/**
 * Part of a booking (Anteil). What a split means:
 * - `category_id` set: activity of that envelope; NULL on an inflow means "Zu verteilen";
 * - `income_type_id`: the income type of an inflow (Gehalt, Sonderzahlung, …), with or without
 *   an income category;
 * - `contact_id`: a receivable share (concept §3.4): the amount was paid for (outflow, "Auslage")
 *   or repaid by (inflow, "Ausgleich") that contact. It runs through the "Auslagen" envelope
 *   (category kind `advance`) and changes the contact's receivable. It is NOT the counterparty of
 *   a salary or contribution; that is the payee (and its contact);
 * - `transfer_id`: this split is one leg of a transfer; the other leg is a booking with the same
 *   `transfer_id` and the opposite amount.
 */
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
    incomeTypeId: text('income_type_id').references(() => incomeType.id),
    transferId: text('transfer_id').references(() => transfer.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    check('split_contact_or_transfer_chk', sql`${t.contactId} IS NULL OR ${t.transferId} IS NULL`),
    check(
      'split_income_type_chk',
      sql`${t.incomeTypeId} IS NULL OR (${t.contactId} IS NULL AND ${t.transferId} IS NULL)`,
    ),
    index('split_booking_idx').on(t.bookingId),
    index('split_category_idx').on(t.categoryId),
    index('split_contact_idx').on(t.contactId),
    index('split_transfer_idx').on(t.transferId),
  ],
);

/** Receipt ↔ split (n:m): one receipt can prove several splits, a split can have several receipts. */
export const receiptSplit = sqliteTable(
  'receipt_split',
  {
    receiptId: text('receipt_id')
      .notNull()
      .references(() => receipt.id),
    splitId: text('split_id')
      .notNull()
      .references(() => bookingSplit.id),
  },
  (t) => [
    primaryKey({ columns: [t.receiptId, t.splitId] }),
    index('receipt_split_split_idx').on(t.splitId),
  ],
);

/**
 * Kontoprüfung ("Kontostand prüfen"): on `date` the bank said `statement_balance_cents`; the
 * app's cleared balance was `cleared_balance_cents`. A difference is booked as an adjustment with
 * the system payee `reconciliation_adjustment` (`adjustment_booking_id`); the bookings up to the
 * date then become `reconciled`.
 */
export const accountReconciliation = sqliteTable(
  'account_reconciliation',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    date: text('date').notNull(),
    statementBalanceCents: cents('statement_balance_cents').notNull(),
    clearedBalanceCents: cents('cleared_balance_cents').notNull(),
    adjustmentBookingId: text('adjustment_booking_id').references(() => booking.id),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    isoDay('reconciliation_date_chk', t.date),
    index('reconciliation_account_date_idx').on(t.accountId, t.date),
  ],
);
