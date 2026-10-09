import {
  ACCOUNT_TYPES,
  ACCOUNT_ROLES,
  BOOKING_FLAGS,
  BOOKING_SORTS,
  BOOKING_STATUSES,
  CATEGORY_CLASSES,
  CATEGORY_KINDS,
  DATE_SHIFTS,
  EXPECTED_KINDS,
  RHYTHMS,
  TARGET_KINDS,
} from '@budget/db';
import { z } from 'zod';
import { LIQUIDITY_HORIZONS, LIQUIDITY_LEVERS } from '@budget/domain';

/** Integer cents. Amounts are never floats (SPEC §5). */
export const cents = z.int();
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date as YYYY-MM-DD')
  .refine(
    (v) =>
      Number.isFinite(Date.parse(`${v}T00:00:00Z`)) &&
      new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
    'Not a calendar date',
  );
const id = z.string().min(1).max(64);
const text = z.string().max(500);
const nullableText = text.nullable();

/** What a user may set: `reconciled` only comes from Kontostand prüfen. */
export const writableStatus = z.enum(['pending', 'confirmed']);
export const flag = z.enum(BOOKING_FLAGS);

// ---------- accounts ----------
export const accountCreate = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(ACCOUNT_TYPES),
  role: z.enum(ACCOUNT_ROLES).optional(),
  onBudget: z.boolean().optional(),
  allocationScope: z.enum(['default', 'included', 'excluded']).optional(),
  allocationAssetClassId: id.nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('EUR'),
  institutionId: id.nullable().optional(),
  contactId: id.nullable().optional(),
  openingBalanceCents: cents.default(0),
  openingDate: day,
  note: nullableText.optional(),
  // Terms: limits, rates (basis points), term, fees.
  creditLimitCents: cents.min(0).nullable().optional(),
  overdraftLimitCents: cents.min(0).nullable().optional(),
  interestRateBp: z.int().min(0).max(100_000).nullable().optional(),
  termEnd: day.nullable().optional(),
  monthlyFeeCents: cents.min(0).nullable().optional(),
  // Loan terms: fixed or variable interest, monthly installment, term start, original amount.
  interestKind: z.enum(['fixed', 'variable']).nullable().optional(),
  installmentCents: cents.min(0).nullable().optional(),
  termStart: day.nullable().optional(),
  originalAmountCents: cents.min(0).nullable().optional(),
});
export type AccountCreate = z.infer<typeof accountCreate>;

export const accountPatch = accountCreate
  .partial()
  .omit({ currency: true, openingBalanceCents: true })
  .extend({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    // No default here: a patch without it must leave the stored opening balance alone.
    openingBalanceCents: cents.optional(),
    /** Change opening balance or date although Kontostand prüfen snapshots exist. */
    unlockReconciled: z.boolean().optional(),
  });
export const accountClose = z.object({ force: z.boolean().default(false) });
/** Ordered account ids; accounts left out follow in their current order (see `orderAccounts`). */
export const accountOrder = z.object({
  ids: z
    .array(id)
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, 'Each account only once'),
});
export const asOfQuery = z.object({ asOf: day.optional() });
export const seriesQuery = z.object({
  from: day,
  to: day,
  previewDays: z.coerce.number().int().min(0).max(365).default(0),
  horizon: z.enum(LIQUIDITY_HORIZONS).optional(),
  levers: z
    .string()
    .max(200)
    .default('')
    .transform((value) =>
      value
        .split(',')
        .filter((id): id is (typeof LIQUIDITY_LEVERS)[number] =>
          LIQUIDITY_LEVERS.some((known) => known === id),
        ),
    ),
});
/** The batch variant: optional comma-separated account ids (default: every live account). */
export const seriesBatchQuery = seriesQuery.extend({
  ids: z
    .string()
    .transform((value) => value.split(',').filter((part) => part.length > 0))
    .optional(),
});

// ---------- bookings ----------
const split = z.object({
  categoryId: id.nullable().optional(),
  amountCents: cents,
  memo: nullableText.optional(),
  contactId: id.nullable().optional(),
  incomeTypeId: id.nullable().optional(),
  transferAccountId: id.nullable().optional(),
});
const foreign = {
  originalAmountCents: cents.nullable().optional(),
  originalCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  fxRateMicro: z.int().positive().nullable().optional(),
  fxFeeCents: cents.nullable().optional(),
};

export const bookingCreate = z.object({
  type: z.literal('booking'),
  repeat: z.enum(RHYTHMS).optional(),
  incomeNextMonth: z.boolean().optional(),
  accountId: id,
  date: day,
  amountCents: cents,
  payeeId: id.nullable().optional(),
  /** Capture can resolve a new payee atomically with an offline booking. */
  payeeName: z.string().trim().min(1).max(80).optional(),
  memo: nullableText.optional(),
  status: writableStatus.default('confirmed'),
  flag: flag.nullable().optional(),
  projectId: id.nullable().optional(),
  /** Several splits, or `categoryId` for the common single one (none = uncategorised). */
  splits: z.array(split).min(1).max(50).optional(),
  categoryId: id.nullable().optional(),
  ...foreign,
});
export const transferCreate = z.object({
  type: z.literal('transfer'),
  fromAccountId: id,
  toAccountId: id,
  date: day,
  amountCents: cents.positive(),
  categoryId: id.nullable().optional(),
  payeeId: id.nullable().optional(),
  memo: nullableText.optional(),
  status: writableStatus.default('confirmed'),
  projectId: id.nullable().optional(),
});
export const createBody = z.discriminatedUnion('type', [bookingCreate, transferCreate]);

export const bookingPatch = z
  .object({
    accountId: id,
    repeat: z.enum(RHYTHMS),
    incomeNextMonth: z.boolean(),
    date: day,
    amountCents: cents,
    payeeId: id.nullable(),
    memo: nullableText,
    status: writableStatus,
    flag: flag.nullable(),
    projectId: id.nullable(),
    splits: z.array(split).min(1).max(50),
    ...foreign,
    /** Change a reconciled (geprüft) booking anyway. */
    unlockReconciled: z.boolean(),
  })
  .partial();

export const bookingDeleteQuery = z.object({ unlock: z.enum(['1', 'true']).optional() });

export const bulkBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    ids: z.array(id).min(1).max(500),
    set: z
      .object({ categoryId: id.nullable(), flag: flag.nullable(), status: writableStatus })
      .partial()
      .refine((s) => Object.keys(s).length > 0, 'Nothing to set'),
    unlockReconciled: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('delete'),
    ids: z.array(id).min(1).max(500),
    unlockReconciled: z.boolean().default(false),
  }),
]);

const csv = z.string().optional();
export const bookingQuery = z.object({
  accountId: id.optional(),
  from: day.optional(),
  to: day.optional(),
  categoryId: id.optional(),
  payeeId: id.optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  flag: z.enum([...BOOKING_FLAGS, 'none']).optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(BOOKING_SORTS).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().max(400).optional(),
  ids: csv,
});

// ---------- payees, undo, reconciliation ----------
export const payeeCreate = z.object({
  name: z.string().min(1).max(120),
  contactId: id.nullable().optional(),
  defaultCategoryId: id.nullable().optional(),
});
/** Rename and/or set the default category that capture pre-fills (`null` clears it). */
export const payeePatch = z
  .object({ name: z.string().min(1).max(120), defaultCategoryId: id.nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const payeeMerge = z.object({
  sourceIds: z.array(id).min(1).max(100),
  targetId: id,
  /** Also move reconciled (geprüft) bookings; they stay with their payee otherwise. */
  unlockReconciled: z.boolean().default(false),
});
export const undoBody = z.object({ groupId: id });

export const reconcilePreview = z.object({ date: day, statementBalanceCents: cents });
export const reconcileBody = reconcilePreview.extend({
  removeBookingIds: z.array(id).max(100).default([]),
  confirmBookingIds: z.array(id).max(100).default([]),
  adjust: z.boolean().default(false),
  note: nullableText.optional(),
});

// ---------- categories and budget (P2c) ----------
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month as YYYY-MM');
const categoryFields = {
  name: z.string().trim().min(1).max(80),
  groupId: id,
  icon: z.string().max(16).nullable().optional(),
  class: z.enum(CATEGORY_CLASSES).nullable().optional(),
  kind: z.enum(CATEGORY_KINDS).optional(),
  stage: z.int().min(1).max(9).nullable().optional(),
  cardAccountId: id.nullable().optional(),
  rolloverOverspending: z.boolean().optional(),
  inflationTrailingMean: z.boolean().nullable().optional(),
};
export const targetBody = z.object({
  validFrom: month,
  target: z
    .object({
      kind: z.enum(TARGET_KINDS),
      amountCents: cents.min(0),
      everyMonths: z.int().min(1).max(120).default(1),
      targetDate: day.nullable().optional(),
      dueDay: z.int().min(1).max(31).nullable().optional(),
    })
    .nullable(),
});
export const categoryCreate = z.object({ ...categoryFields, target: targetBody.optional() });
export const categoryPatch = z.object(categoryFields).partial().extend({
  hidden: z.boolean().optional(),
  pinned: z.boolean().optional(),
  target: targetBody.optional(),
});
export const categorySort = z.object({
  groups: z
    .array(z.object({ id, categoryIds: z.array(id).max(500) }))
    .min(1)
    .max(100),
});
export const categoryMerge = z.object({ sourceIds: z.array(id).min(1).max(100), targetId: id });
export const splitOffQuery = z.object({
  payeeId: id.optional(),
  accountId: id.optional(),
  from: day.optional(),
  to: day.optional(),
  q: z.string().max(200).optional(),
});
export const splitOffBody = z.union([
  z.object({ splitIds: z.array(id).min(1).max(500), targetId: id }),
  z.object({ splitIds: z.array(id).min(1).max(500), newCategory: categoryCreate }),
]);
export const groupBody = z.object({ name: z.string().trim().min(1).max(80) });

export const budgetQuery = z.object({ cardRule: z.enum(['ynab', 'concept']).optional() });
/** `?months=2026-01,2026-02,...`: up to three years of months in one request (Plan › Jahr). */
export const budgetMonthsQuery = budgetQuery.extend({
  months: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(month).min(1).max(36)),
});
export const assignBody = z.object({
  closeMonth: month.optional(),
  items: z
    .array(z.object({ categoryId: id, assignedCents: cents }))
    .min(1)
    .max(500),
});
export const quickAssignBody = z
  .object({
    mode: z.enum(['empty', 'last-month', 'average', 'target']),
    categoryIds: z
      .array(id)
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export const moveBody = z.union([
  z.object({ fromId: id.nullable(), toId: id.nullable(), amountCents: cents.positive() }).strict(),
  z.object({ coverAll: z.literal(true), fromId: id.nullable().optional() }).strict(),
]);
export const coverBody = z.object({
  categoryId: id,
  fromId: id.nullable(),
  /** Reject the legacy override: cover never creates negative unassigned money. */
  allowNegative: z.literal(false).optional(),
});

// ---------- expected payments ----------
const expectedFields = {
  name: z.string().trim().min(1).max(120),
  kind: z.enum(EXPECTED_KINDS),
  accountId: id.nullable(),
  payeeId: id.nullable(),
  contactId: id.nullable(),
  categoryId: id.nullable(),
  incomeTypeId: id.nullable(),
  /** Basis points of each amount paid for the contact (10 000 = all of it). */
  contactShareBp: z.int().min(0).max(10_000),
  amountToleranceCents: cents.min(0),
  dateWindowDays: z.int().min(0).max(31),
  rhythm: z.enum(RHYTHMS),
  dueDay: z.int().min(1).max(31),
  dueMonth: z.int().min(1).max(12).nullable(),
  dateShift: z.enum(DATE_SHIFTS),
  startDate: day.nullable(),
  endDate: day.nullable(),
  /** Weekly rhythm: one due date every n weeks (1-52); null = every week. */
  intervalWeeks: z.int().min(1).max(52).nullable(),
  note: nullableText,
};
/** A version: positive cents (the kind gives the sign), optionally a range up to `amountMaxCents`. */
const versionFields = {
  amountCents: cents.positive(),
  amountMaxCents: cents.positive().nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  note: nullableText.optional(),
};
export const expectedCreate = z
  .object({ ...expectedFields, ...versionFields, validFrom: day.optional() })
  .partial()
  .required({ name: true, kind: true, amountCents: true });
export const expectedPatch = z
  .object(expectedFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const expectedVersionCreate = z.object({ validFrom: day, ...versionFields });
export const expectedListQuery = z.object({ deleted: z.enum(['0', '1']).optional() });
export const expectedOccurrencesQuery = z.object({
  from: day,
  to: day,
  kind: z.enum(EXPECTED_KINDS).optional(),
  includeSkipped: z.enum(['0', '1']).optional(),
});
export const expectedIncomeQuery = z.object({ month });
export const expectedLinkBody = z.object({ bookingId: id });
export const expectedSkipBody = z.object({ dueDate: day });

// ---------- savings goals ----------
const goalFields = {
  name: z.string().trim().min(1).max(120),
  targetCents: cents.positive(),
  targetDate: day.nullable(),
  categoryId: id.nullable(),
  accountId: id.nullable(),
  note: nullableText,
};
export const goalCreate = z
  .object(goalFields)
  .partial()
  .required({ name: true, targetCents: true });
export const goalPatch = z
  .object(goalFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const goalListQuery = z.object({
  month: month.optional(),
  deleted: z.enum(['0', '1']).optional(),
});
export const goalMonthQuery = z.object({ month: month.optional() });
export const goalAdoptBody = z.object({ validFrom: month.optional() });
