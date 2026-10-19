import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { portfolioSummary } from './portfolio-summary';
import { benchmarkQuoteFixture } from './benchmark-quote-fixture-543';

let opened: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());

describe('#543 read-only summary benchmark fallback', () => {
  it.each([true, false])(
    'uses historical EUR quotes or missing FX consistently (rates=%s)',
    (availableFx) => {
      benchmarkQuoteFixture(opened, availableFx);
      const before = opened.sqlite.prepare('SELECT total_changes() AS changes').get();
      const options = {
        today: '2026-03-03',
        period: 'Alles',
        benchmarkSecurityId: 'benchmark',
      } as const;
      const fallback = portfolioSummary(opened.db, options);
      const history = portfolioSummary(opened.db, { ...options, includePerformanceHistory: true });
      // EUR per USD: 100 USD × 2 = 200 EUR; 110 USD × 1 = 110 EUR: exactly −45%.
      if (availableFx) {
        expect(history.performanceHistory?.dailyBenchmark.map((point) => point.benchmark)).toEqual([
          100, 55,
        ]);
        expect(history.performance?.benchmarkTtwror).toBeCloseTo(-0.45, 12);
        expect(fallback.performance?.benchmarkTtwror).toBeCloseTo(-0.45, 12);
      } else {
        expect(history.performanceHistory?.months[0]?.benchmarkGap).toBe('missing_fx');
        expect(history.performance?.benchmarkTtwror).toBeNull();
        expect(fallback.performance?.benchmarkTtwror).toBeNull();
      }
      expect(fallback.performance).toMatchObject({
        from: '2026-03-02',
        to: '2026-03-03',
        startValueCents: 10_000,
        endValueCents: 10_000,
        contributionsCents: 0,
        gainCents: 0,
        ttwror: 0,
      });
      expect(opened.sqlite.prepare('SELECT total_changes() AS changes').get()).toEqual(before);
    },
  );
});
