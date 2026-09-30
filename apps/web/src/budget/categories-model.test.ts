import { describe, expect, it } from 'vitest';
import { moveCategory, sameOrder, stepCategory, stepGroup, type Order } from './categories-model';

const order: Order = [
  { id: 'wohnen', categoryIds: ['miete', 'strom'] },
  { id: 'genuss', categoryIds: ['essen'] },
];

describe('category order', () => {
  it('moves by drop: before a row or to the end of a group', () => {
    expect(moveCategory(order, 'essen', 'wohnen', 'strom')).toEqual([
      { id: 'wohnen', categoryIds: ['miete', 'essen', 'strom'] },
      { id: 'genuss', categoryIds: [] },
    ]);
    expect(moveCategory(order, 'miete', 'wohnen', null)[0]?.categoryIds).toEqual([
      'strom',
      'miete',
    ]);
  });

  it('steps with the keyboard across group borders', () => {
    expect(stepCategory(order, 'strom', -1)[0]?.categoryIds).toEqual(['strom', 'miete']);
    expect(stepCategory(order, 'strom', 1)).toEqual([
      { id: 'wohnen', categoryIds: ['miete'] },
      { id: 'genuss', categoryIds: ['strom', 'essen'] },
    ]);
    expect(stepCategory(order, 'essen', -1)[0]?.categoryIds).toEqual(['miete', 'strom', 'essen']);
    expect(sameOrder(stepCategory(order, 'miete', -1), order)).toBe(true);
    expect(stepGroup(order, 'genuss', -1).map((g) => g.id)).toEqual(['genuss', 'wohnen']);
  });
});
