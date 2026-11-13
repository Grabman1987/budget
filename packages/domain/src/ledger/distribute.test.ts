import { expect, it } from 'vitest';
import {
  coverFromToBeAssigned,
  distributionFill,
  distributionGaps,
  distributionPass,
  passTotals,
  takeBackPlan,
} from './distribute';

const row = (
  id: string,
  stage: number | null,
  sortOrder: number,
  needCents: number,
  overspentCents = 0,
  isCard = false,
) => ({ id, stage, sortOrder, needCents, overspentCents, availableCents: -overspentCents, isCard });

it('lists overspent and underfunded envelopes in waterfall priority with their totals', () => {
  const gaps = distributionGaps([
    row('fun', 7, 0, 5_000),
    row('rent', 1, 3, 80_000),
    row('food', 2, 1, 12_550, 2_340),
    row('card', 1, 2, 9_900, 0, true),
    row('none', null, 4, 1_000),
    row('done', 3, 5, 0),
  ]);
  expect(gaps.overspent.map((r) => r.id)).toEqual(['food']);
  expect(gaps.underfunded.map((r) => r.id)).toEqual(['rent', 'food', 'fun', 'none']);
  expect(gaps.overspentCents).toBe(2_340);
  expect(gaps.needCents).toBe(98_550);
});

it('takes an over-assignment back from free money, lowest priority first, never past free', () => {
  const rows = [
    { id: 'rent', stage: 1, sortOrder: 0, assignedCents: 80_000, freeCents: 80_000 },
    { id: 'fun', stage: 7, sortOrder: 1, assignedCents: 4_000, freeCents: 1_500 },
    { id: 'trip', stage: 6, sortOrder: 2, assignedCents: 10_000, freeCents: 25_000 },
    { id: 'card', stage: 9, sortOrder: 3, assignedCents: 5_000, freeCents: 5_000, isCard: true },
  ];
  const plan = takeBackPlan(rows, 12_000);
  expect(plan.moves.map((m) => [m.row.id, m.takeCents])).toEqual([
    ['fun', 1_500],
    ['trip', 10_000],
    ['rent', 500],
  ]);
  expect(plan.takenCents).toBe(12_000);
  expect(plan.missingCents).toBe(0);
  expect(plan.reason).toBeNull();

  const short = takeBackPlan(rows.slice(1, 2), 3_000);
  expect(short.moves.map((m) => m.takeCents)).toEqual([1_500]);
  expect(short.takenCents).toBe(1_500);
  expect(short.missingCents).toBe(1_500);
  expect(short.reason).toBe('free');
  expect(takeBackPlan(rows, -500)).toEqual({
    moves: [],
    takenCents: 0,
    missingCents: 0,
    reason: null,
  });
  // Assigned 100,00 €, free 250,00 € (carry), over 200,00 €: limited by the assignment.
  const capped = takeBackPlan(
    [{ id: 'trip', stage: 6, sortOrder: 0, assignedCents: 10_000, freeCents: 25_000 }],
    20_000,
  );
  expect(capped.moves.map((m) => m.takeCents)).toEqual([10_000]);
  expect(capped).toMatchObject({ takenCents: 10_000, missingCents: 10_000, reason: 'assigned' });
});

it('reports the remaining state of "Zu verteilen"', () => {
  expect(distributionPass(4_950).state).toBe('left');
  expect(distributionPass(0).state).toBe('balanced');
  expect(distributionPass(-1_234)).toEqual({ remainingCents: -1_234, state: 'over' });
});

it("sums only the flow's own successful writes; take-backs stay apart; undone writes drop out", () => {
  const totals = passTotals(
    [
      { kind: 'assign', cents: 80_000 },
      { kind: 'cover', cents: 2_340 },
      { kind: 'take', cents: 1_500 },
      { kind: 'assign', cents: 5_000, undone: true },
    ],
    200_000,
    290_840,
  );
  expect(totals).toEqual({
    assignedCents: 82_340,
    takenBackCents: 1_500,
    externalCents: 10_000,
  });
  // Opened with 2.000,00 € assigned, +300,00 € assigned elsewhere: nothing by this flow.
  expect(passTotals([], 200_000, 230_000)).toEqual({
    assignedCents: 0,
    takenBackCents: 0,
    externalCents: 30_000,
  });
});

it('covers overspending from "Zu verteilen" only up to what is there, same rows for count and sum', () => {
  const rows = [row('food', 2, 0, 0, 2_340), row('cardcat', 3, 1, 0, 4_000)];
  const short = coverFromToBeAssigned(rows, 100);
  expect(short.items.map((i) => [i.row.id, i.coverCents])).toEqual([['food', 100]]);
  expect(short).toMatchObject({
    count: 2,
    totalCents: 6_340,
    coveredCents: 100,
    uncoveredCents: 6_240,
    coversAll: false,
  });
  const exact = coverFromToBeAssigned(rows, 6_340);
  expect(exact.items.map((i) => i.coverCents)).toEqual([2_340, 4_000]);
  expect(exact).toMatchObject({ coveredCents: 6_340, uncoveredCents: 0, coversAll: true });
  expect(coverFromToBeAssigned(rows, 0)).toMatchObject({ items: [], coversAll: false });
  expect(coverFromToBeAssigned([], 5_000)).toMatchObject({ count: 0, coversAll: false });
});

it('fills needs top-down from "Zu verteilen" and keeps the rest unassigned', () => {
  const rows = [
    row('fun', 7, 0, 5_000),
    row('rent', 1, 3, 80_000),
    row('food', 2, 1, 12_550),
    row('card', 1, 2, 9_900, 0, true),
  ];
  const plan = distributionFill(rows, 90_000);
  expect(plan.items.map((i) => [i.row.id, i.addCents])).toEqual([
    ['rent', 80_000],
    ['food', 10_000],
  ]);
  expect(plan.totalCents).toBe(90_000);
  expect(plan.leftCents).toBe(0);
  const rich = distributionFill(rows, 100_000);
  expect(rich.items.map((i) => i.addCents)).toEqual([80_000, 12_550, 5_000]);
  expect(rich.totalCents).toBe(97_550);
  expect(rich.leftCents).toBe(2_450);
  expect(distributionFill(rows, -500)).toEqual({ items: [], totalCents: 0, leftCents: 0 });
});
