import { describe, expect, it } from 'vitest';
import { eachDay } from './series';
import { performanceReportSeries } from './performance-report';

const series = eachDay('2025-12-31', '2026-03-15').map((date) => ({
  date,
  valueCents: date < '2026-01-31' ? 10_000 : date < '2026-02-28' ? 22_000 : 19_800,
}));
const input = { series, flows: [{ date: '2026-01-31', cents: 10_000 }] };
const window = { from: '2025-12-31', to: '2026-03-15' };

describe('performance report series', () => {
  it('chains daily flow-adjusted returns, labels partial months and compounds years', () => {
    const result = performanceReportSeries(input, window);
    expect(result.months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(result.months[0]?.rate).toBeCloseTo(0.2);
    expect(result.months[1]?.rate).toBeCloseTo(-0.1);
    expect(result.months[2]).toMatchObject({ rate: 0, partial: true });
    expect(result.years[0]?.rate).toBeCloseTo(0.08);
    expect(result.index.at(-1)?.portfolio).toBeCloseTo(108);
  });

  it('never backfills a missing starting quote, and leaves a whole unquoted month as a gap', () => {
    const result = performanceReportSeries(input, window, [
      { date: '2026-01-31', level: 100, reason: null },
      { date: '2026-03-15', level: 110, reason: null },
    ]);
    expect(result.months.map((m) => m.benchmarkRate)).toEqual([null, null, null]);
    expect(result.months.map((m) => m.benchmarkGap)).toEqual([
      'missing_price',
      'missing_price',
      'missing_price',
    ]);
    expect(result.benchmarkReturn).toBeNull();
    expect(result.index.every((p) => p.benchmark === null)).toBe(true);
  });

  it('uses only earlier stored closes, exposes FX gaps and preserves a genuine zero return', () => {
    const quotes = [
      { date: '2025-12-31', level: 100, reason: null },
      { date: '2026-01-30', level: 100, reason: null },
      { date: '2026-02-27', level: null, reason: 'missing_fx' as const },
      { date: '2026-03-15', level: 110, reason: null },
    ];
    const result = performanceReportSeries(input, window, quotes);
    expect(result.months[0]?.benchmarkRate).toBe(0);
    expect(result.months[1]?.benchmarkGap).toBe('missing_fx');
    expect(result.months[2]?.benchmarkGap).toBe('missing_fx');
    expect(result.index[2]?.benchmark).toBeNull();
    expect(result.benchmarkReturn).toBeNull();
  });

  it('does not invent a return for empty capital or a window with no elapsed day', () => {
    const empty = performanceReportSeries(
      { series: series.map((v) => ({ ...v, valueCents: 0 })), flows: [] },
      window,
    );
    expect(empty.months.every((m) => m.rate === null)).toBe(true);
    expect(empty.years[0]?.rate).toBeNull();
    expect(performanceReportSeries(input, { from: window.to, to: window.to }).months).toEqual([]);
  });

  it('does not show an initial index for a class sold before the selected period', () => {
    const sold = performanceReportSeries(
      {
        series: series.map((v) => ({ ...v, valueCents: v.date < '2026-01-31' ? 10000 : 0 })),
        flows: [{ date: '2026-01-31', cents: -10000 }],
      },
      { from: '2026-01-31', to: '2026-03-15' },
    );
    expect(sold.index.every((p) => p.portfolio === null)).toBe(true);
    expect(sold.years[0]?.rate).toBeNull();
  });

  it('keeps a stale weekday close as a gap and resumes only with both observed boundaries', () => {
    const result = performanceReportSeries(input, window, [
      { date: '2025-12-30', level: 100, reason: null },
      { date: '2026-01-30', level: 105, reason: null },
      { date: '2026-02-27', level: 110, reason: null },
      { date: '2026-03-13', level: 0, reason: null },
    ]);
    expect(result.months[0]?.benchmarkGap).toBe('missing_price');
    expect(result.months[1]?.benchmarkRate).toBeCloseTo(110 / 105 - 1);
    expect(result.months[2]?.benchmarkRate).toBe(-1);
    expect(result.benchmarkReturn).toBeNull();
    expect(result.index.every((p) => p.benchmark === null)).toBe(true);
  });

  it('allows an observed Friday close at both ends of a weekend-only partial window', () => {
    const result = performanceReportSeries(input, { from: '2026-03-13', to: '2026-03-15' }, [
      { date: '2026-03-13', level: 100, reason: null },
    ]);
    expect(result.months[0]).toMatchObject({ benchmarkRate: 0, benchmarkGap: null, partial: true });
    expect(result.benchmarkReturn).toBe(0);
  });
});
