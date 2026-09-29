import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { cents, id, oneOf, timestamps } from './common';

export const INSTITUTION_KINDS = ['bank', 'broker', 'platform', 'insurer', 'other'] as const;
/** Account roles: Budget-Konto, Rücklage, Anlage, Schuld, Forderung (Kontoblatt of a contact). */
export const ACCOUNT_ROLES = ['budget', 'reserve', 'investment', 'debt', 'receivable'] as const;

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
    role: text('role', { enum: ACCOUNT_ROLES }).notNull(),
    institutionId: text('institution_id').references(() => institution.id),
    contactId: text('contact_id').references(() => contact.id),
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
    sortOrder: integer('sort_order').notNull().default(0),
    closedAt: text('closed_at'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [oneOf('account_role_chk', t.role, ACCOUNT_ROLES), index('account_role_idx').on(t.role)],
);
