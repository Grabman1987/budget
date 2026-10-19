import { createTestDatabase, type PortfolioSummary } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { benchmarkQuoteFixture } from '../../../../packages/db/src/repos/benchmark-quote-fixture-543';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-benchmark-543-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Synthetic Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());
afterAll(() => rmSync(webDir, { recursive: true, force: true }));

describe('#543 benchmark quote API evidence', () => {
  it.each([true, false])(
    'matches fallback/report EUR levels without writes (FX available=%s)',
    async (availableFx) => {
      benchmarkQuoteFixture(opened, availableFx);
      const app = createApp({
        webDir,
        auth: signedIn,
        ledger: { db: opened.db, today: () => '2026-03-03' },
      });
      const before = opened.sqlite.prepare('SELECT total_changes() AS changes').get();
      const read = async (history: boolean) => {
        const response = await app.request(
          `/api/portfolio?period=Alles&view=securities&benchmark=benchmark${history ? '&history=performance' : ''}`,
        );
        expect(response.status).toBe(200);
        return ((await response.json()) as { portfolio: PortfolioSummary }).portfolio;
      };
      const fallback = await read(false);
      const report = await read(true);
      // EUR per USD: USD 100 × 2 = EUR 200; USD 110 × 1 = EUR 110: −45%.
      if (availableFx) {
        expect(fallback.performance?.benchmarkTtwror).toBeCloseTo(-0.45, 12);
        expect(report.performance?.benchmarkTtwror).toBeCloseTo(-0.45, 12);
        expect(report.performanceHistory?.dailyBenchmark.map((point) => point.benchmark)).toEqual([
          100, 55,
        ]);
      } else {
        expect(fallback.performance?.benchmarkTtwror).toBeNull();
        expect(report.performance?.benchmarkTtwror).toBeNull();
        expect(report.performanceHistory?.months[0]?.benchmarkGap).toBe('missing_fx');
      }
      for (const result of [fallback, report]) {
        expect(result.valueCents).toBe(10_000);
        expect(result.performance).toMatchObject({
          from: '2026-03-02',
          to: '2026-03-03',
          startValueCents: 10_000,
          endValueCents: 10_000,
          contributionsCents: 0,
          gainCents: 0,
          ttwror: 0,
        });
      }
      // Repeating both cached API reads cannot mutate stored financial facts or audit state.
      expect(await read(false)).toEqual(fallback);
      expect(await read(true)).toEqual(report);
      expect(opened.sqlite.prepare('SELECT total_changes() AS changes').get()).toEqual(before);
    },
  );
});
