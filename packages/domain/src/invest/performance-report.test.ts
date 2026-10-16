import { describe, expect, it } from 'vitest';
import { eachDay } from './series';
import { performanceReportSeries } from './performance-report';
import { windowPerformance } from './performance';

const series = eachDay('2025-12-31', '2026-03-15').map((date) => ({
  date,
  valueCents: date < '2026-01-31' ? 10_000 : date < '2026-02-28' ? 22_000 : 19_800,
}));
const input = { series, flows: [{ date: '2026-01-31', cents: 10_000 }] };
const window = { from: '2025-12-31', to: '2026-03-15' };

describe('performance report series', () => {
  it('starts a mid-month benchmark on the day before funding and matches the TTWROR difference', () => {
    // Benchmark gains 20% before funding; 10_000 cents on March 15 grow to 11_000.
    const input = {
      series: eachDay('2026-02-28', '2026-03-31').map((date) => ({
        date,
        valueCents: date < '2026-03-15' ? 0 : date < '2026-03-31' ? 10_000 : 11_000,
      })),
      flows: [{ date: '2026-03-15', cents: 10_000 }],
    };
    const window = { from: '2026-02-28', to: '2026-03-31' };
    const report = performanceReportSeries(
      input,
      window,
      eachDay(window.from, window.to).map((date) => ({
        date,
        level: date < '2026-03-14' ? 100 : 120,
        reason: null,
      })),
    );
    expect(report.benchmarkReturn).toBe(0);
    expect(report.months[0]?.benchmarkRate).toBe(0);
    expect(report.months[0]?.startQuoteDate).toBe('2026-03-14');
    expect(report.index.at(-1)?.benchmark).toBe(100);
    expect(
      report.dailyBenchmark.filter((p) => p.date < '2026-03-15').every((p) => p.benchmark === null),
    ).toBe(true);
    expect(report.dailyBenchmark.find((p) => p.date === '2026-03-15')?.benchmark).toBe(100);
    expect(windowPerformance(input, window).ttwror).toBeCloseTo(0.1, 12);
    expect(windowPerformance(input, window).ttwror! - report.benchmarkReturn!).toBeCloseTo(0.1, 12);
  });

  it('excludes an unfunded gap inside one month from both benchmark calculations', () => {
    // Withdrawal on the 3rd, no capital on the 4th/5th, funding on the 6th.
    // The benchmark's only gain is 20% on the unfunded 5th: comparable return is zero.
    const window = { from: '2026-03-01', to: '2026-03-08' };
    const input = {
      series: eachDay(window.from, window.to).map((date) => ({
        date,
        valueCents: date >= '2026-03-03' && date < '2026-03-06' ? 0 : 10_000,
      })),
      flows: [
        { date: '2026-03-03', cents: -10_000 },
        { date: '2026-03-06', cents: 10_000 },
      ],
      benchmark: eachDay(window.from, window.to).map((date) => ({
        date,
        level: date < '2026-03-05' ? 100 : 120,
      })),
    };
    const report = performanceReportSeries(
      input,
      window,
      input.benchmark.map((q) => ({ ...q, reason: null })),
    );
    expect(report.benchmarkReturn).toBe(0);
    expect(report.months[0]?.benchmarkRate).toBe(0);
    expect(report.index.at(-1)?.benchmark).toBe(100);
    expect(report.dailyBenchmark.map((p) => p.benchmark)).toEqual([
      100,
      100,
      100,
      null,
      null,
      100,
      100,
      100,
    ]);
    expect(windowPerformance(input, window)).toMatchObject({ ttwror: 0, benchmarkTtwror: 0 });
  });

  it('resumes from the last daily benchmark level after an unquoted month end and unfunded gap', () => {
    // January ends at 105, February reaches 112 on the 27th but has no 28th close.
    // March is unfunded; April starts at quote 200 and ends at 220 -> index 123.2.
    const window = { from: '2025-12-31', to: '2026-04-30' };
    const report = performanceReportSeries(
      {
        series: eachDay(window.from, window.to).map((date) => ({
          date,
          valueCents: date >= '2026-02-28' && date < '2026-04-01' ? 0 : 10_000,
        })),
        flows: [
          { date: '2026-02-28', cents: -10_000 },
          { date: '2026-04-01', cents: 10_000 },
        ],
      },
      window,
      [
        { date: '2025-12-31', level: 100, reason: null, weekendCarry: false },
        { date: '2026-01-31', level: 105, reason: null, weekendCarry: false },
        { date: '2026-02-27', level: 112, reason: null, weekendCarry: false },
        { date: '2026-03-31', level: 200, reason: null, weekendCarry: false },
        { date: '2026-04-01', level: 200, reason: null, weekendCarry: false },
        { date: '2026-04-30', level: 220, reason: null, weekendCarry: false },
      ],
    );
    expect(report.dailyBenchmark.find((p) => p.date === '2026-02-27')?.benchmark).toBeCloseTo(
      112,
      12,
    );
    expect(report.dailyBenchmark.find((p) => p.date === '2026-02-28')?.benchmark).toBeNull();
    expect(report.dailyBenchmark.find((p) => p.date === '2026-04-01')?.benchmark).toBeCloseTo(
      112,
      12,
    );
    expect(report.dailyBenchmark.at(-1)?.benchmark).toBeCloseTo(123.2, 12);
    expect(report.index.at(-1)?.benchmark).toBeCloseTo(123.2, 12);
    expect(report.benchmarkReturn).toBeNull();
  });

  it('keeps the first funded stretch null when its benchmark base is missing', () => {
    const window = { from: '2026-02-28', to: '2026-04-30' };
    const report = performanceReportSeries(
      {
        series: eachDay(window.from, window.to).map((date) => ({
          date,
          valueCents: date < '2026-03-15' ? 0 : 10_000,
        })),
        flows: [{ date: '2026-03-15', cents: 10_000 }],
      },
      window,
      [
        { date: '2026-02-27', level: 100, reason: null },
        { date: '2026-03-15', level: 120, reason: null },
        { date: '2026-03-31', level: 120, reason: null },
        { date: '2026-04-30', level: 132, reason: null },
      ],
    );
    expect(report.benchmarkReturn).toBeNull();
    expect(report.dailyBenchmark.every((p) => p.benchmark === null)).toBe(true);
    expect(report.index.every((p) => p.benchmark === null)).toBe(true);
  });

  it('classifies a negative atStart transfer as a signed deposit like dailyReturns', () => {
    const report = performanceReportSeries(
      {
        series: [
          { date: '2026-03-01', valueCents: 10_000 },
          { date: '2026-03-02', valueCents: 5_000 },
        ],
        flows: [{ date: '2026-03-02', cents: -5_000, atStart: true }],
      },
      { from: '2026-03-01', to: '2026-03-02' },
    );
    expect(report.dailyValues[1]).toEqual({
      date: '2026-03-02',
      valueCents: 5_000,
      depositsCents: -5_000,
      withdrawalsCents: 0,
    });
    expect(report.dailyIndex.at(-1)?.portfolio).toBe(100);
  });

  it('retains same-day gross opposing flows and excludes flows exactly on from', () => {
    // Opening-day 7_000 cents are already in 10_000; next day +10_000/-4_000
    // leaves 16_000 cents, with no investment return.
    const input = {
      series: [
        { date: '2026-03-01', valueCents: 10_000 },
        { date: '2026-03-02', valueCents: 16_000 },
      ],
      flows: [
        { date: '2026-03-01', cents: 7_000 },
        { date: '2026-03-02', cents: 10_000 },
        { date: '2026-03-02', cents: -4_000 },
      ],
    };
    const window = { from: '2026-03-01', to: '2026-03-02' };
    const report = performanceReportSeries(input, window);
    expect(report.dailyValues).toEqual([
      { date: '2026-03-01', valueCents: 10_000, depositsCents: 0, withdrawalsCents: 0 },
      { date: '2026-03-02', valueCents: 16_000, depositsCents: 10_000, withdrawalsCents: 4_000 },
    ]);
    expect(report.dailyIndex.at(-1)?.portfolio).toBe(100);
    expect(windowPerformance(input, window)).toMatchObject({
      contributionsCents: 6_000,
      ttwror: 0,
    });
  });

  it('excludes the unfunded January benchmark gain from the valued March comparison', () => {
    // No capital in January (+20% benchmark); 10_000 cents fund 1 March,
    // ending at 11_000 cents (+10%). Both comparable returns must be +10%, not +32%.
    const input = {
      series: eachDay('2025-12-31', '2026-03-31').map((date) => ({
        date,
        valueCents: date < '2026-03-01' ? 0 : date < '2026-03-31' ? 10_000 : 11_000,
      })),
      flows: [{ date: '2026-03-01', cents: 10_000 }],
    };
    const report = performanceReportSeries(input, { from: '2025-12-31', to: '2026-03-31' }, [
      { date: '2025-12-31', level: 100, reason: null },
      { date: '2026-01-30', level: 120, reason: null },
      { date: '2026-02-27', level: 120, reason: null },
      { date: '2026-03-31', level: 132, reason: null },
    ]);
    expect(report.benchmarkReturn).toBeCloseTo(0.1, 12);
    expect(report.years[0]?.benchmarkRate).toBeCloseTo(0.1, 12);
    expect(report.index.slice(0, 3).map((p) => p.benchmark)).toEqual([null, null, null]);
    expect(report.index.at(-1)?.benchmark).toBeCloseTo(110, 12);
  });

  it('uses the same benchmark base and leaves missing daily quotes as gaps', () => {
    const input = {
      series: eachDay('2026-03-02', '2026-03-05').map((date) => ({ date, valueCents: 10_000 })),
      flows: [],
    };
    const report = performanceReportSeries(input, { from: '2026-03-02', to: '2026-03-05' }, [
      { date: '2026-03-02', level: 100, reason: null },
      { date: '2026-03-03', level: 105, reason: null },
      { date: '2026-03-05', level: 110, reason: null },
    ]);
    expect(report.dailyBenchmark.map((p) => p.benchmark)).toEqual([100, 105, null, 110]);
    expect(report.benchmarkReturn).toBeCloseTo(0.1, 12);
  });

  it('does not require benchmark quotes inside wholly unfunded months when capital resumes', () => {
    // 10_000 cents are withdrawn on 31 January; February/March have no capital.
    // April is funded with 10_000 cents and ends at 11_000 cents. Benchmark: 0%, then 10%.
    const input = {
      series: eachDay('2025-12-31', '2026-04-30').map((date) => ({
        date,
        valueCents:
          date < '2026-01-31'
            ? 10_000
            : date < '2026-04-01'
              ? 0
              : date < '2026-04-30'
                ? 10_000
                : 11_000,
      })),
      flows: [
        { date: '2026-01-31', cents: -10_000 },
        { date: '2026-04-01', cents: 10_000 },
      ],
    };
    const result = performanceReportSeries(input, { from: '2025-12-31', to: '2026-04-30' }, [
      { date: '2025-12-31', level: 100, reason: null },
      { date: '2026-01-30', level: 100, reason: null },
      { date: '2026-03-31', level: 120, reason: null },
      { date: '2026-04-30', level: 132, reason: null },
    ]);
    expect(result.benchmarkReturn).toBeCloseTo(0.1, 12);
    expect(result.index.at(-1)?.benchmark).toBeCloseTo(110, 12);
    expect(result.dailyBenchmark.at(-1)?.benchmark).toBeCloseTo(110, 12);
  });

  it('exposes exact daily values and gross markers while a deposit leaves only 10% return', () => {
    // Opening 10_000 cents + deposit 10_000 cents -> closing 22_000 cents;
    // PP index is 110, never 220. No rounding of rates or stored-money writes.
    const report = performanceReportSeries(
      {
        series: [
          { date: '2026-01-01', valueCents: 10_000 },
          { date: '2026-01-02', valueCents: 22_000 },
        ],
        flows: [{ date: '2026-01-02', cents: 10_000 }],
      },
      { from: '2026-01-01', to: '2026-01-02' },
    );
    expect(report.dailyValues).toEqual([
      { date: '2026-01-01', valueCents: 10_000, depositsCents: 0, withdrawalsCents: 0 },
      { date: '2026-01-02', valueCents: 22_000, depositsCents: 10_000, withdrawalsCents: 0 },
    ]);
    expect(report.dailyIndex.at(-1)?.portfolio).toBeCloseTo(110, 12);
  });

  it('chains only valued months in a year funded on 1 March, matching the headline', () => {
    const input = {
      series: eachDay('2025-12-31', '2026-12-31').map((date) => ({
        date,
        valueCents: date < '2026-03-01' ? 0 : date < '2026-12-31' ? 10_000 : 11_000,
      })),
      flows: [{ date: '2026-03-01', cents: 10_000 }],
    };
    const window = { from: '2025-12-31', to: '2026-12-31' };
    const report = performanceReportSeries(input, window);
    expect(report.months.slice(0, 2).map((month) => month.rate)).toEqual([null, null]);
    expect(report.years[0]?.rate).toBeCloseTo(0.1, 12);
    expect(report.years[0]?.rate).toBeCloseTo(windowPerformance(input, window).ttwror!, 12);
  });

  it('chains daily flow-adjusted returns, labels partial months and compounds years', () => {
    const result = performanceReportSeries(input, window);
    expect(result.months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(result.months[0]?.rate).toBeCloseTo(0.1, 12);
    expect(result.months[1]?.rate).toBeCloseTo(-0.1, 12);
    expect(result.months[2]).toMatchObject({ rate: 0, partial: true });
    expect(result.years[0]?.rate).toBeCloseTo(-0.01, 12);
    expect(result.index.at(-1)?.portfolio).toBeCloseTo(99, 12);
    expect(result.dailyIndex).toHaveLength(series.length);
    expect(result.dailyIndex.at(-1)?.portfolio).toBeCloseTo(result.index.at(-1)!.portfolio!, 12);
    expect(result.dailyIndex.find((point) => point.date === '2026-01-31')?.portfolio).toBeCloseTo(
      110,
      12,
    );
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
    expect(sold.dailyIndex.every((p) => p.portfolio === null)).toBe(true);
    expect(sold.years[0]?.rate).toBeNull();
  });

  it('leaves non-positive denominators as gaps and resumes the valid chain', () => {
    const daily = eachDay('2026-01-01', '2026-01-05').map((date) => ({
      date,
      valueCents: {
        '2026-01-01': 100,
        '2026-01-02': 50,
        '2026-01-03': -10,
        '2026-01-04': 10,
        '2026-01-05': 20,
      }[date]!,
    }));
    const result = performanceReportSeries(
      { series: daily, flows: [] },
      { from: '2026-01-01', to: '2026-01-05' },
    );
    expect(
      result.dailyIndex.map((p) => (p.portfolio === null ? null : Number(p.portfolio.toFixed(4)))),
    ).toEqual([100, 50, -10, null, -20]);

    const zero = performanceReportSeries(
      {
        series: eachDay('2026-02-01', '2026-02-03').map((date) => ({
          date,
          valueCents: date === '2026-02-01' ? 100 : 0,
        })),
        flows: [],
      },
      { from: '2026-02-01', to: '2026-02-03' },
    );
    expect(zero.dailyIndex.map((point) => point.portfolio)).toEqual([100, 0, null]);
  });

  it('keeps a stale weekday close as a gap and resumes only with both observed boundaries', () => {
    const result = performanceReportSeries(input, window, [
      { date: '2025-12-30', level: 100, reason: null },
      { date: '2026-01-30', level: 105, reason: null },
      { date: '2026-02-27', level: 110, reason: null },
      { date: '2026-03-13', level: 0, reason: null },
    ]);
    expect(result.months[0]?.benchmarkGap).toBe('missing_price');
    expect(result.months[1]?.benchmarkRate).toBeCloseTo(110 / 105 - 1, 12);
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
