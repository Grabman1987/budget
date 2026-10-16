import type { PortfolioPositionsView, PositionAccount, PositionQuote } from '@budget/db';
import { shareBps } from '@budget/domain';

export interface DepotHolding extends PositionAccount {
  securityId: string;
  securityName: string;
  quote: PositionQuote | null;
  shareBp: number | null;
}

/** Account slice of the same unsplit positions shown by Portfolio. */
export function depotHoldings(
  view: PortfolioPositionsView,
  accountId: string,
): {
  asOf: string;
  rows: DepotHolding[];
  valueCents: number | null;
  incomplete: boolean;
} {
  const rows: DepotHolding[] = view.positions.flatMap((p) =>
    p.accounts
      .filter((a) => a.accountId === accountId)
      .map((a) => ({
        ...a,
        securityId: p.securityId,
        securityName: p.name,
        quote: a.valuationQuote === undefined ? p.quote : a.valuationQuote,
        shareBp: null,
      })),
  );
  // A missing price leaves its row unvalued; the depot shows the known sum as "≈" (page review
  // 16.10.) and is unavailable only when no row has a value.
  const valued = rows.filter((r) => r.valueCents !== null);
  const valueCents =
    rows.length > 0 && valued.length === 0
      ? null
      : valued.reduce((sum, r) => sum + r.valueCents!, 0);
  if (valueCents !== null && valueCents > 0 && valued.length === rows.length)
    shareBps(
      rows.map((r) => r.valueCents!),
      valueCents,
    ).forEach((bp, i) => {
      rows[i]!.shareBp = bp;
    });
  return {
    asOf: view.asOf,
    rows,
    valueCents,
    incomplete: rows.some((r) => r.valueStatus !== 'known'),
  };
}
