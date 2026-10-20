import type { Executor } from './types';
import { accountSummaries, type AccountSummary } from './ledger-queries';
import { fallibleNetWorthValuationAsOf } from './portfolio';
import { sumValuationCents, ValuationLimitError } from '@budget/domain';

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
  const { valuation, calculationLimitAccountIds, calculationLimitAccountSigns } =
    fallibleNetWorthValuationAsOf(db, asOf);
  const calculationLimits = new Set(calculationLimitAccountIds);
  const accounts = accountSummaries(db, asOf).flatMap((account): DebtAccount[] => {
    const value = valuation.byAccount[account.id] ?? null;
    const resultSign = calculationLimitAccountSigns[account.id];
    if (value === null ? (resultSign ?? Math.sign(account.balanceCents)) >= 0 : value >= 0)
      return [];
    if (!Number.isSafeInteger(account.balanceCents))
      throw new RangeError('Debt principal exceeds the safe integer range');
    const unsafe =
      calculationLimits.has(account.id) || (value !== null && !Number.isSafeInteger(value));
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
  let total: number | null = null;
  let totalLimit = false;
  if (!accounts.some((a) => a.owedEurCents === null)) {
    try {
      total = sumValuationCents(accounts.map((a) => a.owedEurCents!));
    } catch (error) {
      if (!(error instanceof ValuationLimitError) || error.boundary !== 'result') throw error;
      totalLimit = true;
    }
  }
  return {
    asOf,
    accounts,
    unavailableReason: totalLimit ? 'calculation_limit' : null,
    totalEurCents: total,
  };
}
