import { expect, it } from 'vitest';
import { automaticAssignment } from './plan-automatic';

const figures = (lastMonthCents: number, averageCents: number, ghostCents: number) => ({
  lastMonthCents,
  averageCents,
  ghostCents,
  ghostSource: 'median' as const,
  historyMonths: [],
});
const rows = [
  {
    categoryId: 'a',
    assignedCents: 400,
    needCents: 600,
    target: {},
    quickAssign: figures(1000, 300, 600),
  },
  {
    categoryId: 'b',
    assignedCents: 0,
    needCents: 0,
    target: null,
    quickAssign: figures(200, 200, 200),
  },
];
it.each([
  ['last-month', 500, 300, [900, 0]],
  ['average', 100, 0, [300, 200]],
  ['target', 500, 100, [900, 0]],
  ['empty', 200, 0, [400, 200]],
  ['reset', -400, 0, [0, 0]],
] as const)(
  '%s displays the exact signed booked delta, including the capped boundary',
  (mode, delta, missing, after) => {
    const preview = automaticAssignment(rows, mode, 500);
    expect(preview.deltaCents).toBe(delta);
    expect(preview.missingCents).toBe(missing);
    const items = new Map(preview.items.map((item) => [item.categoryId, item.assignedCents]));
    expect(rows.map((row) => items.get(row.categoryId) ?? row.assignedCents)).toEqual(after);
  },
);
it('uses only the supplied visible/selected rows, and keeps a capped negative reset signed positive', () => {
  expect(automaticAssignment([rows[1]!], 'last-month', 500).deltaCents).toBe(200);
  expect(automaticAssignment([{ ...rows[0]!, assignedCents: -500 }], 'reset', 200)).toMatchObject({
    deltaCents: 200,
    missingCents: 300,
  });
  expect(automaticAssignment([rows[1]!], 'reset', 500).deltaCents).toBe(0);
});
