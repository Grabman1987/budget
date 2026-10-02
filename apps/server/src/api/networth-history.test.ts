/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { createTestDatabase, type Db } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-history-api-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
});

async function get(path: string) {
  const res = await app.request(`/api${path}`);
  return { status: res.status, body: (await res.json()) as any };
}

const total = (s: Record<string, { assetsCents: number; debtsCents: number }>) =>
  Object.values(s).reduce((a, v) => a + v.assetsCents + v.debtsCents, 0);

describe('GET /api/networth-history', () => {
  it('is the same series and chain as the Vermögen page for every period', async () => {
    for (const period of ['1M', '3M', 'YTD', '1J', '3J', 'Alles']) {
      const history = await get(`/networth-history?period=${period}`);
      const page = await get(`/wealth/networth?period=${period}`);
      expect(history.status, period).toBe(200);
      expect(history.body.chain, period).toEqual(page.body.chain);
      expect(history.body.daily, period).toEqual(page.body.daily);
      expect(history.body.from, period).toBe(page.body.from);
    }
  }, 60_000);

  it('every structure adds up to the net worth of its day, start and end are the chain', async () => {
    const { body } = await get('/networth-history?period=1J');
    const { points, chain, daily } = body;
    expect(points[0].date).toBe(body.from);
    expect(points.at(-1).date).toBe(TODAY);
    expect(total(points[0].structure)).toBe(chain.startCents);
    expect(total(points.at(-1).structure)).toBe(chain.nowCents);
    const byDay = new Map(daily.map((d: any) => [d.date, d.netWorthCents]));
    for (const p of points) expect(total(p.structure), p.date).toBe(byDay.get(p.date));
    expect(points.length).toBeGreaterThan(10);
    expect(body.unit).toBe('month');
  });

  it('short periods are read weekly', async () => {
    const { body } = await get('/networth-history?period=1M');
    expect(body.unit).toBe('week');
    expect(body.points.length).toBeGreaterThanOrEqual(5);
  });

  it('the structure table matches the chain and the sample types', async () => {
    const { body } = await get('/networth-history?period=Alles');
    const sum = (k: 'startCents' | 'nowCents' | 'deltaCents') =>
      body.rows.reduce((a: number, r: any) => a + r[k], 0);
    expect(sum('startCents')).toBe(body.chain.startCents);
    expect(sum('nowCents')).toBe(body.chain.nowCents);
    expect(sum('deltaCents')).toBe(body.chain.deltaCents);
    const keys = body.rows.map((r: any) => r.key);
    expect(keys).toContain('brokerage');
    expect(keys).toContain('loan');
    const shares = body.rows
      .filter((r: any) => r.shareBp !== null)
      .reduce((a: number, r: any) => a + r.shareBp, 0);
    expect(Math.abs(shares - 10_000)).toBeLessThanOrEqual(body.rows.length);
    expect(body.rows.find((r: any) => r.key === 'loan').shareBp).toBeNull();
    expect(body.groups.map((g: any) => g.key)).toEqual(
      expect.arrayContaining(['brokerage', 'savings', 'checking', 'loan']),
    );
  });

  it('rejects an unknown period', async () => {
    expect((await get('/networth-history?period=5J')).status).toBe(400);
  });
});
