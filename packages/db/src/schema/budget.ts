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
import { cents, id, isoDay, isoMonth, oneOf, timestamps } from './common';

export const CATEGORY_CLASSES = ['need', 'want', 'future'] as const;
/**
 * How a category is planned and treated (concept §3.2, §3.4, §5.3):
 * - `fixed`, `periodic`, `variable`: spending envelopes (Fix, Periodisch, Variabel);
 * - `project`: side-project costs; `saving`: savings goals and reserves; `invest`: money moved to
 *   investment accounts; `debt`: loan payments and extra repayments;
 * - `advance`: the envelope "Auslagen" — splits with a contact (receivable share) run through it;
 * - `card_payment`: the envelope "Kartenzahlung" of one credit card (`card_account_id`). Every
 *   categorised spend on that card moves its amount here automatically (rule R06, YNAB "Credit
 *   Card Payments"), so the statement is covered when it is paid;
 * - `income`: optional income categories next to "Zu verteilen"; they have no class.
 */
export const CATEGORY_KINDS = [
  'fixed',
  'periodic',
  'variable',
  'project',
  'saving',
  'invest',
  'debt',
  'advance',
  'card_payment',
  'income',
] as const;
/** Kinds without a 50/30/20 class: income is not spending, the other two only pass money on. */
export const CLASSLESS_KINDS = ['income', 'card_payment', 'advance'] as const;
export const EXPECTED_KINDS = ['outflow', 'inflow'] as const;
export const RHYTHMS = ['monthly', 'quarterly', 'semiannual', 'yearly'] as const;
/** Move a due date that is no business day (Austria) to the previous or next business day. */
export const DATE_SHIFTS = ['none', 'before', 'after'] as const;
/** Payees the app itself uses (YNAB "Starting Balance", "Reconciliation/Manual Balance Adjustment"). */
export const SYSTEM_PAYEES = [
  'opening_balance',
  'reconciliation_adjustment',
  'manual_adjustment',
] as const;
/** Category targets (Ziel je Kategorie): per month, a balance by a date, or keep a balance. */
export const TARGET_KINDS = ['monthly', 'by_date', 'keep_balance'] as const;

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** Standard income types (Einnahmenarten, concept §3.2) with the fixed ids the migration inserts. */
export const INCOME_TYPES = {
  salary: { id: 'income-salary', name: 'Gehalt' },
  special: { id: 'income-special', name: 'Sonderzahlung' },
  contribution: { id: 'income-contribution', name: 'Beiträge von Kontakten' },
  side: { id: 'income-side', name: 'Nebeneinkünfte' },
  capital: { id: 'income-capital', name: 'Kapitalerträge' },
  refund: { id: 'income-refund', name: 'Erstattungen' },
  gift: { id: 'income-gift', name: 'Geschenke' },
  other: { id: 'income-other', name: 'Sonstiges' },
} as const;

/** The app's own payees with the fixed ids the migration inserts (one per `SYSTEM_PAYEES` kind). */
export const SYSTEM_PAYEE_IDS = {
  opening_balance: { id: 'payee-opening-balance', name: 'Eröffnungssaldo' },
  reconciliation_adjustment: { id: 'payee-reconciliation', name: 'Korrektur Kontoprüfung' },
  manual_adjustment: { id: 'payee-manual-adjustment', name: 'Manuelle Saldokorrektur' },
} as const satisfies Record<(typeof SYSTEM_PAYEES)[number], { id: string; name: string }>;

/**
 * Income types (Einnahmenarten): a separate list next to the categories, editable; the standard
 * entries of `INCOME_TYPES` come with the migration.
 */
export const incomeType = sqliteTable('income_type', {
  id: id(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
});

export const categoryGroup = sqliteTable('category_group', {
  id: id(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
});

/**
 * Every spending category belongs to one class (Bedarf, Wunsch, Zukunft) and, optionally, a
 * waterfall stage 1–9. Income, card-payment and advance categories have no class.
 */
export const category = sqliteTable(
  'category',
  {
    id: id(),
    name: text('name').notNull(),
    /** Optional emoji, rendered monochrome in blueprint ink (never as colour emoji). */
    icon: text('icon'),
    groupId: text('group_id')
      .notNull()
      .references(() => categoryGroup.id),
    class: text('class', { enum: CATEGORY_CLASSES }),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull().default('variable'),
    /** null = automatic utility detection, false = contract prices, true = trailing mean. */
    inflationTrailingMean: integer('inflation_trailing_mean', { mode: 'boolean' }),
    /** Money-flow waterfall stage 1–9 (SPEC §4). */
    stage: integer('stage'),
    /** The credit card whose spending this `card_payment` category collects. */
    cardAccountId: text('card_account_id').references(() => account.id),
    /**
     * Carry a negative balance into the next month instead of resetting it to 0 (Actual's
     * "rollover overspending"). Default off: uncovered overspending reduces next month's
     * "Zu verteilen" (concept §5.3, YNAB).
     */
    rolloverOverspending: integer('rollover_overspending', { mode: 'boolean' })
      .notNull()
      .default(false),
    /**
     * Available amount of the envelope when the budget starts (concept §5.2 no. 7: the envelopes
     * start with their balances of the start date), separate from the first month's assignment.
     */
    openingAvailableCents: cents('opening_available_cents').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    hiddenAt: text('hidden_at'),
    /** Pinned to Heute: set when pinned, pinned envelopes are shown in this order. */
    pinnedAt: text('pinned_at'),
    ...timestamps(),
  },
  (t) => [
    oneOf('category_class_chk', t.class, CATEGORY_CLASSES),
    oneOf('category_kind_chk', t.kind, CATEGORY_KINDS),
    check(
      'category_class_required_chk',
      sql`(${t.class} IS NULL) = (${t.kind} IN (${list(CLASSLESS_KINDS)}))`,
    ),
    check('category_stage_chk', sql`${t.stage} BETWEEN 1 AND 9`),
    check(
      'category_card_account_chk',
      sql`(${t.cardAccountId} IS NOT NULL) = (${t.kind} = 'card_payment')`,
    ),
    index('category_group_idx').on(t.groupId),
    uniqueIndex('category_card_account_uq')
      .on(t.cardAccountId)
      .where(sql`${t.cardAccountId} IS NOT NULL`),
  ],
);

export const payee = sqliteTable(
  'payee',
  {
    id: id(),
    name: text('name').notNull(),
    contactId: text('contact_id').references(() => contact.id),
    defaultCategoryId: text('default_category_id').references(() => category.id),
    /** Set on the app's own payees (inserted by the migration); at most one per kind. */
    systemKind: text('system_kind', { enum: SYSTEM_PAYEES }),
    ...timestamps(),
  },
  (t) => [
    oneOf('payee_system_kind_chk', t.systemKind, SYSTEM_PAYEES),
    uniqueIndex('payee_system_kind_uq')
      .on(t.systemKind)
      .where(sql`${t.systemKind} IS NOT NULL`),
  ],
);

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
  (t) => [
    primaryKey({ columns: [t.categoryId, t.month] }),
    isoMonth('envelope_month_month_chk', t.month),
  ],
);

/**
 * Month-level budget values. `held_cents` is money set aside for next month (YNAB "hold for next
 * month", Actual "hold"): it is excluded from this month's "Zu verteilen" and comes back next month.
 */
export const budgetMonth = sqliteTable(
  'budget_month',
  {
    /** `YYYY-MM` */
    month: text('month').primaryKey(),
    heldCents: cents('held_cents').notNull().default(0),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    isoMonth('budget_month_month_chk', t.month),
    check('budget_month_held_chk', sql`${t.heldCents} >= 0`),
  ],
);

/**
 * Target per category (Ziel je Kategorie), versioned by `valid_from` month: `monthly` = assign
 * `amount_cents` every month (or `amount_cents` every `every_months` months, due in the month of
 * `target_date`), `by_date` = reach `amount_cents` by `target_date`, `keep_balance` = keep at least
 * `amount_cents` available. The arithmetic is `targetNeed` in the domain package.
 */
export const categoryTarget = sqliteTable(
  'category_target',
  {
    id: id(),
    categoryId: text('category_id')
      .notNull()
      .references(() => category.id),
    kind: text('kind', { enum: TARGET_KINDS }).notNull(),
    amountCents: cents('amount_cents').notNull(),
    everyMonths: integer('every_months').notNull().default(1),
    targetDate: text('target_date'),
    /** Day of month (1–31, 31 = last day) a `monthly` target falls due (Fixkosten: "am 1."). */
    dueDay: integer('due_day'),
    /** `YYYY-MM` from which this target applies; the next version replaces it. */
    validFrom: text('valid_from').notNull(),
    ...timestamps(),
  },
  (t) => [
    oneOf('category_target_kind_chk', t.kind, TARGET_KINDS),
    check('category_target_amount_chk', sql`${t.amountCents} >= 0`),
    check('category_target_every_chk', sql`${t.everyMonths} BETWEEN 1 AND 120`),
    check('category_target_due_day_chk', sql`${t.dueDay} BETWEEN 1 AND 31`),
    check('category_target_date_chk', sql`${t.kind} <> 'by_date' OR ${t.targetDate} IS NOT NULL`),
    isoDay('category_target_target_date_chk', t.targetDate),
    isoMonth('category_target_valid_from_chk', t.validFrom),
    uniqueIndex('category_target_uq').on(t.categoryId, t.validFrom),
  ],
);

/**
 * Recurring or one-off expected payment; the amount lives in versions (price changes).
 * Counterparty is a payee or a contact; the booking side is a category or an income type.
 * A booking is matched to an occurrence within `amount_tolerance_cents` and `date_window_days`.
 */
export const expectedPayment = sqliteTable(
  'expected_payment',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: EXPECTED_KINDS }).notNull().default('outflow'),
    accountId: text('account_id').references(() => account.id),
    payeeId: text('payee_id').references(() => payee.id),
    contactId: text('contact_id').references(() => contact.id),
    categoryId: text('category_id').references(() => category.id),
    incomeTypeId: text('income_type_id').references(() => incomeType.id),
    /**
     * Share of each occurrence paid on behalf of `contact_id` (concept §3.4 "Durchgereichte
     * Kosten"), basis points: 10 000 = the whole amount becomes a receivable of the contact.
     */
    contactShareBp: integer('contact_share_bp').notNull().default(0),
    amountToleranceCents: cents('amount_tolerance_cents').notNull().default(0),
    dateWindowDays: integer('date_window_days').notNull().default(3),
    rhythm: text('rhythm', { enum: RHYTHMS }).notNull().default('monthly'),
    /** Day of month (1–31, 31 = last day). */
    dueDay: integer('due_day').notNull().default(1),
    /** Month 1–12: the month a yearly payment falls due, or the first month of a quarter or half year. */
    dueMonth: integer('due_month'),
    dateShift: text('date_shift', { enum: DATE_SHIFTS }).notNull().default('none'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    oneOf('expected_kind_chk', t.kind, EXPECTED_KINDS),
    oneOf('expected_rhythm_chk', t.rhythm, RHYTHMS),
    oneOf('expected_date_shift_chk', t.dateShift, DATE_SHIFTS),
    check('expected_due_day_chk', sql`${t.dueDay} BETWEEN 1 AND 31`),
    check('expected_due_month_chk', sql`${t.dueMonth} BETWEEN 1 AND 12`),
    check('expected_share_chk', sql`${t.contactShareBp} BETWEEN 0 AND 10000`),
    check('expected_share_contact_chk', sql`${t.contactShareBp} = 0 OR ${t.contactId} IS NOT NULL`),
    check(
      'expected_category_or_income_chk',
      sql`${t.categoryId} IS NULL OR ${t.incomeTypeId} IS NULL`,
    ),
    check('expected_tolerance_chk', sql`${t.amountToleranceCents} >= 0`),
    check('expected_window_chk', sql`${t.dateWindowDays} BETWEEN 0 AND 31`),
    isoDay('expected_start_chk', t.startDate),
    isoDay('expected_end_chk', t.endDate),
  ],
);

/**
 * Amount of an expected payment from `valid_from` on. Versions are immutable (a trigger in the
 * migration refuses changes to anything but `deleted_at`/`updated_at`): a price change is a new
 * version. `amount_max_cents` makes the amount a range (Spanne).
 */
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
    amountMaxCents: cents('amount_max_cents'),
    currency: text('currency').notNull().default('EUR'),
    /** Foreign-currency contracts keep the original amount. */
    originalAmountCents: cents('original_amount_cents'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('expected_version_uq').on(t.expectedPaymentId, t.validFrom),
    isoDay('expected_version_valid_from_chk', t.validFrom),
    check(
      'expected_version_range_chk',
      sql`${t.amountMaxCents} IS NULL OR ${t.amountMaxCents} >= ${t.amountCents}`,
    ),
  ],
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
export const plannedEvent = sqliteTable(
  'planned_event',
  {
    id: id(),
    name: text('name').notNull(),
    date: text('date').notNull(),
    amountCents: cents('amount_cents').notNull(),
    accountId: text('account_id').references(() => account.id),
    categoryId: text('category_id').references(() => category.id),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    recurrence: text('recurrence', { enum: ['once', 'monthly', 'quarterly', 'yearly', 'months'] })
      .notNull()
      .default('once'),
    recurrenceMonths: text('recurrence_months', { mode: 'json' })
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'`),
    recurrenceUntil: text('recurrence_until'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [isoDay('planned_event_date_chk', t.date)],
);
