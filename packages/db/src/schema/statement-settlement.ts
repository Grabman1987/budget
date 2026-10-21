import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { account } from './accounts';
import { booking, receipt, transfer } from './bookings';
import { expectedPayment } from './budget';
import { statementIntake } from './statement-intake';
import { id, isoDay, nowSql, oneOf, timestamps } from './common';

export const statementSettlementConfig = sqliteTable(
  'statement_settlement_config',
  {
    cardAccountId: text('card_account_id')
      .primaryKey()
      .references(() => account.id),
    fundingAccountId: text('funding_account_id')
      .notNull()
      .references(() => account.id),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    ...timestamps(),
  },
  (t) => [
    check('statement_config_distinct_chk', sql`${t.cardAccountId} != ${t.fundingAccountId}`),
    check('statement_config_enabled_chk', sql`${t.enabled} IN (0,1)`),
  ],
);
const acceptedSource = () => ({
  id: id(),
  sourceIntakeId: text('source_intake_id')
    .notNull()
    .references(() => statementIntake.id),
  receiptId: text('receipt_id')
    .notNull()
    .references(() => receipt.id),
  sourceSha256: text('source_sha256').notNull(),
  sourceRevision: text('source_revision').notNull(),
  cardAccountId: text('card_account_id')
    .notNull()
    .references(() => account.id),
  reference: text('reference').notNull(),
  issueDate: text('issue_date').notNull(),
  currency: text('currency').notNull(),
  originsJson: text('origins_json').notNull(),
  representationKind: text('representation_kind', { enum: ['created', 'linked'] }),
  actionGroupId: text('action_group_id'),
  ...timestamps(),
});
export const statementSettlement = sqliteTable(
  'statement_settlement',
  {
    ...acceptedSource(),
    fundingAccountId: text('funding_account_id')
      .notNull()
      .references(() => account.id),
    debitDate: text('debit_date').notNull(),
    payableCents: integer('payable_cents').notNull(),
    state: text('state', {
      enum: ['open', 'represented', 'zero', 'credit_manual', 'withdrawn', 'superseded'],
    }).notNull(),
    supersedesId: text('supersedes_id').references((): AnySQLiteColumn => statementSettlement.id),
    legacyPaymentId: text('legacy_payment_id').references(() => expectedPayment.id),
    legacyDueDate: text('legacy_due_date'),
    transferId: text('transfer_id').references(() => transfer.id),
    fromBookingId: text('from_booking_id').references(() => booking.id),
    toBookingId: text('to_booking_id').references(() => booking.id),
  },
  (t) => [
    oneOf('statement_settlement_state_chk', t.state, [
      'open',
      'represented',
      'zero',
      'credit_manual',
      'withdrawn',
      'superseded',
    ]),
    check(
      'statement_settlement_cents_chk',
      sql`typeof(${t.payableCents})='integer' AND abs(${t.payableCents})<=9007199254740991`,
    ),
    check(
      'statement_settlement_amount_state_chk',
      sql`(${t.state} IN ('open','represented') AND ${t.payableCents}>0) OR (${t.state}='zero' AND ${t.payableCents}=0) OR (${t.state}='credit_manual' AND ${t.payableCents}<0) OR ${t.state} IN ('withdrawn','superseded')`,
    ),
    check(
      'statement_settlement_representation_chk',
      sql`(${t.state}='represented' AND ${t.representationKind} IS NOT NULL AND ${t.representationKind} IN ('created','linked') AND ${t.transferId} IS NOT NULL AND ${t.fromBookingId} IS NOT NULL AND ${t.toBookingId} IS NOT NULL AND ${t.fromBookingId}!=${t.toBookingId} AND ${t.actionGroupId} IS NOT NULL) OR (${t.state}!='represented' AND ${t.representationKind} IS NULL AND ${t.transferId} IS NULL AND ${t.fromBookingId} IS NULL AND ${t.toBookingId} IS NULL AND ${t.actionGroupId} IS NULL)`,
    ),
    check(
      'statement_settlement_legacy_chk',
      sql`(${t.legacyPaymentId} IS NULL)=(${t.legacyDueDate} IS NULL)`,
    ),
    isoDay('statement_settlement_debit_chk', t.debitDate),
    isoDay('statement_settlement_issue_chk', t.issueDate),
    uniqueIndex('statement_settlement_source_uq')
      .on(t.sourceIntakeId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.state} NOT IN ('withdrawn','superseded')`),
    uniqueIndex('statement_settlement_identity_uq')
      .on(t.cardAccountId, t.reference, t.issueDate)
      .where(sql`${t.deletedAt} IS NULL AND ${t.state} NOT IN ('withdrawn','superseded')`),
    uniqueIndex('statement_settlement_transfer_uq')
      .on(t.transferId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.state}='represented'`),
    uniqueIndex('statement_settlement_legacy_uq')
      .on(t.legacyPaymentId, t.legacyDueDate)
      .where(sql`${t.deletedAt} IS NULL AND ${t.state} NOT IN ('withdrawn','superseded')`),
  ],
);
export const statementBonus = sqliteTable(
  'statement_bonus',
  {
    ...acceptedSource(),
    bonusCents: integer('bonus_cents').notNull(),
    creditDate: text('credit_date').notNull(),
    state: text('state', {
      enum: ['ready', 'represented', 'already_net', 'withdrawn', 'superseded'],
    }).notNull(),
    evidenceJson: text('evidence_json').notNull(),
    supersedesId: text('supersedes_id').references((): AnySQLiteColumn => statementBonus.id),
    bookingId: text('booking_id').references(() => booking.id),
  },
  (t) => [
    oneOf('statement_bonus_state_chk', t.state, [
      'ready',
      'represented',
      'already_net',
      'withdrawn',
      'superseded',
    ]),
    check(
      'statement_bonus_cents_chk',
      sql`typeof(${t.bonusCents})='integer' AND ${t.bonusCents}>0 AND ${t.bonusCents}<=9007199254740991`,
    ),
    check(
      'statement_bonus_evidence_chk',
      sql`json_valid(${t.evidenceJson}) AND length(CAST(${t.evidenceJson} AS BLOB))<=65536`,
    ),
    check(
      'statement_bonus_representation_chk',
      sql`(${t.state}='represented' AND ${t.representationKind} IS NOT NULL AND ${t.representationKind} IN ('created','linked') AND ${t.bookingId} IS NOT NULL AND ${t.actionGroupId} IS NOT NULL) OR (${t.state}!='represented' AND ${t.representationKind} IS NULL AND ${t.bookingId} IS NULL AND ${t.actionGroupId} IS NULL)`,
    ),
    isoDay('statement_bonus_credit_chk', t.creditDate),
    isoDay('statement_bonus_issue_chk', t.issueDate),
    uniqueIndex('statement_bonus_source_uq')
      .on(t.sourceIntakeId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.state} NOT IN ('withdrawn','superseded')`),
    uniqueIndex('statement_bonus_identity_uq')
      .on(t.cardAccountId, t.reference, t.issueDate)
      .where(sql`${t.deletedAt} IS NULL AND ${t.state} NOT IN ('withdrawn','superseded')`),
    uniqueIndex('statement_bonus_booking_uq')
      .on(t.bookingId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.state}='represented'`),
  ],
);
/** Operational replay receipts deliberately do not participate in financial Undo. */
export const statementSettlementDelivery = sqliteTable(
  'statement_settlement_delivery',
  {
    key: text('key').primaryKey(),
    operation: text('operation').notNull(),
    requestHash: text('request_hash').notNull(),
    responseJson: text('response_json').notNull(),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [
    check(
      'statement_delivery_json_chk',
      sql`json_valid(${t.responseJson}) AND length(CAST(${t.responseJson} AS BLOB))<=65536`,
    ),
  ],
);
