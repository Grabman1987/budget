import { createTestDatabase, portfolioSummary, type AllocationReport, type Db } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-allocation-report-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
let db: Db;
let close: () => void;
let signedIn: boolean;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  ({ db, close } = createTestDatabase());
  seedDatabase(db);
  const auth: AuthGate = {
    requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
    originGuard: async (_c, next) => next(),
    requireStepUp: async (_c, next) => next(),
    routes: new Hono(),
  };
  app = createApp({ webDir, auth, ledger: { db, today: () => TODAY } });
});
beforeEach(() => {
  signedIn = true;
});
afterAll(() => close());

const get = (path: string) => app.request(`/api${path}`);

it('serves the allocation report of the sample ledger, consistent with the portfolio summary', async () => {
  const response = await get('/portfolio/allocation-report');
  expect(response.status).toBe(200);
  const { allocation } = (await response.json()) as { allocation: AllocationReport };
  const summary = portfolioSummary(db, { today: TODAY });
  expect(allocation.totalCents).toBe(summary.valueCents);
  expect(allocation.classes.map((c) => [c.name, c.valueCents, c.targetBp, c.breach])).toEqual(
    summary.classes.map((c) => [c.name, c.valueCents, c.targetBp, c.breach]),
  );
  expect(allocation.regions.reduce((sum, r) => sum + r.valueCents, 0)).toBe(summary.valueCents);
  expect(allocation.regionsComplete).toBe(true);
  expect(allocation.history?.dates.at(-1)).toBe(TODAY);
  expect(allocation.history?.dates).toHaveLength(37);
  expect(allocation.history?.classes.length).toBeGreaterThanOrEqual(3);
});

it('needs a session', async () => {
  signedIn = false;
  expect((await get('/portfolio/allocation-report')).status).toBe(401);
});
