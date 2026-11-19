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

/** Accounts that can fund payments; retain the wider legacy household scope separately. */
export function isPaymentAccount(
  a: Parameters<typeof isLiquidityAccount>[0] & { type: string },
  today: string,
): boolean {
  return isLiquidityAccount(a, today) && ['checking', 'cash', 'savings'].includes(a.type);
}
