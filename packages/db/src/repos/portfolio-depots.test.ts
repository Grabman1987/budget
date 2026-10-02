import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { depotComparison } from './portfolio-depots';
import { portfolioSummary } from './portfolio-summary';
import { REPORT_TODAY, reportPortfolioFixture } from './portfolio-report-fixture';
import { seedBasics } from './test-helpers';

let opened: OpenedDatabase;

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  reportPortfolioFixture(opened);
});
afterEach(() => opened.close());

describe('depotComparison (report 4.1)', () => {
  it('has one column per depot with a position, ordered by value, and a total', () => {
    const result = depotComparison(opened.db, { today: REPORT_TODAY, period: 'Alles' });
    expect(result.depots.map((d) => d.accountId).sort()).toEqual(['depot-a', 'depot-b']);
    expect(result.depots[0]?.valueCents ?? 0).toBeGreaterThanOrEqual(
      result.depots[1]?.valueCents ?? 0,
    );
    expect(result.total?.name).toBe('Alle Depots');
    const a = result.depots.find((d) => d.accountId === 'depot-a');
    expect(a).toMatchObject({ name: 'Depot A', platforms: ['Broker A'] });
    expect(a?.products.map((p) => p.securityId).sort()).toEqual(['div', 'etf']);
  });

  it('adds up: depot values, shares and products equal the total', () => {
    const result = depotComparison(opened.db, { today: REPORT_TODAY, period: 'Alles' });
    const total = result.total!;
    expect(result.depots.reduce((s, d) => s + d.valueCents, 0)).toBe(total.valueCents);
    expect(result.depots.reduce((s, d) => s + d.shareBp, 0)).toBe(10_000);
    expect(total.products.reduce((s, p) => s + p.valueCents, 0)).toBe(total.valueCents);
    for (const depot of result.depots)
      expect(depot.products.reduce((s, p) => s + p.valueCents, 0)).toBe(depot.valueCents);
    const perf = result.depots.map((d) => d.performance!);
    expect(perf.reduce((s, p) => s + p.startValueCents, 0)).toBe(
      total.performance!.startValueCents,
    );
    expect(perf.reduce((s, p) => s + p.contributionsCents, 0)).toBe(
      total.performance!.contributionsCents,
    );
    expect(perf.reduce((s, p) => s + p.gainCents, 0)).toBe(total.performance!.gainCents);
  });

  it('the total is the portfolio summary of the same period, figure by figure', () => {
    for (const period of ['1M', '3M', 'YTD', '1J', 'Alles'] as const) {
      const result = depotComparison(opened.db, { today: REPORT_TODAY, period });
      const summary = portfolioSummary(opened.db, { today: REPORT_TODAY, period });
      expect(result.total?.performance).toEqual(summary.performance);
      expect(result.benchmark).toEqual(summary.benchmark);
      expect(result.total?.valueCents).toBe(summary.valueCents);
    }
  });

  it('the index lines start at 100 and end at the time-weighted return of the window', () => {
    const result = depotComparison(opened.db, { today: REPORT_TODAY, period: 'Alles' });
    for (const depot of [...result.depots, result.total!]) {
      expect(depot.index[0]?.level).toBe(100);
      expect(depot.index.at(-1)?.date).toBe(result.window?.to);
      expect(depot.index.at(-1)?.level).toBeCloseTo(100 * (1 + depot.performance!.ttwror), 9);
    }
    expect(result.benchmarkIndex?.map((p) => p.date)).toEqual(
      result.total?.index.map((p) => p.date),
    );
    expect(result.benchmarkIndex?.[0]?.level).toBe(100);
  });

  it('keeps depots comparable inside one window and respects the period', () => {
    const month = depotComparison(opened.db, { today: REPORT_TODAY, period: '1M' });
    expect(month.window).toEqual({ from: '2026-08-17', to: REPORT_TODAY });
    for (const depot of month.depots) expect(depot.performance?.from).toBe('2026-08-17');
  });

  it('is empty without securities history', () => {
    const empty = createTestDatabase();
    try {
      const result = depotComparison(empty.db, { today: REPORT_TODAY, period: '1J' });
      expect(result).toMatchObject({ window: null, depots: [], total: null, benchmark: null });
    } finally {
      empty.close();
    }
  });
});
