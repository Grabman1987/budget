import {
  bankTransferTransitCents,
  sumValuationCents,
  freedomSumCents,
  ValuationLimitError,
} from '@budget/domain';
import { and, isNotNull, isNull } from 'drizzle-orm';
import { account, booking } from '../schema';
import { memoizedShared } from './request-memo';
import { accountBalances } from './queries';
import { cashValuer } from './cash-valuation';
import type { Executor } from './types';

function isBankAccount(account: { type: string }) {
  return account.type === 'checking' || account.type === 'savings';
}

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
        .filter(isBankAccount)
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

/** Display-only reconciliation of bank cash within an explicit account universe. */
export function bankTransitReconciliation(
  db: Executor,
  asOf: string,
  accountIds: readonly string[],
) {
  const selected = new Set(accountIds);
  const rows = db.select().from(account).where(isNull(account.deletedAt)).all();
  const accounts = new Map(
    rows.filter((a) => selected.has(a.id) && isBankAccount(a)).map((a) => [a.id, a]),
  );
  const transit = bankTransferTransit(db);
  const value = cashValuer(db);
  const raw: number[] = [];
  const corrected: number[] = [];
  const missingFxAccountIds: string[] = [];
  let valuationLimited = false;
  for (const balance of accountBalances(db, asOf)) {
    const acct = accounts.get(balance.accountId);
    if (!acct) continue;
    try {
      const native = cashWithBankTransit(transit, acct.id, asOf, balance.balanceCents);
      // Zero bank cash needs no exchange rate, as in cashSeries/net-worth valuation.
      const rawValue =
        balance.balanceCents === 0 ? 0 : value(balance.balanceCents, acct.currency, asOf).eurCents;
      const correctedValue = native === 0 ? 0 : value(native, acct.currency, asOf).eurCents;
      if (rawValue === null || correctedValue === null) {
        missingFxAccountIds.push(acct.id);
        continue;
      }
      raw.push(rawValue);
      corrected.push(correctedValue);
    } catch (error) {
      if (!(error instanceof ValuationLimitError) || error.boundary !== 'result') throw error;
      // Optional display evidence must not turn a previously readable source into an error.
      valuationLimited = true;
    }
  }
  const rawCashCents = missingFxAccountIds.length || valuationLimited ? null : freedomSumCents(raw);
  const cashIncludingTransitCents =
    missingFxAccountIds.length || valuationLimited ? null : freedomSumCents(corrected);
  return {
    label: 'Geld unterwegs' as const,
    asOf,
    accountIds: [...accounts.keys()].sort(),
    rawCashCents,
    transitCents:
      rawCashCents === null || cashIncludingTransitCents === null
        ? null
        : freedomSumCents([cashIncludingTransitCents, -rawCashCents]),
    cashIncludingTransitCents,
    missingFxAccountIds: missingFxAccountIds.sort(),
  };
}
