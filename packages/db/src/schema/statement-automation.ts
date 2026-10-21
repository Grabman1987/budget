import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { account } from './accounts';
import { booking, receipt } from './bookings';
import { statementIntake } from './statement-intake';
import { id, nowSql, timestamps } from './common';

export const statementAutomationConfig = sqliteTable('statement_automation_config', {
  accountId: text('account_id').primaryKey().references(() => account.id),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  mappedCardsJson: text('mapped_cards_json').notNull(),
  scheduledPaymentJson: text('scheduled_payment_json').notNull().default('null'),
  ...timestamps(),
}, (t) => [
  check('statement_auto_enabled_chk', sql`${t.enabled} IN (0,1)`),
  check('statement_auto_mapping_chk', sql`json_valid(${t.mappedCardsJson}) AND length(${t.mappedCardsJson})<=16384`),
]);

/** Delivery journal survives financial Undo: a retry must never silently repost an undone import. */
export const statementAutomationRun = sqliteTable('statement_automation_run', {
  id: id(),
  key: text('key').notNull().unique(),
  sourceIntakeId: text('source_intake_id').notNull().references(() => statementIntake.id),
  sourceSha256: text('source_sha256').notNull(),
  sourceRevision: text('source_revision').notNull(),
  accountId: text('account_id').notNull().references(() => account.id),
  identityKey: text('identity_key').notNull(),
  issueDate: text('issue_date').notNull(),
  configRevision: text('config_revision').notNull(),
  planHash: text('plan_hash').notNull(),
  sourceProofJson: text('source_proof_json').notNull(),
  resultJson: text('result_json').notNull(),
  actionGroupId: text('action_group_id'),
  createdAt: text('created_at').notNull().default(nowSql),
});

/** Audited financial association, separate from the durable delivery journal. */
export const statementAutomationRow = sqliteTable('statement_automation_row', {
  id: id(),
  runId: text('run_id').notNull().references(() => statementAutomationRun.id),
  sourceIntakeId: text('source_intake_id').notNull().references(() => statementIntake.id),
  sourceSha256: text('source_sha256').notNull(),
  rowKey: text('row_key').notNull(),
  accountId: text('account_id').notNull().references(() => account.id),
  receiptId: text('receipt_id').notNull().references(() => receipt.id),
  bookingId: text('booking_id').notNull().references(() => booking.id),
  originalBookingId: text('original_booking_id').references(() => booking.id),
  kind: text('kind', { enum: ['created', 'linked', 'rebate'] }).notNull(),
  proofJson: text('proof_json').notNull(),
  actionGroupId: text('action_group_id').notNull(),
  ...timestamps(),
}, (t) => [
  uniqueIndex('statement_auto_source_row_uq').on(t.sourceSha256, t.rowKey).where(sql`${t.deletedAt} IS NULL`),
  check('statement_auto_row_kind_chk', sql`${t.kind} IN ('created','linked','rebate')`),
  check('statement_auto_proof_chk', sql`json_valid(${t.proofJson}) AND length(CAST(${t.proofJson} AS BLOB))<=65536`),
]);
