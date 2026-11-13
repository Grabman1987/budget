import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { contact } from './accounts';
import { receipt } from './bookings';
import { cents, id, isoMonth, oneOf, timestamps } from './common';
import { payslip } from './system';

/**
 * Salary development (#1066). Additive beside `payslip`/`payslip_line`, which keep their meaning:
 * `payslip_line` feeds the legacy totals (`payrollTotals` adds its `earning` lines to the gross and
 * `savePayslip` replaces all of them on every edit), so the full wage lines live in their own table
 * and never change a stored header, line, booking or receipt.
 */
export const WAGE_LINE_SECTIONS = [
  'earning',
  'benefit_in_kind',
  'reimbursement',
  'deduction',
  'tax_adjustment',
  'sv_adjustment',
  'memo',
  'unknown',
] as const;
export const WAGE_READ_ORIGINS = ['intake', 'reread'] as const;
/** `skipped`: the lines could not be stored; the reading records why and a re-read may replace it. */
export const WAGE_LINE_CHECKS = ['ok', 'gross_mismatch', 'no_gross', 'skipped'] as const;
export const SALARY_COMPONENTS = [
  'base',
  'special',
  'variable',
  'benefit_in_kind',
  'reimbursement',
] as const;

/**
 * One reading of a payslip's source document: parser version, the invariant result and the
 * statutory deductions split into current and special-payment parts (their sums are the header's
 * `sv_cents`/`tax_cents`, which stay the totals). At most one live reading per payslip.
 */
export const payslipWageRead = sqliteTable(
  'payslip_wage_read',
  {
    id: id(),
    payslipId: text('payslip_id')
      .notNull()
      .references(() => payslip.id),
    receiptId: text('receipt_id').references(() => receipt.id),
    origin: text('origin', { enum: WAGE_READ_ORIGINS }).notNull(),
    parserVersion: integer('parser_version').notNull(),
    lineCheck: text('line_check', { enum: WAGE_LINE_CHECKS }).notNull(),
    /** JSON array of normalisation or skip reasons (e.g. `label_truncated`); null when none. */
    issues: text('issues'),
    svCurrentCents: cents('sv_current_cents'),
    svSpecialCents: cents('sv_special_cents'),
    taxCurrentCents: cents('tax_current_cents'),
    taxOtherCents: cents('tax_other_cents'),
    ...timestamps(),
  },
  (t) => [
    oneOf('payslip_wage_read_origin_chk', t.origin, WAGE_READ_ORIGINS),
    oneOf('payslip_wage_read_check_chk', t.lineCheck, WAGE_LINE_CHECKS),
    check(
      'payslip_wage_read_split_chk',
      sql`(${t.svCurrentCents} IS NULL) = (${t.svSpecialCents} IS NULL) AND (${t.svCurrentCents} IS NULL) = (${t.taxCurrentCents} IS NULL) AND (${t.svCurrentCents} IS NULL) = (${t.taxOtherCents} IS NULL)`,
    ),
    uniqueIndex('payslip_wage_read_payslip_active_uq')
      .on(t.payslipId)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/**
 * Every printed wage line of one reading. `amount_cents` is the signed effect on the payout
 * (memo/unknown: the printed value); `quantity_text`/`rate_text` are printed texts, not numbers.
 */
export const payslipWageLine = sqliteTable(
  'payslip_wage_line',
  {
    id: id(),
    readId: text('read_id')
      .notNull()
      .references(() => payslipWageRead.id),
    payslipId: text('payslip_id')
      .notNull()
      .references(() => payslip.id),
    lineOrder: integer('line_order').notNull(),
    wageCode: text('wage_code'),
    label: text('label').notNull(),
    section: text('section', { enum: WAGE_LINE_SECTIONS }).notNull(),
    referenceMonth: text('reference_month'),
    quantityText: text('quantity_text'),
    rateText: text('rate_text'),
    amountCents: cents('amount_cents').notNull(),
    ...timestamps(),
  },
  (t) => [
    oneOf('payslip_wage_line_section_chk', t.section, WAGE_LINE_SECTIONS),
    isoMonth('payslip_wage_line_month_chk', t.referenceMonth),
    check('payslip_wage_line_order_chk', sql`${t.lineOrder} >= 0`),
    check('payslip_wage_line_label_chk', sql`length(${t.label}) BETWEEN 1 AND 160`),
    uniqueIndex('payslip_wage_line_order_active_uq')
      .on(t.readId, t.lineOrder)
      .where(sql`${t.deletedAt} IS NULL`),
    index('payslip_wage_line_payslip_idx').on(t.payslipId),
  ],
);

/**
 * Owner mapping wage type → salary component, separate from the parser's section mapping
 * (`payslip.source` setting). Scope: one employer (contact) or every employer (NULL); key: wage
 * code and/or normalised label. `mapping_key` is the repository-built identity
 * `employer|code|label` (empty parts for NULL), unique among live rows. Audited and undoable.
 */
export const wageComponentMapping = sqliteTable(
  'wage_component_mapping',
  {
    id: id(),
    employerContactId: text('employer_contact_id').references(() => contact.id),
    wageCode: text('wage_code'),
    labelNorm: text('label_norm'),
    mappingKey: text('mapping_key').notNull(),
    component: text('component', { enum: SALARY_COMPONENTS }).notNull(),
    ...timestamps(),
  },
  (t) => [
    oneOf('wage_component_mapping_component_chk', t.component, SALARY_COMPONENTS),
    check(
      'wage_component_mapping_key_chk',
      sql`${t.wageCode} IS NOT NULL OR ${t.labelNorm} IS NOT NULL`,
    ),
    check(
      'wage_component_mapping_identity_chk',
      sql`${t.mappingKey} = coalesce(${t.employerContactId}, '') || '|' || coalesce(${t.wageCode}, '') || '|' || coalesce(${t.labelNorm}, '')`,
    ),
    uniqueIndex('wage_component_mapping_active_uq')
      .on(t.mappingKey)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);
