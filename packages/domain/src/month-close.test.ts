import { expect, it } from 'vitest';
import {
  closeEntryMonth,
  closeSteps,
  closePlanHistory,
  closePlanProjection,
  closeDeviations,
  monthCloseVerdict,
} from './month-close';

it('uses twelve complete tracked months including zero spending, never partial or pre-tracking months', () => {
  const rows = [
    { month: '2025-09', spending: { a: 99999 } },
    { month: '2025-10', spending: { a: 100 } },
    { month: '2026-09', spending: { a: 101 } },
    { month: '2026-10', spending: { a: 90000 } },
  ];
  expect(closePlanHistory(['a', 'b'], '2026-09', '2026-10-02', rows)).toEqual([
    { categoryId: 'a', actualCents: 101, averageCents: 101, historyCount: 2 },
    { categoryId: 'b', actualCents: 0, averageCents: 0, historyCount: 2 },
  ]);
  expect(closePlanHistory(['a'], '2026-10', '2026-10-02', rows)[0]).toEqual({
    categoryId: 'a',
    actualCents: 90000,
    averageCents: 101,
    historyCount: 2,
  });
  expect(closePlanHistory(['a'], '2023-09', '2026-10-02', rows)[0]?.averageCents).toBeNull();
});
it('counts every edited group and classless assignment in zero-based money, but only classes in 50/30/20', () => {
  const projection = closePlanProjection(
    100,
    1000,
    [
      { categoryId: 'a', class: 'need', assignedCents: 400 },
      { categoryId: 'b', class: 'want', assignedCents: 200 },
      { categoryId: 'c', class: null, assignedCents: 0 },
    ],
    { a: 500, c: 25 },
  );
  expect(projection.remainingCents).toBe(-25);
  expect(projection.allocation.needCents).toBe(500);
  expect(projection.allocation.shares).toEqual({ need: 50, want: 20, future: 0, rest: 30 });
});
it('keeps a safe monthly mean exact even when the intermediate sum exceeds the safe range', () => {
  const history = ['2026-03', '2026-04', '2026-05'].map((month) => ({
    month,
    spending: { a: 9007199254740990 },
  }));
  expect(closePlanHistory(['a'], '2026-05', '2026-06-01', history)[0]?.averageCents).toBe(
    9007199254740990,
  );
});
it('ranks both signs by absolute plan deviation and words the same factual result for report and review', () => {
  expect(
    closeDeviations([
      { categoryId: 'a', name: 'A', assignedCents: 100, carryCents: 20, activityCents: -220 },
      { categoryId: 'b', name: 'B', assignedCents: 300, carryCents: 0, activityCents: -50 },
      { categoryId: 'c', name: 'C', assignedCents: 0, carryCents: 0, activityCents: 0 },
      { categoryId: 'd', name: 'D', assignedCents: 10, carryCents: 0, activityCents: -60 },
      { categoryId: 'e', name: 'E', assignedCents: 10, carryCents: 0, activityCents: -20 },
    ]).map((r) => [r.categoryId, r.deltaCents]),
  ).toEqual([
    ['b', -250],
    ['a', 100],
    ['d', 50],
  ]);
  expect(
    monthCloseVerdict({ earnedCents: 1000, consumptionCents: 800, savedCents: 200 }, String),
  ).toBe('Von 1000 Einnahmen bleiben nach 800 Konsum 200 gespart.');
});

it('offers the previous month for the first five days and the current month for the last five', () => {
  expect(
    ['2026-01-01', '2026-01-05', '2026-01-06', '2026-02-23', '2026-02-24', '2026-02-28'].map(
      closeEntryMonth,
    ),
  ).toEqual(['2025-12', '2025-12', null, null, '2026-02', '2026-02']);
});
it('never treats the future steps as completed and only accepts the matching work version', () => {
  const work = [{ step: 3 as const, id: 'category', fingerprint: '200' }];
  const decisions = [{ ...work[0]!, reason: 'Übertrag akzeptiert' }];
  expect(closeSteps(work, decisions).map((s) => s.status)).toEqual([
    'done',
    'done',
    'skipped',
    'following',
    'following',
  ]);
  expect(closeSteps([{ ...work[0]!, fingerprint: '201' }], decisions)[2]?.status).toBe('open');
});
