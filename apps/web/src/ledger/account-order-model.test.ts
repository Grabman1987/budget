import { describe, expect, it } from 'vitest';
import {
  applyOrder,
  clampDrag,
  dragTarget,
  fullOrderWith,
  moveTo,
  shiftFor,
  stepId,
} from './account-order-model';
import type { AccountRow } from './types';

type Row = Pick<AccountRow, 'id' | 'name' | 'type' | 'onBudget' | 'sortOrder' | 'closedAt'>;
const row = (id: string, sortOrder: number, over: Partial<Row> = {}): Row => ({
  id,
  name: id,
  type: 'checking',
  onBudget: true,
  sortOrder,
  closedAt: null,
  ...over,
});

describe('step and move', () => {
  it('moves one step and stays at the ends', () => {
    expect(stepId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(stepId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(stepId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(stepId(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(stepId(['a', 'b'], 'x', 1)).toEqual(['a', 'b']);
  });
  it('places an entry at the target index of the result', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('fullOrderWith', () => {
  const accounts = [
    row('card', 2, { type: 'credit_card' }),
    row('cash', 1),
    row('giro', 3),
    row('depot', 4, { type: 'brokerage', onBudget: false }),
    row('old', 5, { closedAt: '2026-01-01' }),
  ];
  it('keeps the groups in their order and replaces one group, closed accounts last', () => {
    expect(fullOrderWith(accounts, 'budget', ['giro', 'cash'])).toEqual([
      'giro',
      'cash',
      'card',
      'depot',
      'old',
    ]);
  });
  it('keeps members a partial list leaves out, behind the listed ones', () => {
    expect(
      fullOrderWith([...accounts, row('spar', 6, { type: 'savings' })], 'budget', ['spar']),
    ).toEqual(['spar', 'cash', 'giro', 'card', 'depot', 'old']);
  });
});

describe('applyOrder', () => {
  it('numbers by the order and keeps unlisted accounts behind in their order', () => {
    const next = applyOrder([row('a', 1), row('b', 2), row('c', 3)], ['c']);
    expect(next.map((a) => [a.id, a.sortOrder])).toEqual([
      ['a', 2],
      ['b', 3],
      ['c', 1],
    ]);
  });
});

describe('drag geometry', () => {
  const boxes = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, top: 100 + i * 40, height: 40 }));
  it('drops by the dragged row centre against the others', () => {
    expect(dragTarget(boxes, 'a', 0)).toBe(0);
    expect(dragTarget(boxes, 'a', 20)).toBe(0);
    expect(dragTarget(boxes, 'a', 41)).toBe(1); // centre passed the middle of b
    expect(dragTarget(boxes, 'a', 130)).toBe(3);
    expect(dragTarget(boxes, 'a', 120)).toBe(3); // clamped end: centres meet
    expect(dragTarget(boxes, 'd', -120)).toBe(0);
    expect(dragTarget(boxes, 'd', -50)).toBe(2);
    expect(dragTarget(boxes, 'd', -500)).toBe(0);
  });
  it('keeps the dragged row inside the list', () => {
    expect(clampDrag(boxes, 'b', -500)).toBe(-40);
    expect(clampDrag(boxes, 'b', 500)).toBe(80);
    expect(clampDrag(boxes, 'b', 15)).toBe(15);
  });
  it('makes room for the dragged row', () => {
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 0, 2, 40))).toEqual([0, -40, -40, 0]);
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 3, 1, 40))).toEqual([0, 40, 40, 0]);
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 1, 1, 40))).toEqual([0, 0, 0, 0]);
  });
});
