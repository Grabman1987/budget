import { nextMonth } from './date';

/** Cash keeps its booking date; only budget income moves to the following month. */
export const incomeBudgetMonth = (date: string, incomeNextMonth = false): string =>
  incomeNextMonth ? nextMonth(date.slice(0, 7)) : date.slice(0, 7);

export interface IncomeMonthRule {
  scope: 'payee' | 'category' | 'incomeType';
  targetId: string;
  nextMonth: boolean;
}

/** Specific payee overrides category, then income type. No rule changes existing bookings. */
export function incomeMonthDefault(
  rules: readonly IncomeMonthRule[],
  payeeId: string | null | undefined,
  categoryId: string | null | undefined,
  incomeTypeId: string | null | undefined,
): boolean {
  for (const [scope, targetId] of [
    ['payee', payeeId],
    ['category', categoryId],
    ['incomeType', incomeTypeId],
  ] as const) {
    const rule = rules.find((r) => r.scope === scope && r.targetId === targetId);
    if (rule) return rule.nextMonth;
  }
  return false;
}
