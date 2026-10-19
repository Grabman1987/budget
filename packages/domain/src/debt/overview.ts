import { lastDayOfMonth } from '../date';
import { MAX_LOAN_RATE_BP } from './loan-plan';
import { MAX_PAYOFF_MONTHS, payoffPlan, type PayoffPlan } from './payoff';

export interface DebtOverviewAccount {
  id: string;
  currency: string;
  balanceCents: number;
  interestRateBp: number | null;
  installmentCents: number | null;
  monthlyFeeCents: number | null;
  originalAmountCents: number | null;
  /**
   * Every non-loan debt (credit card, overdrawn giro) is settled on a running basis (owner decision
   * 16.10.2026): without full terms it gets no repayment plan and no "terms missing" task. Terms entered anyway are still modelled.
   */
  settledMonthly?: boolean;
}

export type DebtOverviewStatus = 'ready' | 'missing_terms' | 'invalid_terms' | 'settled_monthly';

/** Constant-condition preview. A month-end is a model convention, not a contractual due day. */
export function debtOverview(
  accounts: readonly DebtOverviewAccount[],
  startMonth: string,
  extraAccountId?: string,
  extraCents = 0,
) {
  if (!Number.isSafeInteger(extraCents) || extraCents < 0) throw new RangeError('Invalid extra');
  const rows = accounts.map((account) => {
    let plan: PayoffPlan | null = null;
    let status: DebtOverviewStatus = account.settledMonthly ? 'settled_monthly' : 'missing_terms';
    if (
      account.interestRateBp !== null &&
      account.installmentCents !== null &&
      account.monthlyFeeCents !== null
    ) {
      try {
        if (account.interestRateBp > MAX_LOAN_RATE_BP)
          throw new RangeError('Rate exceeds model limit');
        const extra = account.id === extraAccountId ? extraCents : 0;
        const worstInterest =
          (BigInt(-account.balanceCents) * BigInt(account.interestRateBp) + 119999n) / 120000n;
        if (
          BigInt(-account.balanceCents) +
            BigInt(MAX_PAYOFF_MONTHS) * (worstInterest + BigInt(account.monthlyFeeCents)) >
            BigInt(Number.MAX_SAFE_INTEGER) ||
          !Number.isSafeInteger(account.installmentCents + extra)
        )
          throw new RangeError('Unsafe cents');
        plan = payoffPlan({
          balanceCents: -account.balanceCents,
          rateBp: account.interestRateBp,
          paymentCents: account.installmentCents,
          monthlyFeeCents: account.monthlyFeeCents,
          startMonth,
          extraCents: extra,
        });
        status = 'ready';
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        status = 'invalid_terms';
      }
    }
    return { id: account.id, plan, status };
  });
  const planned = rows.filter((r) => r.plan !== null);
  const complete =
    planned.length > 0 && rows.every((r) => r.plan !== null || r.status === 'settled_monthly');
  const oneCurrency = new Set(accounts.map((a) => a.currency)).size === 1;
  const sum = (values: number[]) => {
    if (values.some((v) => !Number.isSafeInteger(v) || v < 0)) return null;
    const result = values.reduce((s, v) => s + BigInt(v), 0n);
    return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
  };
  const remainingCents = sum(accounts.map((a) => -a.balanceCents));
  const originalCents = accounts.every(
    (a) =>
      a.originalAmountCents !== null &&
      Number.isSafeInteger(a.originalAmountCents) &&
      a.originalAmountCents >= -a.balanceCents,
  )
    ? sum(accounts.map((a) => a.originalAmountCents!))
    : null;
  const month = complete
    ? planned
        .map((r) => r.plan!.withExtra.payoffMonth ?? startMonth)
        .sort()
        .at(-1)!
    : null;
  return {
    rows,
    currency: oneCurrency ? accounts[0]!.currency : null,
    payoffDate: month ? lastDayOfMonth(month) : null,
    interestCents:
      complete && oneCurrency
        ? sum(planned.map((r) => r.plan!.withExtra.totalInterestCents))
        : null,
    interestSavedCents:
      complete && oneCurrency ? sum(planned.map((r) => r.plan!.interestSavedCents)) : null,
    /** Sum of all negative balances, cards included (the debt share of the net worth); one currency only. */
    remainingCents: oneCurrency ? remainingCents : null,
    /** True while an account that must be modelled (not a card on a running basis) lacks usable terms. */
    termsOpen: rows.some((r) => r.status === 'missing_terms' || r.status === 'invalid_terms'),
    progress:
      oneCurrency && originalCents !== null && originalCents > 0 && remainingCents !== null
        ? { originalCents, remainingCents, paidCents: originalCents - remainingCents }
        : null,
  };
}
