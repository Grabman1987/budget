export interface NetWorthPoint {
  date: string;
  netWorthCents: number;
}

/**
 * Net worth series: account balances (liabilities are negative balances) plus investments at
 * market value. Both readers are supplied by the caller, so the same figure is computed the same
 * way on every page.
 */
export function netWorthSeries(input: {
  dates: ReadonlyArray<string>;
  balancesAt: (date: string) => ReadonlyMap<string, number>;
  investmentValueAt: (date: string) => number;
}): NetWorthPoint[] {
  return input.dates.map((date) => {
    let sum = input.investmentValueAt(date);
    for (const balance of input.balancesAt(date).values()) sum += balance;
    return { date, netWorthCents: sum };
  });
}

/** Own contribution (income - consumption + principal) versus market: the change minus the market move. */
export function netWorthAttribution(input: {
  previousCents: number;
  currentCents: number;
  marketMoveCents: number;
}): {
  changeCents: number;
  marketCents: number;
  ownCents: number;
} {
  const changeCents = input.currentCents - input.previousCents;
  return {
    changeCents,
    marketCents: input.marketMoveCents,
    ownCents: changeCents - input.marketMoveCents,
  };
}
