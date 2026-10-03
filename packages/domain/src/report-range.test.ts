import { describe, expect, it } from 'vitest';
import {
  calendarRangeMonths,
  isReportPeriod,
  linearTrend,
  quickReportPeriod,
} from './report-range';
import { periodWindow } from './invest/performance';
import { cashflowWindow } from './ledger/cashflow';
import { windowMonths } from './spending/period';

describe('shared report calendar ranges, fixed today', () => {
  const today = '2026-01-17';
  it('handles year boundaries and six complete months', () => {
    expect(quickReportPeriod('previous', today)).toBe('2025-12..2025-12');
    expect(quickReportPeriod('6', today)).toBe('2025-07..2025-12');
    expect(quickReportPeriod('year', today)).toBe('2026-01..2026-01');
    expect(quickReportPeriod('previousYear', today)).toBe('2025-01..2025-12');
  });
  it('uses the previous close for daily valuations and clips a partial month to today', () => {
    expect(periodWindow('2024-02..2024-02', '2024-03-17')).toEqual({
      from: '2024-01-31',
      to: '2024-02-29',
    });
    expect(periodWindow('2026-01..2026-01', today)).toEqual({ from: '2025-12-31', to: today });
    expect(periodWindow('1M', today)).toEqual({ from: '2025-12-17', to: today });
  });
  it('does not substitute December for an empty current January', () => {
    expect(cashflowWindow('2026-01..2026-01', today, '2025-10')).toEqual(['2026-01']);
    expect(windowMonths('2026-01..2026-01', ['2025-12'])).toEqual([]);
    expect(calendarRangeMonths('2025-01..2025-12', '2025-10', '2026-01')).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
    ]);
  });
  it('validates URLs and bounded ordered month ranges', () => {
    for (const period of ['YTD', 'Alles', '2025-01..2025-12'])
      expect(isReportPeriod(period)).toBe(true);
    for (const period of ['2025-13..2025-14', '2026-01..2025-01', '0000-01..9999-12', 'bad'])
      expect(isReportPeriod(period)).toBe(false);
  });
});
describe('descriptive trend', () => {
  it('fits uneven x spacing and a constant series', () => {
    const fit = linearTrend([
      [10, 3],
      [11, 5],
      [14, 11],
    ]);
    expect(fit[0]![1]).toBeCloseTo(3, 12);
    expect(fit[1]).toEqual([14, 11]);
    expect(
      linearTrend([
        [0, 7],
        [3, 7],
        [9, 7],
      ]),
    ).toEqual([
      [0, 7],
      [9, 7],
    ]);
  });
  it('does not invent a trend without two distinct finite points', () => {
    for (const points of [
      [],
      [[1, 1]],
      [
        [1, 1],
        [1, 2],
      ],
      [
        [1, NaN],
        [2, 1],
      ],
    ] as Array<Array<[number, number]>>)
      expect(linearTrend(points)).toEqual([]);
  });
});
