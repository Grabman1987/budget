import {
  feeBreakdownLast12Months,
  incomeLast12Months,
  monthEnds,
  taxBreakdownLast12Months,
  type ProductTrade,
} from '@budget/domain';

/** Display-only residual of the canonical gain; unavailable if any input/result exceeds cents. */
export function recordedGainResidual(
  gain: number,
  income: number,
  fees: number,
  taxes: number,
): number | null {
  if (![gain, income, fees, taxes].every(Number.isSafeInteger)) return null;
  const residual = Number(BigInt(gain) - BigInt(income) + BigInt(fees) + BigInt(taxes));
  return Number.isSafeInteger(residual) ? residual : null;
}

/** Presentation grouping only. Each monthly subset uses the existing booked-amount conventions. */
export function recordedComponents(trades: readonly ProductTrade[], from: string, to: string) {
  return monthEnds(from, to).map(({ month, date }) => {
    const source = trades.filter(
      (row) => row.date > from && row.date <= to && row.date.slice(0, 7) === month,
    );
    // A month is always inside this helper's twelve-month window, even for an Alles report.
    const end = date < to ? date : to;
    return {
      month,
      incomeCents: incomeLast12Months(source, end).grossCents,
      feesCents: feeBreakdownLast12Months(source, end).totalCents,
      taxesCents: taxBreakdownLast12Months(source, end).totalCents,
    };
  });
}
