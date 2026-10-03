import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { receipt } from './bookings';
import { payslip } from './system';
import { id, oneOf, timestamps } from './common';

/** Durable intake identity remains after rejection; no PDF password or extracted text. */
export const payslipIntake = sqliteTable(
  'payslip_intake',
  {
    id: id(),
    sha256: text('sha256').notNull(),
    contentHash: text('content_hash'),
    source: text('source', { enum: ['manual', 'dropbox'] }).notNull(),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => receipt.id),
    parsedJson: text('parsed_json').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'rejected'] })
      .notNull()
      .default('pending'),
    payslipId: text('payslip_id').references(() => payslip.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('payslip_intake_sha256_uq').on(t.sha256),
    uniqueIndex('payslip_intake_content_uq').on(t.contentHash),
    oneOf('payslip_intake_status_chk', t.status, ['pending', 'confirmed', 'rejected']),
    oneOf('payslip_intake_source_chk', t.source, ['manual', 'dropbox']),
  ],
);

/** Operational cursor/schedule only; secrets live in the environment or `payslip_secret`. */
export const payslipScan = sqliteTable('payslip_scan', {
  id: text('id').primaryKey().notNull(),
  root: text('root').notNull(),
  cursor: text('cursor'),
  lastScanAt: text('last_scan_at'),
  nextRunAt: text('next_run_at').notNull(),
  filesFound: integer('files_found').notNull().default(0),
  errors: integer('errors').notNull().default(0),
  errorCode: text('error_code'),
});

/**
 * Owner-remembered PDF password as AES-256-GCM ciphertext only (key derived from BUDGET_PEPPER by
 * the server). Written without row snapshots so neither plaintext nor ciphertext enters the audit
 * log; each change is recorded by a value-free audit entry instead.
 */
export const payslipSecret = sqliteTable('payslip_secret', {
  id: text('id').primaryKey().notNull(),
  ciphertext: text('ciphertext').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
