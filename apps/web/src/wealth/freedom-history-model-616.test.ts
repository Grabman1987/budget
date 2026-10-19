import { expect, it } from 'vitest';
import { projectFreedom } from '@budget/domain';
import { freedomHistoryModel } from './freedom-history-model';

it('splits literal null gaps, deduplicates the current month end and uses real day distances', () => {
  const model = freedomHistoryModel(
    {
      availableFrom: '2023-10-01',
      monthEnds: [
        { date: '2023-10-31', investedCents: 100 },
        { date: '2023-11-30', investedCents: null },
        { date: '2023-12-31', investedCents: 300 },
      ],
      current: { date: '2023-12-31', investedCents: 300 },
    },
    null,
    '2023-12',
  );
  expect(model.actual).toHaveLength(3);
  expect(model.segments).toEqual([
    [{ date: '2023-10-31', investedCents: 100 }],
    [{ date: '2023-12-31', investedCents: 300 }],
  ]);
  expect(model.position('2023-11-30')).toBeCloseTo(30 / 61);
  expect(model.forecast).toEqual([]);
});

it('preserves the shared projector final partial year, overshoot and exact current anchor date', () => {
  const projection = projectFreedom({
    investedCents: 10000,
    monthlySavingCents: 3000,
    realReturnBp: 0,
    targetCents: 50000,
    startMonth: '2024-02',
  });
  const model = freedomHistoryModel(
    {
      availableFrom: '2024-02-01',
      monthEnds: [],
      current: { date: '2024-02-15', investedCents: 10000 },
    },
    projection,
    '2024-02',
  );
  expect(model.forecast).toEqual([
    { date: '2024-02-15', investedCents: 10000 },
    { date: '2025-02-28', investedCents: 46000 },
    { date: '2025-04-30', investedCents: 52000 },
  ]);
});

it('does not plot invented current zero before coverage and retains actual history without a forecast', () => {
  expect(
    freedomHistoryModel(
      { availableFrom: null, monthEnds: [], current: { date: '2024-02-15', investedCents: 0 } },
      null,
      '2024-02',
    ).segments,
  ).toEqual([]);
  const model = freedomHistoryModel(
    {
      availableFrom: '2023-10-01',
      monthEnds: [{ date: '2023-10-31', investedCents: 12345 }],
      current: { date: '2024-02-15', investedCents: null },
    },
    null,
    '2024-02',
  );
  expect(model.segments).toEqual([[{ date: '2023-10-31', investedCents: 12345 }]]);
});

it('keeps a finite unreachable horizon rather than clipping or inventing a reached goal', () => {
  const projection = projectFreedom({
    investedCents: 0,
    monthlySavingCents: 0,
    realReturnBp: 0,
    targetCents: 50000,
    startMonth: '2024-02',
  });
  const model = freedomHistoryModel(undefined, projection, '2024-02');
  expect(projection.months).toBeNull();
  expect(model.forecast).toHaveLength(61);
  expect(model.forecast.at(-1)).toEqual({ date: '2084-02-29', investedCents: 0 });
});
