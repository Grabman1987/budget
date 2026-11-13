import { expect, it } from 'vitest';
import { distributionFill, distributionGaps, distributionPass, takeBackPlan } from './distribute';

const row = (
  id: string,
  stage: number | null,
  sortOrder: number,
  needCents: number,
  overspentCents = 0,
  isCard = false,
) => ({ id, stage, sortOrder, needCents, overspentCents, isCard });

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

  const short = takeBackPlan(rows.slice(1, 2), 3_000);
  expect(short.moves.map((m) => m.takeCents)).toEqual([1_500]);
  expect(short.takenCents).toBe(1_500);
  expect(short.missingCents).toBe(1_500);
  expect(takeBackPlan(rows, -500)).toEqual({ moves: [], takenCents: 0, missingCents: 0 });
});

it('reports the net assignment of the pass and the remaining state', () => {
  expect(distributionPass(120_000, 245_050, 4_950)).toEqual({
    assignedInPassCents: 125_050,
    remainingCents: 4_950,
    state: 'left',
  });
  expect(distributionPass(50_000, 50_000, 0).state).toBe('balanced');
  expect(distributionPass(50_000, 40_000, -1_234)).toEqual({
    assignedInPassCents: -10_000,
    remainingCents: -1_234,
    state: 'over',
  });
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
