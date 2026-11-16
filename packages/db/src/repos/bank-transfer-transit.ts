import { bankTransferTransitCents, sumValuationCents } from '@budget/domain';
import { and, isNotNull, isNull } from 'drizzle-orm';
import { account, booking } from '../schema';
import { memoizedShared } from './request-memo';
import type { Executor } from './types';

/** Whole same-currency bank transfers only; no synthetic ledger rows or balance adjustments. */
export function bankTransferTransit(db: Executor) {
  return memoizedShared(db, 'bankTransferTransit', () => {
    const banks = new Map(
      db
        .select({
          id: account.id,
          type: account.type,
          currency: account.currency,
          openingDate: account.openingDate,
        })
        .from(account)
        .where(isNull(account.deletedAt))
        .all()
        .filter((a) => a.type === 'checking' || a.type === 'savings')
        .map((a) => [a.id, a]),
    );
    const pairs = new Map<string, (typeof booking.$inferSelect)[]>();
    for (const row of db
      .select()
      .from(booking)
      .where(and(isNull(booking.deletedAt), isNotNull(booking.transferId)))
      .all()) {
      const pair = pairs.get(row.transferId!) ?? [];
      pair.push(row);
      pairs.set(row.transferId!, pair);
    }
    const byRecipient = new Map<
      string,
      { debitDate: string; receiptDate: string; amountCents: number }[]
    >();
    for (const pair of pairs.values()) {
      const debit = pair.find((b) => b.amountCents < 0);
      const receipt = pair.find((b) => b.amountCents > 0);
      if (pair.length !== 2 || !debit || !receipt || debit.amountCents !== -receipt.amountCents)
        continue;
      const from = banks.get(debit.accountId),
        to = banks.get(receipt.accountId);
      if (
        !from ||
        !to ||
        from.currency !== to.currency ||
        debit.date < from.openingDate ||
        receipt.date < to.openingDate ||
        debit.date < to.openingDate ||
        debit.date === receipt.date
      )
        continue;
      const rows = byRecipient.get(receipt.accountId) ?? [];
      rows.push({
        debitDate: debit.date,
        receiptDate: receipt.date,
        amountCents: receipt.amountCents,
      });
      byRecipient.set(receipt.accountId, rows);
    }
    return byRecipient;
  });
}

export function cashWithBankTransit(
  transfers: ReturnType<typeof bankTransferTransit>,
  accountId: string,
  asOf: string,
  cashCents: number,
) {
  const terms = (transfers.get(accountId) ?? []).map((t) =>
    bankTransferTransitCents(t.debitDate, t.receiptDate, t.amountCents, asOf),
  );
  // Sum once: large opposing cash/transit terms may still have a safe final native value.
  return terms.some((cents) => cents !== 0) ? sumValuationCents([cashCents, ...terms]) : cashCents;
}
