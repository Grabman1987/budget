import { expect, it } from 'vitest';
import { paymentCoverage, unfundedSavingsGoals } from './attention';

it('reserves category money for repeated bills in due order, separately per month', () => {
  const bill = {
    kind: 'outflow' as const,
    status: 'expected',
    categoryId: 'food',
    amountCents: -600,
  };
  const result = paymentCoverage(
    [
      { ...bill, dueDate: '2026-10-12' },
      { ...bill, dueDate: '2026-10-05' },
      { ...bill, dueDate: '2026-10-01', status: 'received' },
      { ...bill, dueDate: '2026-11-01' },
      { ...bill, dueDate: '2026-11-02', categoryId: null },
    ],
    { '2026-10': { food: 1000 }, '2026-11': { food: 600 } },
  );
  expect(result.map((p) => p.covered)).toEqual([null, true, false, true, false]);
});

it('finds monthly savings shortfalls without counting adopted envelope targets twice', () => {
  const base = {
    id: 'goal',
    categoryId: null,
    targetDate: '2026-12-31',
    savedCents: 1000,
    remainingCents: 2000,
    neededMonthlyCents: 500,
  };
  const goals = [
    { ...base, id: 'short', savedCents: 1200 },
    { ...base, id: 'funded', savedCents: 1500 },
    { ...base, id: 'adopted', categoryId: 'travel' },
    { ...base, id: 'reached', remainingCents: 0 },
    { ...base, id: 'undated', targetDate: null },
  ];
  const previous = goals.map((g) => ({ ...g, savedCents: 1000 }));
  expect(unfundedSavingsGoals(goals, previous, ['travel']).map((g) => g.id)).toEqual(['short']);
});
