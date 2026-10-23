import { expect, it } from 'vitest';
import { freedomGoalAxis } from './freedom-goal-model';
import { freedomHistoryModel } from './freedom-history-model';

it('shows a January deadline after an early forecast finish without inventing samples or changing cents', () => {
  const dates = ['2026-10-19', '2027-02-28'];
  const copy = structuredClone(dates);
  const axis = freedomGoalAxis(dates, '2026-10', 2030);
  expect(axis.first).toBe('2026-10-19');
  expect(axis.last).toBe('2030-01-31');
  expect(axis.goalDate).toBe('2030-01-31');
  expect(axis.position(axis.first)).toBe(0);
  expect(axis.position(axis.goalDate)).toBe(1);
  expect(axis.position('2027-02-28')).toBeGreaterThan(0);
  expect(axis.position('2027-02-28')).toBeLessThan(1);
  expect(dates).toEqual(copy);
});

it('keeps exact null gaps and current samples when the deadline is before the available history', () => {
  const history = {
    availableFrom: '2023-10-01',
    monthEnds: [
      { date: '2023-10-31', investedCents: 10000 },
      { date: '2023-11-30', investedCents: null },
    ],
    current: { date: '2023-12-19', investedCents: 12000 },
  };
  const model = freedomHistoryModel(history, null, '2023-12');
  const before = structuredClone({
    actual: model.actual,
    segments: model.segments,
    forecast: model.forecast,
    dates: model.dates,
  });
  const axis = freedomGoalAxis(model.dates, '2023-12', 2020);
  expect(axis.first).toBe('2020-01-31');
  expect(axis.position(axis.goalDate)).toBe(0);
  expect({
    actual: model.actual,
    segments: model.segments,
    forecast: model.forecast,
    dates: model.dates,
  }).toEqual(before);
  expect(model.forecast).toEqual([]);
  expect(model.actual.map((point) => point.investedCents)).toEqual([10000, null, 12000]);
});
