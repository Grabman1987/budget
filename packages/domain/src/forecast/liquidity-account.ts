/** Shared EUR cash-planning scope, as of today (not the forecast payment date). */
export function isLiquidityAccount(
  a: {
    onBudget: boolean;
    role: string | null;
    closedAt: string | null;
    openingDate: string;
    currency: string;
  },
  today: string,
): boolean {
  return (
    a.onBudget &&
    a.role === 'budget' &&
    a.closedAt === null &&
    a.openingDate <= today &&
    a.currency === 'EUR'
  );
}
