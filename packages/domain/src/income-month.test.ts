import { describe, expect, it } from 'vitest';
import { incomeBudgetMonth, incomeMonthDefault } from './income-month';

describe('income month decisions', () => {
  it('keeps the actual month by default and handles December and leap days', () => {
    expect(incomeBudgetMonth('2026-12-31')).toBe('2026-12');
    expect(incomeBudgetMonth('2026-12-31', true)).toBe('2027-01');
    expect(incomeBudgetMonth('2024-02-29', true)).toBe('2024-03');
  });
  it('uses payee before category before income type, including an explicit current-month rule', () => {
    const rules = [
      { scope: 'incomeType', targetId: 'salary', nextMonth: true },
      { scope: 'category', targetId: 'income', nextMonth: true },
      { scope: 'payee', targetId: 'payer-a', nextMonth: false },
    ] as const;
    expect(incomeMonthDefault(rules, null, null, 'salary')).toBe(true);
    expect(incomeMonthDefault(rules, 'payer-a', 'income', 'salary')).toBe(false);
    expect(incomeMonthDefault(rules, null, null, null)).toBe(false);
  });
});
