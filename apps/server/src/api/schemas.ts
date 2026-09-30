import {
  ACCOUNT_TYPES,
  ACCOUNT_ROLES,
  BOOKING_FLAGS,
  BOOKING_SORTS,
  BOOKING_STATUSES,
  CATEGORY_CLASSES,
  CATEGORY_KINDS,
  TARGET_KINDS,
} from '@budget/db';
import { z } from 'zod';

/** Integer cents. Amounts are never floats (SPEC §5). */
export const cents = z.int();
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date as YYYY-MM-DD')
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Not a calendar date');
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
});
export type AccountCreate = z.infer<typeof accountCreate>;

export const accountPatch = accountCreate
  .partial()
  .omit({ currency: true })
  .extend({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  });
export const accountClose = z.object({ force: z.boolean().default(false) });
export const accountSort = z.object({ ids: z.array(id).min(1).max(200) });
export const asOfQuery = z.object({ asOf: day.optional() });
export const seriesQuery = z.object({ from: day, to: day });

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
  accountId: id,
  date: day,
  amountCents: cents,
  payeeId: id.nullable().optional(),
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
export const payeeRename = z.object({ name: z.string().min(1).max(120) });
export const payeeMerge = z.object({
  sourceIds: z.array(id).min(1).max(100),
  targetId: id,
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
export const categoryPatch = z
  .object(categoryFields)
  .partial()
  .extend({ hidden: z.boolean().optional(), target: targetBody.optional() });
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
export const assignBody = z.object({
  items: z
    .array(z.object({ categoryId: id, assignedCents: cents }))
    .min(1)
    .max(500),
});
export const moveBody = z.object({
  fromId: id.nullable(),
  toId: id.nullable(),
  amountCents: cents.positive(),
});
export const coverBody = z.object({ categoryId: id, fromId: id.nullable() });
