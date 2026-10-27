import { createTestDatabase, type PortfolioSummary } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-metrics-546-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date)
      VALUES ('depot','Synthetic depot','brokerage','investment',0,'2025-12-31');
    INSERT INTO security (id,name,kind) VALUES ('s','Synthetic holding','fund'),('benchmark-ftse','Synthetic index','etf');
    INSERT INTO holding (id,security_id,account_id,as_of,units_e8,cost_basis_cents)
      VALUES ('opening','s','depot','2025-12-31',100000000,10000);
    INSERT INTO trade (id,security_id,account_id,date,kind,units_e8,amount_cents)
      VALUES ('deposit','s','depot','2026-12-31','buy',100000000,10000);
    WITH RECURSIVE days(day) AS (
      VALUES ('2025-12-31') UNION ALL SELECT date(day,'+1 day') FROM days WHERE day<'2026-12-31'
    ) INSERT INTO price (security_id,date,price_micro,currency,source)
      SELECT 's',day,CASE WHEN day='2026-12-31' THEN 110000000 ELSE 100000000 END,'EUR','manual' FROM days;
    INSERT INTO price (security_id,date,price_micro,currency,source)
      SELECT 'benchmark-ftse',date,CASE WHEN date='2026-12-31' THEN 105000000 ELSE 100000000 END,'EUR','manual'
      FROM price WHERE security_id='s';
    INSERT INTO app_setting (id,value) VALUES ('portfolio.benchmark_ids','["benchmark-ftse"]');
  `);
  const auth: AuthGate = {
    requireSession: async (_c, next) => next(),
    originGuard: async (_c, next) => next(),
    requireStepUp: async (_c, next) => next(),
    routes: new Hono(),
  };
  app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => '2026-12-31' } });
});
afterEach(() => opened.close());
const read = async () => {
  const response = await app.request(
    '/api/portfolio?period=YTD&view=securities&history=performance&provenance=valuation-v1',
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { portfolio: PortfolioSummary }).portfolio;
};

it('keeps the independent 100 + 100 → 220 example at 10% TTWROR, not 120% value growth', async () => {
  const before = opened.sqlite.prepare('SELECT * FROM trade').all();
  const audit = opened.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get();
  const portfolio = await read();
  expect(portfolio.performance).toMatchObject({
    from: '2025-12-31',
    to: '2026-12-31',
    days: 365,
    startValueCents: 10000,
    contributionsCents: 10000,
    endValueCents: 22000,
    gainCents: 2000,
  });
  expect(portfolio.performance!.ttwror).toBeCloseTo(0.1, 12);
  expect(portfolio.performance!.ttwrorAnnualised).toBeCloseTo(0.1, 12);
  // The second 100 arrives at the end: (220 - 100) / 100 - 1 = 20% actual/365 XIRR.
  expect(portfolio.performance!.xirr).toBeCloseTo(0.2, 6);
  expect(portfolio.performanceHistory!.dailyValues.at(-1)).toMatchObject({
    date: '2026-12-31',
    valueCents: 22000,
    depositsCents: 10000,
    withdrawalsCents: 0,
  });
  const benchmark = portfolio.benchmarks[0]!;
  expect(benchmark.from).toBe('2025-12-31');
  expect(benchmark.to).toBe('2026-12-31');
  expect(benchmark.benchmarkReturn).toBeCloseTo(0.05, 12);
  expect(benchmark.dailyBenchmark[0]).toMatchObject({ date: '2025-12-31', benchmark: 100 });
  expect(benchmark.dailyBenchmark.at(-1)).toMatchObject({ date: '2026-12-31', benchmark: 105 });
  expect(opened.sqlite.prepare('SELECT * FROM trade').all()).toEqual(before);
  expect(opened.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get()).toEqual(audit);
});

it('leaves a missing weekday benchmark boundary unavailable without interpolation or a new default', async () => {
  opened.sqlite.exec("DELETE FROM price WHERE security_id='benchmark-ftse' AND date='2026-12-31'");
  const portfolio = await read();
  expect(portfolio.benchmarks[0]!.benchmarkReturn).toBeNull();
  expect(portfolio.benchmarks[0]!.dailyBenchmark.at(-1)).toMatchObject({
    date: '2026-12-31',
    benchmark: null,
  });
  expect(portfolio.performance!.ttwror).toBeCloseTo(0.1, 12);
  opened.sqlite.exec("DELETE FROM app_setting WHERE id='portfolio.benchmark_ids'");
  expect((await read()).benchmarks).toEqual([]);
});
