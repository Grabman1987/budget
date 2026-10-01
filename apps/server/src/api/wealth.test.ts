/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { createTestDatabase, schema, upsertPrice, type Db } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-wealth-api-'));
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

describe('GET /api/wealth/networth', () => {
  it('"jetzt" is the net worth of Konten (same function) and the prototype figure', async () => {
    const { body } = await get('/wealth/networth');
    expect(body.chain.nowCents).toBe(8_473_000);
    const accounts = (await get('/accounts')).body;
    expect(body.chain.nowCents).toBe(accounts.netWorthEurCents);
    expect(body.daily.at(-1)).toEqual({ date: TODAY, netWorthCents: 8_473_000 });
  });

  it('the chain adds up for every period and the bars add up to the chain', async () => {
    for (const period of ['1M', '3M', 'YTD', '1J', '3J', 'Alles']) {
      const { status, body } = await get(`/wealth/networth?period=${period}`);
      expect(status, period).toBe(200);
      const c = body.chain;
      expect(c.startCents + c.ownCents + c.marketCents, period).toBe(c.nowCents);
      expect(body.daily[0].netWorthCents, period).toBe(c.startCents);
      const buckets = body.bars.buckets as { ownCents: number; marketCents: number }[];
      expect(
        buckets.reduce((a, b) => a + b.ownCents, 0),
        period,
      ).toBe(c.ownCents);
      expect(
        buckets.reduce((a, b) => a + b.marketCents, 0),
        period,
      ).toBe(c.marketCents);
    }
  });

  it('windows start where the prototype starts them; bars are weekly up to 3M', async () => {
    const ytd = (await get('/wealth/networth')).body;
    expect(ytd.period).toBe('YTD');
    expect(ytd.from).toBe('2025-12-31');
    expect(ytd.bars.unit).toBe('month');
    expect(ytd.bars.buckets).toHaveLength(9);
    const m3 = (await get('/wealth/networth?period=3M')).body;
    expect(m3.from).toBe('2026-06-17');
    expect(m3.bars.unit).toBe('week');
    expect(m3.bars.buckets).toHaveLength(14);
    expect((await get('/wealth/networth?period=1M')).body.from).toBe('2026-08-17');
  });

  it('lists what it consists of per account: assets descending, debts separate', async () => {
    const { composition } = (await get('/wealth/networth')).body;
    const values = composition.assets.map((a: any) => a.valueCents);
    expect(values).toEqual([...values].sort((a: number, b: number) => b - a));
    expect(composition.assets.every((a: any) => a.valueCents > 0)).toBe(true);
    expect(composition.debts.map((d: any) => d.name)).toEqual(
      expect.arrayContaining(['Kredit', 'Kreditkarte']),
    );
    expect(composition.debts.every((d: any) => d.valueCents < 0)).toBe(true);
    const sum = [...composition.assets, ...composition.debts].reduce(
      (a: number, x: any) => a + x.valueCents,
      0,
    );
    expect(sum).toBe(8_473_000);
  });

  it('refuses an unknown period', async () => {
    expect((await get('/wealth/networth?period=5J')).status).toBe(400);
  });
});

describe('the Stand of the price data', () => {
  it('is the newest price day; the time is the refresh time when one was recorded', async () => {
    expect((await get('/wealth/stand')).body).toEqual({ priceDate: TODAY, priceAt: null });
    // A correction of the newest price is recorded in price_audit with its timestamp.
    const sec = db.select().from(schema.security).all()[0]!;
    const row = db
      .select()
      .from(schema.price)
      .all()
      .find((p) => p.securityId === sec.id && p.date === TODAY)!;
    upsertPrice(db, { ...row, priceMicro: row.priceMicro + 1, source: 'manual' });
    const stand = (await get('/wealth/stand')).body;
    expect(stand.priceDate).toBe(TODAY);
    expect(stand.priceAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });
});

describe('an empty ledger', () => {
  it('answers with zeros instead of failing', async () => {
    const empty = createApp({
      webDir,
      auth: signedIn,
      ledger: { db: createTestDatabase().db, today: () => TODAY },
    });
    const res = await empty.request('/api/wealth/networth');
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.chain).toMatchObject({ startCents: 0, nowCents: 0, deltaCents: 0 });
    expect(body.composition).toEqual({ assets: [], debts: [] });
    expect(body.stand).toEqual({ priceDate: null, priceAt: null });
  });
});

describe('missing FX availability', () => {
  it('returns a controlled unavailable answer for a security price without FX', async () => {
    const depot = db
      .select()
      .from(schema.account)
      .all()
      .find((a) => a.type === 'brokerage')!;
    db.insert(schema.security)
      .values({ id: 'missing-chf-security', name: 'CHF security', kind: 'stock', currency: 'CHF' })
      .run();
    db.insert(schema.holding)
      .values({
        id: 'missing-chf-holding',
        securityId: 'missing-chf-security',
        accountId: depot.id,
        asOf: '2026-01-01',
        unitsE8: 1_000_000_000,
      })
      .run();
    db.insert(schema.price)
      .values({
        securityId: 'missing-chf-security',
        date: TODAY,
        priceMicro: 100_000_000,
        currency: 'CHF',
        source: 'manual',
      })
      .run();

    const { status, body } = await get('/wealth/networth');
    expect(status).toBe(503);
    expect(body).toMatchObject({
      error: 'valuation_unavailable',
      missingFxCurrencies: ['CHF'],
    });
    expect(body['message']).toMatch(/CHF/);
  });
});
