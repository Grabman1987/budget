import { describe, expect, it } from 'vitest';
import { quickAssignFigures, quickAssignPlan } from './quick-assign';

describe('Plan quick assignment', () => {
  const figures = quickAssignFigures('2026-10', '2026-10-15', 'c', null, 0, [
    { month: '2026-07', spending: { c: 10_001 }, assigned: {} },
    { month: '2026-08', spending: { c: 19_002 }, assigned: {} },
    { month: '2026-09', spending: { c: 30_004 }, assigned: { c: 33_333 } },
  ]);
  it('uses three complete calendar months and rounds the shared mean to cents', () => {
    expect(figures).toMatchObject({
      averageCents: 19_669,
      ghostCents: 19_002,
      lastMonthCents: 33_333,
    });
    expect(quickAssignFigures('2027-01', '2026-10-15', 'c', null, 0, []).historyMonths).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(quickAssignFigures('2026-09', '2026-10-15', 'c', null, 0, []).historyMonths).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(
      quickAssignFigures('2026-10', '2026-10-15', 'c', null, 0, [
        { month: '2026-09', spending: { c: 100 }, assigned: {} },
      ]),
    ).toMatchObject({ ghostCents: 0, averageCents: 33 });
  });
  it('prioritises existing target need, including zero, and never suggests net credits', () => {
    expect(quickAssignFigures('2026-10', '2026-10-15', 'c', {}, 123, []).ghostCents).toBe(123);
    expect(quickAssignFigures('2026-10', '2026-10-15', 'c', {}, 0, []).ghostCents).toBe(0);
    expect(
      quickAssignFigures('2026-10', '2026-10-15', 'c', null, 0, [
        { month: '2026-07', spending: { c: -100 }, assigned: {} },
        { month: '2026-08', spending: { c: -200 }, assigned: {} },
        { month: '2026-09', spending: { c: -300 }, assigned: {} },
      ]),
    ).toMatchObject({ ghostCents: 0, averageCents: 0 });
  });
  it('preserves a negative previous assignment to the cent', () => {
    expect(quickAssignFigures('2026-10', '2026-10-15', 'c', null, 0, [], -123).lastMonthCents).toBe(
      -123,
    );
  });
  const row = (categoryId: string, assignedCents = 0, ghostCents = 100) => ({
    categoryId,
    assignedCents,
    needCents: 100,
    target: {},
    quickAssign: { ...figures, ghostCents },
  });
  it('fills in caller sort order, partially fills the boundary, skips assigned rows and counts the shortfall', () => {
    expect(
      quickAssignPlan([row('b'), row('a'), row('skip', 1), row('zero', 0, 0)], 'empty', 150),
    ).toEqual({
      items: [
        { categoryId: 'b', assignedCents: 100 },
        { categoryId: 'a', assignedCents: 50 },
      ],
      changedCount: 2,
      openCount: 1,
      missingCents: 50,
    });
    expect(quickAssignPlan([row('a')], 'empty', -1)).toMatchObject({
      items: [],
      openCount: 1,
      missingCents: 100,
    });
  });
  it('can reuse released money in a multi-selection and top up the existing target need', () => {
    expect(
      quickAssignPlan([row('raise'), row('release', 40_000)], 'last-month', 30_000),
    ).toMatchObject({
      items: [
        { categoryId: 'raise', assignedCents: 33_333 },
        { categoryId: 'release', assignedCents: 33_333 },
      ],
      openCount: 0,
    });
    expect(quickAssignPlan([row('a', 10)], 'target', 100).items).toEqual([
      { categoryId: 'a', assignedCents: 110 },
    ]);
  });
});
