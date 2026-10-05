import { expect, it } from 'vitest';
import { forecastAccuracy, forecastAccuracySummary } from './planning-accuracy';

it('measures signed error against actual spend, inclusive 5% hit without rounding into a hit', () => {
  expect(forecastAccuracy(10_500, 10_000)).toEqual({
    deviationCents: 500,
    deviationBp: 500,
    hit: true,
  });
  expect(forecastAccuracy(10_501, 10_000).hit).toBe(false);
  expect(forecastAccuracy(9_600, 10_000)).toEqual({
    deviationCents: -400,
    deviationBp: -400,
    hit: true,
  });
  expect(forecastAccuracy(0, 0)).toEqual({ deviationCents: 0, deviationBp: null, hit: null });
  expect(forecastAccuracy(100, -100).hit).toBe(null);
});

it('averages absolute errors, excludes undefined percentages and uses only the last six calendar months', () => {
  const rows = [
    { month: '2026-02', projectedCents: 30_000, actualCents: 10_000 },
    { month: '2026-03', projectedCents: 10_400, actualCents: 10_000 },
    { month: '2026-04', projectedCents: 9_600, actualCents: 10_000 },
    { month: '2026-05', projectedCents: 0, actualCents: 0 },
  ];
  expect(forecastAccuracySummary(rows, '2026-09')).toEqual({
    count: 2,
    hits: 2,
    meanAbsoluteBp: 400,
  });
});

it('counts four of six hits with a 3.8% mean; a missing month is never a hit', () => {
  const rows = [2, -2, 3, -3, 6, -6.8].map((percent, index) => ({
    month: `2026-0${index + 3}`,
    projectedCents: 100_000 + percent * 1000,
    actualCents: 100_000,
  }));
  expect(forecastAccuracySummary(rows, '2026-09')).toEqual({
    count: 6,
    hits: 4,
    meanAbsoluteBp: 380,
  });
  expect(forecastAccuracySummary(rows.slice(1), '2026-09')).toEqual({
    count: 5,
    hits: 3,
    meanAbsoluteBp: 416,
  });
});
