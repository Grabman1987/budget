/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { createTestDatabase, schema, type Db } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, type AuthGate } from '../app';

/**
 * Regression for the audit finding "one instrument without a quote takes a third of the app down":
 * a knocked-out warrant that was held in the past, never had a quote and has prices switched off.
 * Every net-worth, portfolio, report and rule endpoint used to answer 503 for the days it was held.
 * Synthetic data only.
 */
const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-valuation-incomplete-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;
let depotId: string;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
  depotId = db
    .select()
    .from(schema.account)
    .all()
    .find((a) => a.type === 'brokerage')!.id;
  db.insert(schema.security)
    .values({
      id: 'ko-warrant',
      name: 'Synthetic knocked-out warrant',
      kind: 'other',
      currency: 'EUR',
      pricesEnabled: false,
    })
    .run();
  db.insert(schema.trade)
    .values([
      {
        id: 'ko-buy',
        securityId: 'ko-warrant',
        accountId: depotId,
        date: '2026-05-04',
        kind: 'buy',
        unitsE8: 50e8,
        amountCents: 30_000,
      },
      {
        id: 'ko-out',
        securityId: 'ko-warrant',
        accountId: depotId,
        date: '2026-05-20',
        kind: 'sell',
        unitsE8: -50e8,
        amountCents: 0,
      },
    ])
    .run();
});

async function get(path: string) {
  const res = await app.request(`/api${path}`);
  return { status: res.status, body: (await res.json()) as any };
}

const flagged = (body: any) =>
  body.incomplete?.map((n: any) => [n.securityId, n.quality, n.name]) ?? [];

// Whole-ledger reports on a loaded machine are slow: a generous limit keeps the test about answers.
vi.setConfig({ testTimeout: 60_000 });

describe('a security held in the past and never quoted', () => {
  it('Vermögen › Nettovermögen answers for every period, flagged as estimated', async () => {
    for (const period of ['1M', '3M', 'YTD', '1J', '3J', 'Alles']) {
      const { status, body } = await get(`/wealth/networth?period=${period}`);
      expect(status, period).toBe(200);
      const c = body.chain;
      expect(c.startCents + c.ownCents + c.marketCents, period).toBe(c.nowCents);
    }
    const ytd = await get('/wealth/networth?period=YTD');
    expect(flagged(ytd.body)).toEqual([
      ['ko-warrant', 'estimated', 'Synthetic knocked-out warrant'],
    ]);
    expect(ytd.body.incomplete[0]).toMatchObject({ from: '2026-05-04', to: '2026-05-19' });
    // A window without the holding days carries no flag.
    expect((await get('/wealth/networth?period=1M')).body.incomplete).toBeUndefined();
  });

  it('Heute, the Konten overview and the positions answer', async () => {
    for (const path of ['/heute', '/accounts', '/portfolio/positions', '/wealth/freedom']) {
      const { status } = await get(path);
      expect(status, path).toBe(200);
    }
    const heute = (await get('/heute')).body;
    expect(heute.netWorth.unavailable).toBeUndefined();
    expect(heute.financeCheck.unavailable).toBeUndefined();
  });

  it('every report page answers: Vermögensverläufe, Depots, Allokation, Einzahlungen, Rendite, Steuern', async () => {
    const paths = [
      '/networth-history?period=Alles',
      '/networth-history?period=1J',
      '/portfolio/depots?period=Alles',
      '/portfolio/allocation-report',
      '/portfolio?period=Alles&view=securities&history=contributions',
      '/portfolio?period=Alles&view=securities',
      '/portfolio/costs-taxes',
      '/reports/spending/costs/fund',
      '/overview/year',
      '/overview/year?year=2026',
      '/report-tables/months?netWorth=1',
      '/liquidity',
    ];
    for (const path of paths) {
      const { status, body } = await get(path);
      expect(status, path).toBe(200);
      expect(body.error, path).toBeUndefined();
    }
    const year = (await get('/overview/year?year=2026')).body;
    expect(year.netWorthUnavailable ?? null).toBeNull();
  });

  it('the rule book evaluates and lists instead of answering 503', async () => {
    const evaluated = await app.request('/api/rules/evaluate', { method: 'POST' });
    expect(evaluated.status).toBe(200);
    for (const path of ['/rules', '/rules/inputs', '/rules/check', '/rules/results']) {
      const { status } = await get(path);
      expect(status, path).toBe(200);
    }
  });

  it('keeps exact results when every price exists (no flag)', async () => {
    const { body } = await get('/wealth/networth?period=1M');
    expect(body.incomplete).toBeUndefined();
  });
});
