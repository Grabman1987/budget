import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { account, contact, institution } from './accounts';
import { booking, receipt } from './bookings';
import { category, payee } from './budget';
import { cents, id, isoMonth, nowSql, oneOf, timestamps } from './common';

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'restore', 'undo'] as const;
export const RESULT_STATUSES = ['ok', 'warn', 'bad'] as const;
export const INBOX_KINDS = [
  'uncategorized',
  'revision',
  'import',
  'stale_value',
  'consent',
  'overspent',
  'expected_payment',
  'receivable',
  'reconciliation',
  'backup',
  'other',
] as const;
export const PAYSLIP_KINDS = ['regular', 'special'] as const;
export const PAYSLIP_SECTIONS = ['earning', 'deduction'] as const;

/**
 * Change log. `before_json` / `after_json` hold row snapshots; `undo` replays them. `group_id`
 * ties the entries of one user action together (a booking with its splits, a transfer pair).
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    ts: text('ts').notNull().default(nowSql),
    actor: text('actor').notNull().default('system'),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    groupId: text('group_id'),
    /** Set on `undo` entries: the audit entry that was reverted. */
    undoOfId: text('undo_of_id'),
  },
  (t) => [
    oneOf('audit_action_chk', t.action, AUDIT_ACTIONS),
    index('audit_entity_idx').on(t.entityType, t.entityId),
    index('audit_group_idx').on(t.groupId),
    index('audit_ts_idx').on(t.ts),
  ],
);

/** Rules R01–R16 as data: thresholds in `params_json`, status per evaluation in `rule_result`. */
export const rule = sqliteTable(
  'rule',
  {
    id: id(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    /** Net-worth stage the rule belongs to (1 Fundament, 2 Aufbau, 3 Freiheit). */
    stage: integer('stage'),
    goal: text('goal'),
    paramsJson: text('params_json'),
    action: text('action'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    ...timestamps(),
  },
  (t) => [check('rule_stage_chk', sql`${t.stage} BETWEEN 1 AND 3`)],
);

export const ruleResult = sqliteTable(
  'rule_result',
  {
    id: id(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => rule.id),
    asOf: text('as_of').notNull(),
    status: text('status', { enum: RESULT_STATUSES }).notNull(),
    valueText: text('value_text'),
    detailJson: text('detail_json'),
    actionNeeded: integer('action_needed', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    oneOf('rule_result_status_chk', t.status, RESULT_STATUSES),
    index('rule_result_idx').on(t.ruleId, t.asOf),
  ],
);

export const inboxItem = sqliteTable(
  'inbox_item',
  {
    id: id(),
    kind: text('kind', { enum: INBOX_KINDS }).notNull(),
    title: text('title').notNull(),
    detail: text('detail'),
    refType: text('ref_type'),
    refId: text('ref_id'),
    urgent: integer('urgent', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(nowSql),
    resolvedAt: text('resolved_at'),
    resolution: text('resolution'),
  },
  (t) => [oneOf('inbox_kind_chk', t.kind, INBOX_KINDS), index('inbox_open_idx').on(t.resolvedAt)],
);

/** Assignment rule (Zuordnungsregel): matches imported rows and proposes payee and category. */
export const assignmentRule = sqliteTable('assignment_rule', {
  id: id(),
  name: text('name').notNull(),
  matchJson: text('match_json').notNull(),
  payeeId: text('payee_id').references(() => payee.id),
  categoryId: text('category_id').references(() => category.id),
  priority: integer('priority').notNull().default(0),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps(),
});

/** Bank connection (P4). No secrets are stored here, only status and consent expiry. */
export const bankConnection = sqliteTable('bank_connection', {
  id: id(),
  institutionId: text('institution_id').references(() => institution.id),
  accountId: text('account_id').references(() => account.id),
  provider: text('provider').notNull(),
  status: text('status').notNull().default('active'),
  consentUntil: text('consent_until'),
  lastSyncAt: text('last_sync_at'),
  ...timestamps(),
});

/**
 * Payslip (Gehaltszettel) with its lines (Bezüge, Abzüge). `employer_contact_id` is the employer
 * (a contact), `booking_id` the salary booking the net amount arrived with.
 */
export const payslip = sqliteTable(
  'payslip',
  {
    id: id(),
    month: text('month').notNull(),
    kind: text('kind', { enum: PAYSLIP_KINDS }).notNull().default('regular'),
    grossCents: cents('gross_cents').notNull(),
    netCents: cents('net_cents').notNull(),
    employerContactId: text('employer_contact_id').references(() => contact.id),
    bookingId: text('booking_id').references(() => booking.id),
    receiptId: text('receipt_id').references(() => receipt.id),
    ...timestamps(),
  },
  (t) => [
    oneOf('payslip_kind_chk', t.kind, PAYSLIP_KINDS),
    isoMonth('payslip_month_chk', t.month),
    index('payslip_booking_idx').on(t.bookingId),
  ],
);

export const payslipLine = sqliteTable(
  'payslip_line',
  {
    id: id(),
    payslipId: text('payslip_id')
      .notNull()
      .references(() => payslip.id),
    section: text('section', { enum: PAYSLIP_SECTIONS }).notNull(),
    label: text('label').notNull(),
    amountCents: cents('amount_cents').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [oneOf('payslip_section_chk', t.section, PAYSLIP_SECTIONS)],
);
