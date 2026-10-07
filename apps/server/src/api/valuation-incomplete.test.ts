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
  it('uses the requested as-of holdings for hints while Heute excludes closed snapshots', async () => {
    const opened = createTestDatabase();
    try {
      opened.db
        .insert(schema.account)
        .values({
          id: 'depot',
          name: 'Synthetic depot',
          type: 'brokerage',
          role: 'investment',
          onBudget: false,
          openingDate: '2026-01-01',
        })
        .run();
      opened.db
        .insert(schema.security)
        .values({
          id: 'snapshot-only',
          name: 'Synthetic snapshot',
          kind: 'stock',
          currency: 'EUR',
        })
        .run();
      opened.db
        .insert(schema.holding)
        .values([
          {
            id: 'held',
            accountId: 'depot',
            securityId: 'snapshot-only',
            asOf: '2026-01-01',
            unitsE8: 1e8,
            costBasisCents: 700,
          },
          {
            id: 'closed',
            accountId: 'depot',
            securityId: 'snapshot-only',
            asOf: '2026-02-05',
            unitsE8: 0,
            costBasisCents: 0,
          },
        ])
        .run();
      const isolated = createApp({
        webDir,
        auth: signedIn,
        ledger: { db: opened.db, today: () => TODAY },
      });
      const historical = await isolated.request('/api/accounts?asOf=2026-01-02');
      expect(historical.status).toBe(200);
      expect(((await historical.json()) as any).incomplete).toEqual([
        expect.objectContaining({ securityId: 'snapshot-only', unitsE8: 1e8 }),
      ]);
      const detail = await isolated.request('/api/accounts/depot?asOf=2026-01-02');
      expect(((await detail.json()) as any).incomplete).toEqual([
        expect.objectContaining({ securityId: 'snapshot-only', unitsE8: 1e8 }),
      ]);
      for (const path of ['/api/wealth/networth', '/api/networth-history']) {
        const report = await isolated.request(`${path}?period=2026-01..2026-01`);
        expect(report.status).toBe(200);
        expect(((await report.json()) as any).incomplete).toEqual([
          expect.objectContaining({ securityId: 'snapshot-only', unitsE8: 1e8 }),
        ]);
      }
      for (const path of ['/api/heute', '/api/heute?asOf=2026-01-02']) {
        const current = await isolated.request(path);
        expect(current.status).toBe(200);
        expect(((await current.json()) as any).incomplete ?? []).toEqual([]);
      }
    } finally {
      opened.close();
    }
  });
  it('Vermögen › Nettovermögen answers for every period without flagging a closed instrument', async () => {
    for (const period of ['1M', '3M', 'YTD', '1J', '3J', 'Alles']) {
      const { status, body } = await get(`/wealth/networth?period=${period}`);
      expect(status, period).toBe(200);
      const c = body.chain;
      expect(c.startCents + c.ownCents + c.marketCents, period).toBe(c.nowCents);
    }
    const ytd = await get('/wealth/networth?period=YTD');
    expect(flagged(ytd.body)).toEqual([]);
    // A window without the holding days carries no flag.
    expect((await get('/wealth/networth?period=1M')).body.incomplete).toBeUndefined();
  });

  it('Heute, the Konten overview and the positions answer', async () => {
    for (const path of ['/heute', '/accounts', '/portfolio/positions', '/wealth/freedom']) {
      const { status } = await get(path);
      expect(status, path).toBe(200);
    }
    const heute = (await get('/heute')).body;
    expect(flagged(heute)).toEqual([]);
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
