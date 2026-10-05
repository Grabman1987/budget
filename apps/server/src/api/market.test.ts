/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { createTestDatabase, schema, upsertFxRate, upsertPrice, type Db } from '@budget/db';
import { fixtureFxSource, fixtureQuoteSource } from '@budget/market';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-31';
const webDir = mkdtempSync(join(tmpdir(), 'budget-market-api-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');

const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createTestDatabase().db;
  db.insert(schema.security)
    .values({ id: 's1', name: 'Synthetischer Welt-ETF', kind: 'etf', symbol: 'SYN-A' })
    .run();
  db.insert(schema.account)
    .values({
      id: 'usd',
      name: 'USD-Konto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      currency: 'USD',
      openingDate: '2026-01-01',
    })
    .run();
  upsertPrice(db, {
    securityId: 's1',
    date: '2026-03-27',
    priceMicro: 80_000_000,
    currency: 'EUR',
    source: 'yfinance',
  });
  upsertFxRate(db, { date: '2026-03-27', currency: 'USD', rateMicro: 920_000, source: 'ecb' });
  app = createApp({
    webDir,
    auth: signedIn,
    ledger: {
      db,
      today: () => TODAY,
      market: {
        quotes: fixtureQuoteSource({
          anchorsFor: () => [{ date: '2026-03-27', value: 80_000_000 }],
        }),
        fx: fixtureFxSource({ anchorsFor: () => [{ date: '2026-03-27', value: 920_000 }] }),
      },
    },
  });
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe('POST /api/market/refresh', () => {
  it('runs both jobs and answers with counts per source', async () => {
    const res = await call('POST', '/market/refresh');
    expect(res.status).toBe(200);
    // 2026-03-30 (Mon), 03-31 (Tue)
    expect(res.body['prices'].bySource).toEqual({
      yfinance: { securities: 5, rows: 270 },
      ariva: { securities: 0, rows: 0 },
      cryptocalc: { securities: 0, rows: 0 },
      coingecko: { securities: 0, rows: 0 },
    });
    expect(res.body['fx'].bySource.ecb).toEqual({ currencies: 1, rows: 2 });
    expect(res.body['prices'].failed).toEqual([]);
    // Nothing new on the second call.
    const again = await call('POST', '/market/refresh');
    expect(again.body['prices']).toMatchObject({ tracked: 5, upToDate: 5 });
    expect(again.body['fx']).toMatchObject({ currencies: 1, upToDate: 1 });
  });
});

describe('GET /api/market/status', () => {
  it('shows the run log: nothing before the first run, then the last run and the last success', async () => {
    expect((await call('GET', '/market/status')).body).toEqual({
      lastRun: null,
      lastSuccess: null,
    });
    await call('POST', '/market/refresh');
    const status = (await call('GET', '/market/status')).body;
    expect(status['lastRun']).toMatchObject({ trigger: 'manual', status: 'ok', asOf: TODAY });
    expect(status['lastSuccess'].finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect((await call('GET', '/wealth/stand')).body['priceAt']).toBe(
      status['lastSuccess'].finishedAt,
    );
  });
});

describe('GET /api/securities/:id/prices', () => {
  it('lists the series with sources, filtered by from and to', async () => {
    await call('POST', '/market/refresh');
    const all = await call('GET', '/securities/s1/prices');
    expect(all.body['currency']).toBe('EUR');
    expect(all.body['prices'].map((p: any) => p.date)).toEqual([
      '2026-03-27',
      '2026-03-30',
      '2026-03-31',
    ]);
    const some = await call('GET', '/securities/s1/prices?from=2026-03-30&to=2026-03-30');
    expect(some.body['prices']).toHaveLength(1);
    expect(some.body['prices'][0]).toMatchObject({ source: 'yfinance', currency: 'EUR' });
  });

  it('refuses bad dates and unknown securities', async () => {
    expect((await call('GET', '/securities/s1/prices?from=yesterday')).status).toBe(400);
    expect((await call('GET', '/securities/nope/prices')).status).toBe(404);
  });
});

describe('PUT /api/securities/:id/prices/:date', () => {
  it('sets audited manual prices and a refresh never replaces them', async () => {
    const a = await call('PUT', '/securities/s1/prices/2026-03-30', { priceMicro: 81_500_000 });
    expect(a.status).toBe(200);
    expect(a.body['price']).toMatchObject({ source: 'manual', priceMicro: 81_500_000 });
    const b = await call('PUT', '/securities/s1/prices/2026-03-30', { price: '81.25' });
    expect(b.body['groupId']).toEqual(expect.any(String));
    expect(b.body['price'].priceMicro).toBe(81_250_000);
    const undone = await call('POST', '/undo', { groupId: b.body['groupId'] });
    expect(undone.status).toBe(200);
    expect(
      (await call('GET', '/securities/s1/prices?from=2026-03-30&to=2026-03-30')).body['prices'],
    ).toMatchObject([{ priceMicro: 81_500_000, source: 'manual' }]);
    await call('POST', '/undo', { groupId: undone.body['groupId'] });
    const refresh = await call('POST', '/market/refresh');
    expect(refresh.body['prices'].protectedManual).toBe(1);
    const series = await call('GET', '/securities/s1/prices?from=2026-03-30&to=2026-03-30');
    expect(series.body['prices']).toEqual([
      {
        securityId: 's1',
        date: '2026-03-30',
        priceMicro: 81_250_000,
        currency: 'EUR',
        source: 'manual',
      },
    ]);
    expect(
      db
        .select()
        .from(schema.priceAudit)
        .all()
        .filter((row) => row.securityId === 's1'),
    ).toMatchObject([
      {
        date: '2026-03-30',
        oldPriceMicro: 81_500_000,
        newPriceMicro: 81_250_000,
        oldSource: 'manual',
        newSource: 'manual',
      },
      {
        date: '2026-03-31',
        oldPriceMicro: null,
        oldSource: null,
        newSource: 'yfinance',
      },
    ]);
  });

  it('applies API origin and session guards before a manual price write', async () => {
    const guardedApp = createApp({
      webDir,
      auth: {
        originGuard: async (c, next) =>
          c.req.header('origin') === 'https://budget.test'
            ? next()
            : c.json({ error: 'origin' }, 403),
        requireSession: async (c) => c.json({ error: 'unauthorized' }, 401),
        requireStepUp: async (_c, next) => next(),
        routes: new Hono(),
      },
      ledger: {
        db,
        today: () => TODAY,
        market: {
          quotes: fixtureQuoteSource({ anchorsFor: () => [] }),
          fx: fixtureFxSource({ anchorsFor: () => [] }),
        },
      },
    });
    const put = (origin?: string) =>
      guardedApp.request('/api/securities/s1/prices/2026-03-30', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify({ priceMicro: 81_000_000 }),
      });

    expect((await put()).status).toBe(403);
    expect((await put('https://budget.test')).status).toBe(401);
    expect(
      (await call('GET', '/securities/s1/prices?from=2026-03-30&to=2026-03-30')).body['prices'],
    ).toEqual([]);
  });

  it('refuses float input, both or neither field, future days and non-positive prices', async () => {
    const put = (body: unknown, date = '2026-03-30') =>
      call('PUT', `/securities/s1/prices/${date}`, body);
    expect((await put({ priceMicro: 81.5 })).status).toBe(400);
    expect((await put({ priceMicro: 1, price: '1' })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect((await put({ price: '81,5' })).status).toBe(400);
    expect((await put({ priceMicro: 0 })).status).toBe(400);
    expect((await put({ priceMicro: 1_000_000 }, '2026-04-01')).status).toBe(400);
    expect((await put({ priceMicro: 1_000_000 }, 'soon')).status).toBe(400);
  });
});

describe('GET /api/fx', () => {
  it('lists the rates of a currency', async () => {
    await call('POST', '/market/refresh');
    const res = await call('GET', '/fx?currency=USD&from=2026-03-30');
    expect(res.body['rates'].map((r: any) => r.date)).toEqual(['2026-03-30', '2026-03-31']);
    expect(res.body['rates'][0]).toMatchObject({ currency: 'USD', source: 'ecb' });
    expect((await call('GET', '/fx')).status).toBe(400);
    expect((await call('GET', '/fx?currency=usd')).status).toBe(400);
  });
});
