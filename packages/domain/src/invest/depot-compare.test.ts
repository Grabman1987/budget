import { describe, expect, it } from 'vitest';
import { benchmarkIndexLine, depotIndexLine, returnGap } from './depot-compare';
import { monthBoundaries, windowPerformance } from './performance';
import { eachDay } from './series';
import type { CashFlow, Valuation } from './returns';

const days = eachDay('2026-01-01', '2026-04-15');
// A drifting value with a deposit of 100 EUR on 2026-02-10 that is part of the value.
const flows: CashFlow[] = [{ date: '2026-02-10', cents: 10_000 }];
const series: Valuation[] = days.map((date, i) => ({
  date,
  valueCents: 100_000 + i * 150 + (date >= '2026-02-10' ? 10_000 : 0),
}));

describe('depotIndexLine', () => {
  it('starts at 100 and reads the window start and every month boundary', () => {
    const line = depotIndexLine({ series, flows }, { from: '2026-01-01', to: '2026-04-15' });
    expect(line.map((p) => p.date)).toEqual(monthBoundaries('2026-01-01', '2026-04-15'));
    expect(line[0]).toEqual({ date: '2026-01-01', level: 100 });
  });

  it('ends exactly at 100 x (1 + ttwror) of the same window', () => {
    const window = { from: '2026-01-01', to: '2026-04-15' };
    const line = depotIndexLine({ series, flows }, window);
    const perf = windowPerformance({ series, flows }, window);
    expect(line[line.length - 1]?.level).toBe(100 * (1 + perf.ttwror));
  });

  it('removes the effect of a deposit: a flat market stays at 100', () => {
    const flat: Valuation[] = days.map((date) => ({
      date,
      valueCents: date >= '2026-02-10' ? 110_000 : 100_000,
    }));
    const line = depotIndexLine({ series: flat, flows }, { from: '2026-01-01', to: '2026-04-15' });
    for (const point of line) expect(point.level).toBeCloseTo(100, 9);
  });

  it('clamps the start to the first day of the series and tolerates an empty series', () => {
    const line = depotIndexLine({ series, flows }, { from: '2025-01-01', to: '2026-02-05' });
    expect(line[0]?.date).toBe('2026-01-01');
    expect(
      depotIndexLine({ series: [], flows: [] }, { from: '2026-01-01', to: '2026-02-01' }),
    ).toEqual([]);
  });

  it('skips days before the first value without inventing a return', () => {
    const late: Valuation[] = days.map((date) => ({
      date,
      valueCents: date >= '2026-02-01' ? 50_000 : 0,
    }));
    const line = depotIndexLine(
      { series: late, flows: [{ date: '2026-02-01', cents: 50_000 }] },
      { from: '2026-01-01', to: '2026-03-31' },
    );
    expect(line.every((p) => p.level === 100)).toBe(true);
  });
});

describe('benchmarkIndexLine', () => {
  const levels = [
    { date: '2026-01-01', level: 200 },
    { date: '2026-01-31', level: 210 },
    { date: '2026-02-28', level: 189 },
  ];

  it('is relative to the level on the first day, carried forward', () => {
    const line = benchmarkIndexLine(levels, [
      '2026-01-01',
      '2026-01-31',
      '2026-02-28',
      '2026-03-10',
    ]);
    expect(line?.map((p) => p.level)).toEqual([100, 105, 94.5, 94.5]);
  });

  it('is unavailable without a level before the first day or without levels', () => {
    expect(benchmarkIndexLine(levels, ['2025-12-31', '2026-01-31'])).toBeNull();
    expect(benchmarkIndexLine([], ['2026-01-01'])).toBeNull();
    expect(benchmarkIndexLine(levels, [])).toBeNull();
  });
});

describe('returnGap', () => {
  it('is the difference of the rates, null without comparison', () => {
    expect(returnGap(0.1, 0.07)).toBeCloseTo(0.03, 12);
    expect(returnGap(0.1, null)).toBeNull();
  });
});
