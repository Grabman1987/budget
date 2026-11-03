import {
  feeBreakdownLast12Months,
  incomeLast12Months,
  monthEnds,
  taxBreakdownLast12Months,
  type ProductTrade,
} from '@budget/domain';

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
