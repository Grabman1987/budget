import { expect, it } from 'vitest';
import type { PortfolioPerformanceHistory } from '@budget/db';
import { groupPerformanceClasses } from './portfolio-performance-comparisons';

it('uses current holdings rather than historical end value to group classes without losing history', () => {
  const classes = [
    { assetClassId: 'sold', name: 'Sold class', valueCents: 10000, currentHolding: false },
    { assetClassId: 'held', name: 'Held at zero', valueCents: 0, currentHolding: true },
    { assetClassId: 'empty', name: 'Unused class', valueCents: 0, currentHolding: false },
    { assetClassId: null, name: 'Unclassified', valueCents: 2000, currentHolding: true },
  ] as PortfolioPerformanceHistory['classes'];
  const groups = groupPerformanceClasses(classes);
  expect(groups.current.map((c) => c.assetClassId)).toEqual(['held', null]);
  expect(groups.historical.map((c) => c.assetClassId)).toEqual(['sold', 'empty']);
  expect(groups.historical[0]).toBe(classes[0]);
  expect(groupPerformanceClasses([])).toEqual({ current: [], historical: [] });
});
