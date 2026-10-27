import { expect, it } from 'vitest';
import { quickAssignPlan } from './quick-assign';

const row = (categoryId: string, assignedCents: number) => ({
  categoryId, assignedCents, needCents: 0, target: null,
  quickAssign: { lastMonthCents: 0, averageCents: 0, ghostCents: 0,
    ghostSource: 'median' as const, historyMonths: [] },
});

it('resets positive and negative current-month assignments together using released cents', () => {
  expect(quickAssignPlan([row('positive', 1200), row('negative', -500)], 'reset', 0)).toEqual({
    items: [{ categoryId: 'positive', assignedCents: 0 }, { categoryId: 'negative', assignedCents: 0 }],
    changedCount: 2, openCount: 0, missingCents: 0,
  });
});
it('caps a negative assignment reset at the existing pool without inventing the missing 300 cents', () => {
  expect(quickAssignPlan([row('negative', -500)], 'reset', 200)).toEqual({
    items: [{ categoryId: 'negative', assignedCents: -300 }],
    changedCount: 1, openCount: 1, missingCents: 300,
  });
  expect(quickAssignPlan([row('zero', 0)], 'reset', 200)).toEqual({
    items: [], changedCount: 0, openCount: 0, missingCents: 0,
  });
});
it('reset needs only the assigned amount; legacy rows without optional history remain eligible', () => {
  const legacy = { categoryId: 'legacy', assignedCents: 1200, needCents: 0, target: null };
  expect(quickAssignPlan([legacy], 'reset', 0)).toEqual({
    items: [{ categoryId: 'legacy', assignedCents: 0 }], changedCount: 1, openCount: 0, missingCents: 0,
  });
  for (const mode of ['empty', 'last-month', 'average', 'target'] as const)
    expect(quickAssignPlan([legacy], mode, 200)).toEqual({ items: [], changedCount: 0, openCount: 0, missingCents: 0 });
});
