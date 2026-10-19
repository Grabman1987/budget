import { describe, expect, it } from 'vitest';
import { windowPerformance } from './performance';
import { performanceReportSeries } from './performance-report';
import { eachDay, type RateTable } from './series';
import { benchmarkQuotesInEur, type ReportQuote } from './benchmark-quotes';

function paired(from: string, to: string, quotes: readonly ReportQuote[]) {
  const input = {
    series: eachDay(from, to).map((date) => ({ date, valueCents: 10_000 })),
    flows: [],
    benchmark: quotes,
  };
  const window = { from, to };
  return {
    period: windowPerformance(input, window),
    report: performanceReportSeries(input, window, quotes),
  };
}

describe('#543 shared benchmark boundary rule', () => {
  it('leaves a missing weekday close unavailable in both paths instead of inventing 0%', () => {
    const { period, report } = paired('2026-03-02', '2026-03-03', [
      { date: '2026-03-02', level: 100, reason: null },
    ]);
    expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([100, null]);
    expect(report.benchmarkReturn).toBeNull();
    expect(period.benchmarkTtwror).toBeNull();
    expect(period.ttwror).toBe(0);
    expect(period).toMatchObject({ startValueCents: 10_000, endValueCents: 10_000, gainCents: 0 });
  });

  it('retains actual period endpoints and terminal nulls after the last known daily level', () => {
    const { period, report } = paired('2026-03-02', '2026-03-05', [
      { date: '2026-03-02', level: 100, reason: null },
      { date: '2026-03-03', level: 105, reason: null },
    ]);
    expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([100, 105, null, null]);
    expect(report.dailyBenchmark.filter((point) => point.benchmark !== null).at(-1)).toEqual({
      date: '2026-03-03',
      benchmark: 105,
    });
    expect(report).toMatchObject({ from: '2026-03-02', to: '2026-03-05', benchmarkReturn: null });
    expect(period).toMatchObject({
      from: '2026-03-02',
      to: '2026-03-05',
      days: 3,
      benchmarkTtwror: null,
    });
  });

  it.each([true, false])(
    'allows Friday weekend carry only for eligible sources (%s)',
    (weekendCarry) => {
      const { period, report } = paired('2026-03-06', '2026-03-08', [
        { date: '2026-03-06', level: 100, reason: null, weekendCarry },
      ]);
      expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual(
        weekendCarry ? [100, 100, 100] : [100, null, null],
      );
      expect(report.benchmarkReturn).toBe(weekendCarry ? 0 : null);
      expect(period.benchmarkTtwror).toBe(weekendCarry ? 0 : null);
    },
  );

  it('never substitutes Thursday for a missing Friday close', () => {
    const { period, report } = paired('2026-03-06', '2026-03-08', [
      { date: '2026-03-05', level: 100, reason: null, weekendCarry: true },
    ]);
    expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([null, null, null]);
    expect(report.benchmarkReturn).toBeNull();
    expect(period.benchmarkTtwror).toBeNull();
  });

  it('does not invent an opening base from an older quote or the later closing quote', () => {
    const { period, report } = paired('2026-03-02', '2026-03-03', [
      { date: '2026-03-01', level: 100, reason: null },
      { date: '2026-03-03', level: 110, reason: null },
    ]);
    expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([null, null]);
    expect(report.benchmarkReturn).toBeNull();
    expect(period.benchmarkTtwror).toBeNull();
  });

  it('preserves an interior drawing gap when both funded interval boundaries are observed', () => {
    const { period, report } = paired('2026-03-02', '2026-03-05', [
      { date: '2026-03-02', level: 100, reason: null },
      { date: '2026-03-03', level: 105, reason: null },
      { date: '2026-03-05', level: 110, reason: null },
    ]);
    expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([100, 105, null, 110]);
    expect(report.benchmarkReturn).toBeCloseTo(0.1, 12);
    expect(period.benchmarkTtwror).toBeCloseTo(0.1, 12);
  });

  it('keeps an observed zero closing quote as -100%, but a zero opening cannot define a ratio', () => {
    const loss = paired('2026-03-02', '2026-03-03', [
      { date: '2026-03-02', level: 100, reason: null },
      { date: '2026-03-03', level: 0, reason: null },
    ]);
    expect(loss.report.dailyBenchmark.map((point) => point.benchmark)).toEqual([100, 0]);
    expect(loss.report.benchmarkReturn).toBe(-1);
    expect(loss.period.benchmarkTtwror).toBe(-1);
    const unavailable = paired('2026-03-02', '2026-03-03', [
      { date: '2026-03-02', level: 0, reason: null },
      { date: '2026-03-03', level: 100, reason: null },
    ]);
    expect(unavailable.report.benchmarkReturn).toBeNull();
    expect(unavailable.period.benchmarkTtwror).toBeNull();
  });

  it('still annualises over the whole 365-day report despite funding only its last two days', () => {
    const window = { from: '2025-03-02', to: '2026-03-02' };
    const quotes = [
      { date: '2026-02-27', level: 100, reason: null },
      { date: '2026-03-02', level: 110, reason: null },
    ] as const;
    const input = {
      series: eachDay(window.from, window.to).map((date) => ({
        date,
        valueCents: date < '2026-03-01' ? 0 : date === window.to ? 11_000 : 10_000,
      })),
      flows: [{ date: '2026-03-01', cents: 10_000 }],
      benchmark: quotes,
    };
    const period = windowPerformance(input, window);
    const report = performanceReportSeries(input, window, quotes);
    expect(period).toMatchObject({ days: 365, contributionsCents: 10_000, gainCents: 1_000 });
    expect(period.ttwror).toBeCloseTo(0.1, 12);
    expect(period.ttwrorAnnualised).toBeCloseTo(0.1, 12);
    expect(period.benchmarkTtwror).toBeCloseTo(0.1, 12);
    expect(report.benchmarkReturn).toBeCloseTo(0.1, 12);
  });
});

describe('#543 historical benchmark normalization', () => {
  it('converts each USD quote on its own date, ignoring later FX, in both return paths', () => {
    const rates: RateTable = new Map([
      [
        'USD',
        [
          { date: '2026-03-02', rateMicro: 2_000_000 },
          { date: '2026-03-03', rateMicro: 1_000_000 },
          { date: '2026-03-04', rateMicro: 9_000_000 },
        ],
      ],
    ]);
    const quotes = benchmarkQuotesInEur(
      [
        { date: '2026-03-02', priceMicro: 100_000_000, currency: 'USD' },
        { date: '2026-03-03', priceMicro: 110_000_000, currency: 'USD' },
      ],
      rates,
      'etf',
    );
    // Stored FX is EUR per USD: USD 100 × 2 = EUR 200; USD 110 × 1 = EUR 110, so −45%.
    expect(quotes.map((quote) => quote.level)).toEqual([200_000_000, 110_000_000]);
    const { period, report } = paired('2026-03-02', '2026-03-03', quotes);
    expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([100, 55]);
    expect(report.benchmarkReturn).toBeCloseTo(-0.45, 12);
    expect(period.benchmarkTtwror).toBeCloseTo(-0.45, 12);
  });

  it('keeps half a micro-unit in a derived EUR index instead of rounding cash cents', () => {
    const rates: RateTable = new Map([['USD', [{ date: '2026-03-02', rateMicro: 500_000 }]]]);
    const quotes = benchmarkQuotesInEur(
      [
        { date: '2026-03-02', priceMicro: 1, currency: 'USD' },
        { date: '2026-03-03', priceMicro: 2, currency: 'USD' },
      ],
      rates,
      'etf',
    );
    // One USD micro-unit × 0.5 EUR/USD = 0.5 EUR micro-unit; then 1 EUR micro-unit.
    expect(quotes.map((quote) => quote.level)).toEqual([0.5, 1]);
    const { period, report } = paired('2026-03-02', '2026-03-03', quotes);
    expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([100, 200]);
    expect(report.benchmarkReturn).toBe(1);
    expect(period.benchmarkTtwror).toBe(1);
  });

  it('never uses a later FX observation to fill a missing historical opening rate', () => {
    const rates: RateTable = new Map([['USD', [{ date: '2026-03-03', rateMicro: 1_000_000 }]]]);
    const quotes = benchmarkQuotesInEur(
      [
        { date: '2026-03-02', priceMicro: 100_000_000, currency: 'USD' },
        { date: '2026-03-03', priceMicro: 110_000_000, currency: 'USD' },
      ],
      rates,
      'etf',
    );
    expect(quotes[0]).toMatchObject({ level: null, reason: 'missing_fx' });
    const { period, report } = paired('2026-03-02', '2026-03-03', quotes);
    expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([null, null]);
    expect(report.months[0]?.benchmarkGap).toBe('missing_fx');
    expect(report.benchmarkReturn).toBeNull();
    expect(period.benchmarkTtwror).toBeNull();
  });

  it.each(['etf', 'fund', 'stock', 'bond'] as const)(
    'preserves the Friday close for %s weekends',
    (kind) => {
      const quotes = benchmarkQuotesInEur(
        [{ date: '2026-03-06', priceMicro: 100_000_000, currency: 'EUR' }],
        new Map(),
        kind,
      );
      const { period, report } = paired('2026-03-06', '2026-03-08', quotes);
      expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([100, 100, 100]);
      expect(report.benchmarkReturn).toBe(0);
      expect(period.benchmarkTtwror).toBe(0);
    },
  );

  it.each(['crypto', 'p2p', 'commodity', 'other'] as const)(
    'requires exact weekend observations for %s',
    (kind) => {
      const quotes = benchmarkQuotesInEur(
        [{ date: '2026-03-06', priceMicro: 100_000_000, currency: 'EUR' }],
        new Map(),
        kind,
      );
      const { period, report } = paired('2026-03-06', '2026-03-08', quotes);
      expect(report.dailyBenchmark.map((point) => point.benchmark)).toEqual([100, null, null]);
      expect(report.benchmarkReturn).toBeNull();
      expect(period.benchmarkTtwror).toBeNull();
    },
  );
});
