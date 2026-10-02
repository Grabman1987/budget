import { createTestDatabase } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from './app';
import { debugSummary } from './debug-summary';

const webDir = mkdtempSync(join(tmpdir(), 'budget-web-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');

const { db } = createTestDatabase();
/** Session internals have their own auth tests; this fixture makes the boundary observable. */
const auth: AuthGate = {
  routes: new Hono(),
  originGuard: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  requireSession: async (c, next) =>
    c.req.header('x-test-signed-in') === '1' ? next() : c.json({ error: 'unauthorized' }, 401),
};
beforeAll(() => {
  seedDatabase(db);
});

describe('debug summary (seed check)', () => {
  it('reports counts and the net worth of the sample ledger: 84.730,00 EUR on 17.09.2026', () => {
    const summary = debugSummary(db);
    expect(summary.asOf).toBe('2026-09-17');
    expect(summary.netWorthCents).toBe(8473000);
    expect(summary.investmentsCents).toBe(8800000);
    expect(summary.counts['accounts']).toBe(9);
    expect(summary.counts['bookings']).toBeGreaterThan(4000);
    expect(summary.counts['auditEntries']).toBe(0);
  });

  it('requires auth when mounting a database-backed debug summary', () => {
    expect(() => createApp({ webDir, database: db })).toThrow('The debug API needs auth');
  });

  it('is served read-only under /api/debug/summary behind the session guard', async () => {
    const app = createApp({ webDir, database: db, auth });
    expect((await app.request('/api/debug/summary')).status).toBe(401);
    const headers = { 'x-test-signed-in': '1' };
    const res = await app.request('/api/debug/summary?asOf=2026-09-17', { headers });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { netWorthCents: number }).netWorthCents).toBe(8473000);
    expect((await app.request('/api/debug/summary', { method: 'POST', headers })).status).toBe(404);
  });

  it('is not mounted without a database (default)', async () => {
    const res = await createApp({ webDir }).request('/api/debug/summary');
    expect(res.status).toBe(404);
  });

  it('an empty database has no figures instead of failing', () => {
    const empty = createTestDatabase().db;
    expect(debugSummary(empty)).toMatchObject({ asOf: null, netWorthCents: 0 });
  });
});
