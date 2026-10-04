import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { cents, id, isoDay, oneOf, timestamps } from './common';

/** Interest of a loan: fixed for the whole term or variable (Fix / Variabel). */
export const INTEREST_KINDS = ['fixed', 'variable'] as const;

export const INSTITUTION_KINDS = ['bank', 'broker', 'platform', 'insurer', 'other'] as const;
/**
 * Account roles group accounts for net worth and reports: Budget-Konto, Rücklage, Anlage, Schuld,
 * Forderung (Kontoblatt of a contact). The role says nothing about the budget: that is `on_budget`.
 */
export const ACCOUNT_ROLES = ['budget', 'reserve', 'investment', 'debt', 'receivable'] as const;
/**
 * Account types (concept §5.1): Giro, Bargeld, Tagesgeld, Kreditkarte, Kredit, Depot, Krypto,
 * P2P, Forderung, Sonstiges Vermögen, Sonstige Verbindlichkeit.
 */
export const ACCOUNT_TYPES = [
  'checking',
  'cash',
  'savings',
  'credit_card',
  'loan',
  'brokerage',
  'crypto',
  'p2p',
  'receivable',
  'other_asset',
  'other_liability',
] as const;
/** Types that can never be on-budget (tracking accounts by nature, concept §3.1). */
export const TRACKING_ONLY_TYPES = ['loan', 'brokerage', 'crypto', 'p2p', 'receivable'] as const;

/** Providers are data, not code: banks, brokers and platforms are institutions. */
export const institution = sqliteTable(
  'institution',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: INSTITUTION_KINDS }).notNull().default('bank'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [oneOf('institution_kind_chk', t.kind, INSTITUTION_KINDS)],
);

/** Partner, friends, employer: contacts without login. A contact can own a receivable account. */
export const contact = sqliteTable('contact', {
  id: id(),
  name: text('name').notNull(),
  note: text('note'),
  ...timestamps(),
});

export const account = sqliteTable(
  'account',
  {
    id: id(),
    name: text('name').notNull(),
    type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
    role: text('role', { enum: ACCOUNT_ROLES }).notNull(),
    /**
     * Budget-Konto (true): its balance is money to distribute, "Zu verteilen" counts it. Tracking
     * account (false): counts only for net worth; a transfer to it needs a category.
     */
    onBudget: integer('on_budget', { mode: 'boolean' }).notNull(),
    institutionId: text('institution_id').references(() => institution.id),
    contactId: text('contact_id').references(() => contact.id),
    /**
     * Verrechnungskonto: the account a depot settles through (its cash account), so a platform
     * (cash account plus securities account) can be grouped. Not a booking rule: money between the
     * two moves by transfers.
     */
    referenceAccountId: text('reference_account_id').references((): AnySQLiteColumn => account.id),
    currency: text('currency').notNull().default('EUR'),
    openingBalanceCents: cents('opening_balance_cents').notNull().default(0),
    /** Balance of the account before its first booking (e.g. 2023-10-01). */
    openingDate: text('opening_date').notNull(),
    /** Terms: limits, rates, term, fees. Rates in basis points (6,32 % = 632). */
    creditLimitCents: cents('credit_limit_cents'),
    overdraftLimitCents: cents('overdraft_limit_cents'),
    interestRateBp: integer('interest_rate_bp'),
    termEnd: text('term_end'),
    monthlyFeeCents: cents('monthly_fee_cents'),
    /**
     * Loan terms for the debt calculator and the cost report: fixed or variable interest, the
     * monthly installment (Rate), the start of the term and the original loan amount.
     */
    interestKind: text('interest_kind', { enum: INTEREST_KINDS }),
    installmentCents: cents('installment_cents'),
    termStart: text('term_start'),
    originalAmountCents: cents('original_amount_cents'),
    sortOrder: integer('sort_order').notNull().default(0),
    closedAt: text('closed_at'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    oneOf('account_type_chk', t.type, ACCOUNT_TYPES),
    oneOf('account_role_chk', t.role, ACCOUNT_ROLES),
    check(
      'account_on_budget_chk',
      sql`${t.onBudget} = 0 OR ${t.type} NOT IN (${sql.raw(TRACKING_ONLY_TYPES.map((v) => `'${v}'`).join(', '))})`,
    ),
    isoDay('account_opening_date_chk', t.openingDate),
    isoDay('account_term_end_chk', t.termEnd),
    isoDay('account_term_start_chk', t.termStart),
    check('account_interest_kind_chk', sql`${t.interestKind} IN ('fixed', 'variable')`),
    check('account_installment_chk', sql`${t.installmentCents} >= 0`),
    check('account_original_amount_chk', sql`${t.originalAmountCents} >= 0`),
    index('account_role_idx').on(t.role),
  ],
);
