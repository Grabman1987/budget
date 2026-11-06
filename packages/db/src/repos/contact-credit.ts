import { eq, like } from 'drizzle-orm';
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
import type { Executor } from './types';

const PREFIX = 'contacts.credit.';
export interface ContactCreditRecord {
  bookingId: string;
  decision?: {
    debitSplitId: string;
    sourceSplitId: string;
    creditSplitId?: string;
    categoryId: string | null;
  };
  uses?: { receiptSplitId: string; outlaySplitId: string; amountCents: number }[];
  refunds?: { categoryId: string; amountCents: number }[];
  repayments?: string[];
  repaymentRefunds?: { categoryId: string; amountCents: number }[];
}

/** Existing audited settings store explicit credit provenance, never inferred historical edits. */
export function contactCreditRecords(db: Executor): ContactCreditRecord[] {
  return db
    .select()
    .from(appSetting)
    .where(like(appSetting.id, `${PREFIX}%`))
    .all()
    .map((r) => JSON.parse(r.value) as ContactCreditRecord);
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
      { value: JSON.stringify({ ...JSON.parse(current.value), ...record }) },
      ctx,
    );
  else insertTracked(db, appSetting, { id, value: JSON.stringify(record) }, ctx);
}

export function assertContactCreditRecords(db: Executor, uses: ContactCreditRecord['uses']) {
  for (const record of contactCreditRecords(db)) {
    const row = db.select().from(booking).where(eq(booking.id, record.bookingId)).get();
    if (
      (!row || row.deletedAt !== null) &&
      !record.decision &&
      !record.uses?.length &&
      !record.repayments?.length
    )
      continue;
    if (!row || row.deletedAt !== null)
      throw new BookingInvariantError('Contact credit and its booking must be undone together');
    const parts = db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, row.id)).all();
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
      const saved = new Map(
        (record.repaymentRefunds ?? []).map((r) => [r.categoryId, r.amountCents]),
      );
      if (
        expected.size !== saved.size ||
        [...expected].some(([id, amount]) => saved.get(id) !== amount)
      )
        throw new BookingInvariantError('Contact repayment must retain its original categories');
      for (const [categoryId, amountCents] of expected) {
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
