import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { account, contact } from './accounts';
import { cents, id, oneOf, timestamps } from './common';

export const CATEGORY_CLASSES = ['need', 'want', 'future'] as const;
export const CATEGORY_KINDS = ['fixed', 'variable', 'periodic', 'project', 'saving'] as const;
export const EXPECTED_KINDS = ['outflow', 'inflow'] as const;
export const RHYTHMS = ['monthly', 'quarterly', 'semiannual', 'yearly'] as const;

export const categoryGroup = sqliteTable('category_group', {
  id: id(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
});

/** Every category belongs to one class (Bedarf, Wunsch, Zukunft) and, optionally, a waterfall stage. */
export const category = sqliteTable(
  'category',
  {
    id: id(),
    name: text('name').notNull(),
    groupId: text('group_id')
      .notNull()
      .references(() => categoryGroup.id),
    class: text('class', { enum: CATEGORY_CLASSES }).notNull(),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull().default('variable'),
    /** Money-flow waterfall stage 1–9 (SPEC §4). */
    stage: integer('stage'),
    sortOrder: integer('sort_order').notNull().default(0),
    hiddenAt: text('hidden_at'),
    ...timestamps(),
  },
  (t) => [
    oneOf('category_class_chk', t.class, CATEGORY_CLASSES),
    oneOf('category_kind_chk', t.kind, CATEGORY_KINDS),
    index('category_group_idx').on(t.groupId),
  ],
);

export const payee = sqliteTable('payee', {
  id: id(),
  name: text('name').notNull(),
  contactId: text('contact_id').references(() => contact.id),
  defaultCategoryId: text('default_category_id').references(() => category.id),
  ...timestamps(),
});

/** Envelope month: only the assigned amount is stored; activity and available are derived. */
export const envelopeMonth = sqliteTable(
  'envelope_month',
  {
    categoryId: text('category_id')
      .notNull()
      .references(() => category.id),
    /** `YYYY-MM` */
    month: text('month').notNull(),
    assignedCents: cents('assigned_cents').notNull().default(0),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.month] })],
);

/** Recurring or one-off expected payment; the amount lives in versions (price changes). */
export const expectedPayment = sqliteTable(
  'expected_payment',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: EXPECTED_KINDS }).notNull().default('outflow'),
    accountId: text('account_id').references(() => account.id),
    payeeId: text('payee_id').references(() => payee.id),
    categoryId: text('category_id').references(() => category.id),
    rhythm: text('rhythm', { enum: RHYTHMS }).notNull().default('monthly'),
    /** Day of month (1–31, 31 = last day). */
    dueDay: integer('due_day').notNull().default(1),
    /** Month 1–12: the month a yearly payment falls due, or the first month of a quarter or half year. */
    dueMonth: integer('due_month'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    oneOf('expected_kind_chk', t.kind, EXPECTED_KINDS),
    oneOf('expected_rhythm_chk', t.rhythm, RHYTHMS),
  ],
);

export const expectedPaymentVersion = sqliteTable(
  'expected_payment_version',
  {
    id: id(),
    expectedPaymentId: text('expected_payment_id')
      .notNull()
      .references(() => expectedPayment.id),
    /** First day this amount applies. */
    validFrom: text('valid_from').notNull(),
    amountCents: cents('amount_cents').notNull(),
    currency: text('currency').notNull().default('EUR'),
    /** Foreign-currency contracts keep the original amount. */
    originalAmountCents: cents('original_amount_cents'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('expected_version_uq').on(t.expectedPaymentId, t.validFrom)],
);

export const savingsGoal = sqliteTable('savings_goal', {
  id: id(),
  name: text('name').notNull(),
  targetCents: cents('target_cents').notNull(),
  targetDate: text('target_date'),
  categoryId: text('category_id').references(() => category.id),
  accountId: text('account_id').references(() => account.id),
  note: text('note'),
  ...timestamps(),
});

/** Forecast events (Geplantes Ereignis): a purchase, a bonus, a move. */
export const plannedEvent = sqliteTable('planned_event', {
  id: id(),
  name: text('name').notNull(),
  date: text('date').notNull(),
  amountCents: cents('amount_cents').notNull(),
  accountId: text('account_id').references(() => account.id),
  categoryId: text('category_id').references(() => category.id),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  note: text('note'),
  ...timestamps(),
});
