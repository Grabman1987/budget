import { expect, it } from 'vitest';
import { categoryTrend, type TableMonth } from './tables';

it('aligns the selected months and previous-year months, keeping absent data distinct from zero', () => {
  const month = (month: string, spending: Record<string, number>): TableMonth => ({
    month,
    spending,
    assigned: {},
    income: {},
    netWorthCents: null,
    moneyAgeDays: null,
  });
  expect(
    categoryTrend(
      [month('2025-02', { food: -123 }), month('2026-01', { food: 10001 }), month('2026-02', {})],
      'food',
      ['2026-01', '2026-02', '2026-03'],
    ),
  ).toEqual([
    { month: '2026-01', spentCents: 10001, assignedCents: 0, previousCents: null },
    { month: '2026-02', spentCents: 0, assignedCents: 0, previousCents: -123 },
    { month: '2026-03', spentCents: null, assignedCents: null, previousCents: null },
  ]);
});
