import { eq, like } from 'drizzle-orm';
import { z } from 'zod';
import {
  appSetting,
  booking,
  bookingSplit,
  category,
  contactAllocation,
  contactSettlement,
} from '../schema';
import { insertTracked, updateTracked, type GroupedContext } from './audit';
import { BookingInvariantError } from './errors';
import { memoizedShared } from './request-memo';
import type { Executor } from './types';

const PREFIX = 'contacts.credit.';
const idSchema = z.string().min(1);
const centsSchema = z.number().int().safe().positive();
const refundSchema = z.object({ categoryId: idSchema, amountCents: centsSchema });
const useSchema = z.object({
  receiptSplitId: idSchema,
  outlaySplitId: idSchema,
  amountCents: centsSchema,
});
const correctionSchema = z.object({
  bookingId: idSchema,
  entries: z.array(
    z.object({
      categoryId: idSchema,
      amountCents: z.number().int().safe(),
    }),
  ),
});
const contactCreditRecordSchema = z.object({
  bookingId: idSchema,
  decision: z
    .object({
      debitSplitId: idSchema,
      sourceSplitId: idSchema,
      creditSplitId: idSchema.optional(),
      categoryId: idSchema.nullable(),
    })
    .optional(),
  uses: z
    .array(
      z.object({
        receiptSplitId: idSchema,
        outlaySplitId: idSchema,
        amountCents: centsSchema,
      }),
    )
    .optional(),
  explicitUses: z.boolean().optional(),
  useHistory: z
    .array(z.object({ date: z.string(), uses: z.array(useSchema), explicitUses: z.boolean() }))
    .optional(),
  refunds: z.array(refundSchema).optional(),
  repayments: z.array(idSchema).optional(),
  targetedRepayments: z.array(idSchema).optional(),
  allocationHistory: z
    .array(
      z.object({
        date: z.string(),
        receiptSplitId: idSchema,
        allocations: z.array(z.object({ outlaySplitId: idSchema, amountCents: centsSchema })),
        creditCents: z.number().int().safe().nonnegative(),
        allowFutureAllocations: z.boolean(),
      }),
    )
    .optional(),
  repaymentRefunds: z.array(refundSchema).optional(),
  refundCorrections: z.array(correctionSchema).optional(),
  repaymentRefundCorrections: z.array(correctionSchema).optional(),
  adjustmentFor: z
    .object({ bookingId: idSchema, kind: z.enum(['refunds', 'repaymentRefunds']) })
    .optional(),
});
export type ContactCreditRecord = z.infer<typeof contactCreditRecordSchema>;

export function contactRefundTotals(
  record: ContactCreditRecord,
  kind: 'refunds' | 'repaymentRefunds',
) {
  const totals = new Map<string, number>();
  for (const r of [
    ...(record[kind] ?? []),
    ...(
      record[kind === 'refunds' ? 'refundCorrections' : 'repaymentRefundCorrections'] ?? []
    ).flatMap((c) => c.entries),
  ])
    totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + r.amountCents);
  for (const [id, amount] of totals) if (!amount) totals.delete(id);
  return totals;
}

export function parseContactCreditRecord(row: {
  id: string;
  value: string;
}): ContactCreditRecord | undefined {
  let value: unknown;
  try {
    value = JSON.parse(row.value);
  } catch {
    // Never log stored values or identifiers: settings may contain private data.
    console.warn('Skipping malformed contact credit record');
    return;
  }
  const parsed = contactCreditRecordSchema.safeParse(value);
  if (!parsed.success || row.id !== `${PREFIX}${parsed.data.bookingId}`) {
    console.warn('Skipping malformed contact credit record');
    return;
  }
  return parsed.data;
}

/** Existing audited settings store explicit credit provenance, never inferred historical edits. */
export function contactCreditRecords(db: Executor): ContactCreditRecord[] {
  return memoizedShared(db, 'contactCreditRecords', () =>
    db
      .select()
      .from(appSetting)
      .where(like(appSetting.id, `${PREFIX}%`))
      .all()
      .flatMap((row) => {
        const record = parseContactCreditRecord(row);
        return record ? [record] : [];
      }),
  );
}

export function saveContactCreditRecord(
  db: Executor,
  record: ContactCreditRecord,
  ctx: GroupedContext,
) {
  const id = `${PREFIX}${record.bookingId}`;
  const current = db.select().from(appSetting).where(eq(appSetting.id, id)).get();
  if (current)
    updateTracked(
      db,
      appSetting,
      [id],
      { value: JSON.stringify({ ...parseContactCreditRecord(current), ...record }) },
      ctx,
    );
  else insertTracked(db, appSetting, { id, value: JSON.stringify(record) }, ctx);
}

export function assertContactCreditRecords(
  db: Executor,
  uses: ContactCreditRecord['uses'],
  records = contactCreditRecords(db),
) {
  for (const record of records) {
    const row = db.select().from(booking).where(eq(booking.id, record.bookingId)).get();
    if (
      (!row || row.deletedAt !== null) &&
      !record.decision &&
      !record.uses?.length &&
      !record.repayments?.length &&
      !record.adjustmentFor &&
      !record.explicitUses &&
      !record.useHistory?.length &&
      !record.refundCorrections?.length &&
      !record.repaymentRefundCorrections?.length
    )
      continue;
    if (!row || row.deletedAt !== null)
      throw new BookingInvariantError('Contact credit and its booking must be undone together');
    const parts = db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, row.id)).all();
    if (record.adjustmentFor) {
      const parent = records.find((r) => r.bookingId === record.adjustmentFor!.bookingId);
      const corrections =
        parent?.[
          record.adjustmentFor.kind === 'refunds'
            ? 'refundCorrections'
            : 'repaymentRefundCorrections'
        ];
      if (!parent || !corrections?.some((c) => c.bookingId === row.id))
        throw new BookingInvariantError('Contact adjustment needs its allocation provenance');
    }
    for (const kind of ['refunds', 'repaymentRefunds'] as const) {
      for (const correction of record[
        kind === 'refunds' ? 'refundCorrections' : 'repaymentRefundCorrections'
      ] ?? []) {
        const adjustment = db
          .select()
          .from(booking)
          .where(eq(booking.id, correction.bookingId))
          .get();
        const linked = records.find((r) => r.bookingId === correction.bookingId)?.adjustmentFor;
        const lines = db
          .select()
          .from(bookingSplit)
          .where(eq(bookingSplit.bookingId, correction.bookingId))
          .all();
        const actual = new Map<string, number>();
        for (const line of lines) {
          const envelope =
            line.categoryId &&
            db.select().from(category).where(eq(category.id, line.categoryId)).get();
          if (!envelope || line.contactId || line.incomeTypeId || line.transferId)
            throw new BookingInvariantError('Invalid contact category adjustment');
          if (envelope.kind !== 'advance')
            actual.set(envelope.id, (actual.get(envelope.id) ?? 0) + line.amountCents);
        }
        if (
          !adjustment ||
          adjustment.deletedAt !== null ||
          adjustment.amountCents !== 0 ||
          adjustment.accountId !== row.accountId ||
          adjustment.date < row.date ||
          linked?.bookingId !== row.id ||
          linked.kind !== kind ||
          actual.size !== correction.entries.length ||
          correction.entries.some((e) => actual.get(e.categoryId) !== e.amountCents) ||
          lines.reduce((sum, s) => sum + s.amountCents, 0) !== 0
        )
          throw new BookingInvariantError(
            'Contact category adjustment must be undone with its allocation',
          );
      }
    }
    if (record.decision) {
      const d = record.decision;
      const debit = parts.find((s) => s.id === d.debitSplitId);
      const credit = parts.find((s) => s.id === d.creditSplitId);
      if (
        row.amountCents !== 0 ||
        !debit?.contactId ||
        debit.amountCents >= 0 ||
        (d.creditSplitId &&
          (!credit ||
            credit.contactId !== debit.contactId ||
            credit.amountCents !== -debit.amountCents))
      )
        throw new BookingInvariantError('Invalid contact credit decision');
      if (d.categoryId) {
        const target = db.select().from(category).where(eq(category.id, d.categoryId)).get();
        if (
          !target ||
          target.deletedAt !== null ||
          target.class === null ||
          ['advance', 'income', 'card_payment'].includes(target.kind)
        )
          throw new BookingInvariantError('Contact credit needs its earmarked category');
      }
    }
    if (record.uses) {
      const actual = uses?.filter((u) => parts.some((s) => s.id === u.outlaySplitId)) ?? [];
      const canonical = (entries: NonNullable<typeof uses>) =>
        JSON.stringify(
          entries.map((u) => `${u.receiptSplitId}/${u.outlaySplitId}/${u.amountCents}`).sort(),
        );
      if (canonical(actual) !== canonical(record.uses))
        throw new BookingInvariantError(
          'Undo the later contact credit use before changing its source',
        );
      for (const refund of record.refunds ?? []) {
        if (
          !parts.some(
            (s) =>
              !s.contactId &&
              s.categoryId === refund.categoryId &&
              s.amountCents === refund.amountCents,
          )
        )
          throw new BookingInvariantError('Contact credit category inflow is missing');
      }
      if (record.refundCorrections) {
        const expected = new Map<string, number>();
        for (const use of record.uses) {
          const part = parts.find((p) => p.id === use.outlaySplitId);
          if (!part?.categoryId)
            throw new BookingInvariantError('Contact credit outlay is missing');
          if (
            db.select().from(category).where(eq(category.id, part.categoryId)).get()?.kind !==
            'advance'
          )
            expected.set(part.categoryId, (expected.get(part.categoryId) ?? 0) + use.amountCents);
        }
        const actual = contactRefundTotals(record, 'refunds');
        if (
          actual.size !== expected.size ||
          [...expected].some(([id, amount]) => actual.get(id) !== amount)
        )
          throw new BookingInvariantError('Contact credit return does not match its allocation');
      }
    }
    if (record.repayments) {
      const expected = new Map<string, number>();
      for (const receiptSplitId of record.repayments) {
        const settlement = db
          .select()
          .from(contactSettlement)
          .where(eq(contactSettlement.receiptSplitId, receiptSplitId))
          .get();
        if (!settlement || settlement.deletedAt !== null || settlement.bookingId !== row.id)
          throw new BookingInvariantError('Contact repayment provenance is missing');
        for (const a of db
          .select()
          .from(contactAllocation)
          .where(eq(contactAllocation.settlementId, settlement.id))
          .all()
          .filter((a) => a.deletedAt === null)) {
          const original = db
            .select({ categoryId: bookingSplit.categoryId, kind: category.kind })
            .from(bookingSplit)
            .leftJoin(category, eq(category.id, bookingSplit.categoryId))
            .where(eq(bookingSplit.id, a.outlaySplitId))
            .get();
          if (original?.categoryId && original.kind !== 'advance')
            expected.set(
              original.categoryId,
              (expected.get(original.categoryId) ?? 0) + a.amountCents,
            );
        }
      }
      const saved = contactRefundTotals(record, 'repaymentRefunds');
      if (
        expected.size !== saved.size ||
        [...expected].some(([id, amount]) => saved.get(id) !== amount)
      )
        throw new BookingInvariantError('Contact repayment must retain its original categories');
      for (const { categoryId, amountCents } of record.repaymentRefunds ?? []) {
        if (
          !parts.some(
            (s) => !s.contactId && s.categoryId === categoryId && s.amountCents === amountCents,
          )
        )
          throw new BookingInvariantError('Contact repayment category inflow is missing');
      }
    }
  }
}
