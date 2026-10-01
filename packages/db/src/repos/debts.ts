import type { Executor } from './types';
import { accountSummaries, type AccountSummary } from './ledger-queries';
import { netWorthValuationAsOf } from './portfolio';

export type DebtAccount = AccountSummary & {
  owedEurCents: number | null;
  unavailableReason: 'missing_fx' | 'missing_price' | 'calculation_limit' | null;
  missingFxCurrencies: string[];
  missingPriceSecurityIds: string[];
};
export interface DebtsView {
  asOf: string;
  totalEurCents: number | null;
  unavailableReason: 'calculation_limit' | null;
  accounts: DebtAccount[];
}

/** The same negative account values as wealth composition, without strict unrelated history. */
export function debtsAsOf(db: Executor, asOf: string): DebtsView {
  const valuation = netWorthValuationAsOf(db, asOf);
  const accounts = accountSummaries(db, asOf).flatMap((account): DebtAccount[] => {
    const value = valuation.byAccount[account.id] ?? null;
    if (value === null ? account.balanceCents >= 0 : value >= 0) return [];
    if (!Number.isSafeInteger(account.balanceCents))
      throw new RangeError('Debt principal exceeds the safe integer range');
    const unsafe = value !== null && !Number.isSafeInteger(value);
    return [
      {
        ...account,
        owedEurCents: value === null || unsafe ? null : -value,
        unavailableReason: unsafe
          ? 'calculation_limit'
          : valuation.missingPriceByAccount[account.id]?.length
            ? 'missing_price'
            : value === null
              ? 'missing_fx'
              : null,
        missingFxCurrencies: valuation.missingFxByAccount[account.id] ?? [],
        missingPriceSecurityIds: valuation.missingPriceByAccount[account.id] ?? [],
      },
    ];
  });
  const total = accounts.some((a) => a.owedEurCents === null)
    ? null
    : accounts.reduce((sum, a) => sum + a.owedEurCents!, 0);
  return {
    asOf,
    accounts,
    unavailableReason: total !== null && !Number.isSafeInteger(total) ? 'calculation_limit' : null,
    totalEurCents: total !== null && !Number.isSafeInteger(total) ? null : total,
  };
}
