import { createTestDatabase, portfolioSummary, type Db, type DepotComparison } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-depots-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
let db: Db;
let close: () => void;
let signedIn: boolean;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  ({ db, close } = createTestDatabase());
  seedDatabase(db);
  signedIn = true;
  const auth: AuthGate = {
    requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
    originGuard: async (_c, next) => next(),
    requireStepUp: async (_c, next) => next(),
    routes: new Hono(),
  };
  app = createApp({ webDir, auth, ledger: { db, today: () => TODAY } });
});
afterEach(() => close());

const get = (path: string) => app.request(`/api${path}`);

it('serves the depot comparison of the sample ledger; the total equals the portfolio summary', async () => {
  const response = await get('/portfolio/depots?period=1J');
  expect(response.status).toBe(200);
  const { depots } = (await response.json()) as { depots: DepotComparison };
  const summary = portfolioSummary(db, { today: TODAY, period: '1J' });
  expect(depots.period).toBe('1J');
  expect(depots.total?.performance?.ttwror).toBe(summary.performance?.ttwror);
  expect(depots.total?.valueCents).toBe(summary.valueCents);
  expect(depots.depots.length).toBeGreaterThanOrEqual(3);
  expect(depots.depots.reduce((sum, depot) => sum + depot.valueCents, 0)).toBe(summary.valueCents);
  expect(depots.depots.reduce((sum, depot) => sum + depot.shareBp, 0)).toBe(10_000);
  expect(depots.benchmark?.name).toBe(summary.benchmark?.name);
  expect(depots.total?.index.length).toBeGreaterThan(2);
});

it('defaults to one year, rejects an unknown period and needs a session', async () => {
  const fallback = (await (await get('/portfolio/depots')).json()) as { depots: DepotComparison };
  expect(fallback.depots.period).toBe('1J');
  expect((await get('/portfolio/depots?period=5J')).status).toBe(400);
  signedIn = false;
  expect((await get('/portfolio/depots')).status).toBe(401);
});

it('answers every period with consistent windows', async () => {
  for (const period of ['1M', '3M', 'YTD', '1J', '3J', 'Alles']) {
    const { depots } = (await (await get(`/portfolio/depots?period=${period}`)).json()) as {
      depots: DepotComparison;
    };
    expect(depots.window).not.toBeNull();
    for (const depot of depots.depots)
      if (depot.performance) expect(depot.performance.from).toBe(depots.window?.from);
  }
});
