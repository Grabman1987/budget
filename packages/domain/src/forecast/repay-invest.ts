import { simulateLoan, type LoanTermsInput } from '../debt/loan-plan';
import { cents } from '../money/cents';
import { mulDivRound } from '../wealth/int';
import type { AccountLiquidityResult } from './liquidity';

export type RepaymentTarget = { id: string; name: string; owedCents: number } & (
  { kind: 'loan'; terms: LoanTermsInput | null } | { kind: 'overdraft'; rateBp: number | null }
);

/** Both options use the same F3 cash paths and F6 reserve basis. Only the immediate cash legs vary. */
export function compareRepaymentAndInvestment({
  paths,
  sourceId,
  amountCents,
  debt,
  reserveCashCents,
  committedReservesCents,
  returnRangeBp,
}: {
  paths: AccountLiquidityResult['withoutExpectedInflows'];
  sourceId: string;
  amountCents: number;
  debt: RepaymentTarget;
  reserveCashCents: number;
  committedReservesCents: number;
  returnRangeBp: readonly [number, number];
}) {
  const accounts = paths.accounts.filter((account) => account.paymentAccount);
  const source = accounts.find((account) => account.accountId === sourceId);
  if (
    !source ||
    sourceId === debt.id ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !returnRangeBp.every(Number.isSafeInteger) ||
    returnRangeBp[0] > returnRangeBp[1]
  )
    return null;

  const project = (creditId: string | null) => {
    const lows = accounts.map((account) => ({
      accountId: account.accountId,
      name: account.name,
      day: account.low.day,
      cents: cents(
        account.low.cents +
          (account.accountId === sourceId ? -amountCents : 0) +
          (account.accountId === creditId ? amountCents : 0),
      ),
      bufferCents: account.bufferCents,
    }));
    // Both legs of a transfer within the F3 cash scope cancel in the household.
    const householdDelta = creditId === null ? -amountCents : 0;
    const low = lows.reduce((a, b) =>
      b.cents < a.cents || (b.cents === a.cents && b.day < a.day) ? b : a,
    );
    const householdCash = cents(
      Math.min(reserveCashCents, paths.household.low.cents) + householdDelta,
    );
    const reservesIntact =
      Math.max(0, householdCash) >= committedReservesCents &&
      lows.every((account) => account.bufferCents === null || account.cents >= account.bufferCents);
    return {
      low,
      reservesIntact,
      householdCovered: householdCash >= 0,
      sourceCovered: source.balanceTodayCents >= amountCents,
    };
  };
  const creditId = accounts.some((account) => account.accountId === debt.id) ? debt.id : null;
  try {
    return {
      repay:
        amountCents <= debt.owedCents
          ? { ...project(creditId), interestSavedCents: annualInterestSaved(debt, amountCents) }
          : null,
      invest: {
        ...project(null),
        returnRangeCents: returnRangeBp.map((bp) => cents(mulDivRound(amountCents, bp, 10_000))),
      },
    };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function annualInterestSaved(debt: RepaymentTarget, amountCents: number): number | null {
  if (debt.kind === 'overdraft')
    return debt.rateBp === null ? null : cents(mulDivRound(amountCents, debt.rateBp, 10_000));
  const terms = debt.terms;
  if (!terms) return null;
  const firstYearInterest = (balanceCents: number) =>
    simulateLoan({ ...terms, balanceCents })
      .rows.slice(0, 12)
      .reduce((sum, row) => sum + row.interestCents, 0);
  try {
    return cents(
      firstYearInterest(debt.owedCents) - firstYearInterest(debt.owedCents - amountCents),
    );
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
