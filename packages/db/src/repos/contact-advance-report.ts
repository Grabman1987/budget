import {
  summarizeAdvances,
  type AdvanceOutlayInput,
  type AdvanceReport,
  type AdvanceSettlementInput,
} from '@budget/domain';
import { inArray } from 'drizzle-orm';
import { bookingSplit, category } from '../schema';
import { contactCreditRecords } from './contact-credit';
import { getContactStatement } from './contacts';
import type { Executor } from './types';

export type ContactAdvanceReport = AdvanceReport & {
  /** Names of the purpose categories used in the report. */
  purposeNames: Record<string, string>;
};

/**
 * "Vorgestreckt pro Monat" of a contact (read-only). Outlays and settlements come from the same
 * statement replay the checklist uses (`getContactStatement`): receipts settle their allocated
 * outlays on the receipt's day, a credit used by a later outlay settles it on the outlay's day,
 * and a waiver receipt ("Geschenk an Kontakt") settles without being repaid.
 *
 * An advance's purpose is its recorded `purposeCategoryId`; an old share that stayed in its
 * original expense category counts with that category as its purpose.
 */
export function contactAdvanceReport(
  db: Executor,
  askedId: string,
  today: string,
  months = 12,
): ContactAdvanceReport {
  const records = contactCreditRecords(db);
  const statement = getContactStatement(db, askedId, today, records);
  const own = statement.outlays.filter((o) => !o.creditSourceSplitId && o.amountCents < 0);
  const recorded = new Map(
    own.length
      ? db
          .select({ id: bookingSplit.id, purpose: bookingSplit.purposeCategoryId })
          .from(bookingSplit)
          .where(
            inArray(
              bookingSplit.id,
              own.map((o) => o.splitId),
            ),
          )
          .all()
          .map((r) => [r.id, r.purpose] as const)
      : [],
  );
  const outlays: AdvanceOutlayInput[] = own.map((o) => ({
    splitId: o.splitId,
    date: o.date,
    amountCents: -o.amountCents,
    purposeCategoryId: recorded.get(o.splitId) ?? o.categoryId ?? null,
  }));
  const waiverReceipts = new Set(
    records.flatMap((r) => (r.waiver ? [r.waiver.receiptSplitId] : [])),
  );
  const dateOf = new Map(statement.movements.map((m) => [m.splitId, m.date]));
  const outlayDate = new Map(own.map((o) => [o.splitId, o.date]));
  const settlements: AdvanceSettlementInput[] = [
    ...statement.receipts.flatMap((receipt) =>
      receipt.allocations.map((a) => ({
        outlaySplitId: a.outlaySplitId,
        date: dateOf.get(receipt.receiptSplitId) ?? today,
        amountCents: a.amountCents,
        waived: waiverReceipts.has(receipt.receiptSplitId),
      })),
    ),
    ...statement.creditUses.flatMap((u) =>
      outlayDate.has(u.outlaySplitId)
        ? [
            {
              outlaySplitId: u.outlaySplitId,
              date: outlayDate.get(u.outlaySplitId)!,
              amountCents: u.amountCents,
              waived: false,
            },
          ]
        : [],
    ),
  ];
  const report = summarizeAdvances({ outlays, settlements, today, months });
  const ids = [
    ...new Set(
      report.purposeTotals.flatMap((p) => (p.purposeCategoryId ? [p.purposeCategoryId] : [])),
    ),
  ];
  const names = ids.length
    ? db
        .select({ id: category.id, name: category.name })
        .from(category)
        .where(inArray(category.id, ids))
        .all()
    : [];
  return { ...report, purposeNames: Object.fromEntries(names.map((c) => [c.id, c.name])) };
}
