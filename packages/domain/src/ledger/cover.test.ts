import { expect, it } from 'vitest';
import { coverPlan } from './cover';

it('uses largest sources in order, partially covers the next target and stops at zero', () => {
  const targets = [
    { id: 'a', overspentCents: 1200 },
    { id: 'b', overspentCents: 2000 },
    { id: 'c', overspentCents: 300 },
  ];
  const sources = [
    { id: 'small', availableCents: 500 },
    { id: 'large', availableCents: 2000 },
  ];
  expect(coverPlan(targets, sources)).toEqual({
    moves: [
      { fromId: 'large', toId: 'a', amountCents: 1200 },
      { fromId: 'large', toId: 'b', amountCents: 800 },
      { fromId: 'small', toId: 'b', amountCents: 500 },
    ],
    coveredCount: 1,
    openCount: 2,
    missingCents: 1000,
  });
  expect(sources[1]!.availableCents).toBe(2000);
  expect(coverPlan(targets, [{ id: null, availableCents: 3500 }])).toMatchObject({
    coveredCount: 3,
    openCount: 0,
    missingCents: 0,
  });
});
