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

it('includes manual P2P and other investment accounts; hides closed empty depots only in inactive periods', () => {
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents,closed_at) VALUES
      ('p2p','Anlage A','p2p','investment',0,'2025-12-31',10000,NULL),
      ('other','Anlage B','other_asset','investment',0,'2025-12-31',20000,NULL),
      ('closed','Geschlossen','brokerage','investment',0,'2025-12-31',0,'2026-02-01');
    INSERT INTO valuation (id,account_id,date,value_cents) VALUES ('v0','p2p','2025-12-31',10000),('v1','p2p','2026-09-01',12500);
    INSERT INTO booking (id,account_id,date,amount_cents,currency,status) VALUES ('pflow','p2p','2026-09-05',1000,'EUR','confirmed');
    INSERT INTO booking_split (id,booking_id,amount_cents) VALUES ('pflow-split','pflow',1000);
    INSERT INTO trade (id,security_id,account_id,date,kind,units_e8,amount_cents) VALUES ('closed-buy','etf','closed','2026-01-01','buy',100000000,10000),('closed-sell','etf','closed','2026-01-02','sell',-100000000,10000);
  `);
  const report = depotComparison(opened.db, { today: REPORT_TODAY, period: '1M' });
  expect(report.depots.find((d) => d.accountId === 'closed')).toBeUndefined();
  expect(report.depots.find((d) => d.accountId === 'p2p')).toMatchObject({
    valueCents: 12500,
    performance: { startValueCents: 10000, contributionsCents: 1000, gainCents: 1500 },
  });
  expect(report.depots.find((d) => d.accountId === 'other')?.valueCents).toBe(20000);
  expect(report.depots.reduce((sum, d) => sum + d.valueCents, 0)).toBe(report.total!.valueCents);
  expect(
    depotComparison(opened.db, { today: REPORT_TODAY, period: 'Alles' }).depots.some(
      (d) => d.accountId === 'closed',
    ),
  ).toBe(true);
});
