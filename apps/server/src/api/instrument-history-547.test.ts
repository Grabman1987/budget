import { createTestDatabase, schema, type Db, type InstrumentHistory } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-history-547-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
let db: Db;
let close: () => void;
let signedIn: boolean;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  ({ db, close } = createTestDatabase());
  signedIn = true;
  const auth: AuthGate = {
    requireSession: async (c, next) => signedIn ? next() : c.json({ error: 'unauthorized' }, 401),
    originGuard: async (_c, next) => next(),
    requireStepUp: async (_c, next) => next(),
    routes: new Hono(),
  };
  app = createApp({ webDir, auth, ledger: { db, today: () => '2026-09-17' } });
  db.insert(schema.account).values(['a', 'b'].map((id) => ({
    id, name: `Synthetic ${id}`, type: 'brokerage' as const, role: 'investment' as const,
    onBudget: false, openingDate: '2026-01-01',
  }))).run();
  db.insert(schema.security).values({ id: 's', name: 'Synthetic share', kind: 'stock' }).run();
});
afterEach(() => close());
const get = (suffix = '?from=2026-09-10&to=2026-09-12') =>
  app.request(`/api/securities/s/history${suffix}`);
const read = async (suffix?: string) => {
  const result = await get(suffix);
  expect(result.status).toBe(200);
  return ((await result.json()) as { history: InstrumentHistory }).history;
};
const buy = () => db.insert(schema.trade).values({
  id: 'buy', accountId: 'a', securityId: 's', date: '2026-09-10', kind: 'buy',
  unitsE8: 200_000_000, amountCents: 2000,
}).run();

it('shares literal dated cents, units and basis with canonical positions, and retains actual trade dates', async () => {
  buy();
  db.insert(schema.trade).values({
    id: 'sell', accountId: 'a', securityId: 's', date: '2026-09-12', kind: 'sell',
    unitsE8: -100_000_000, amountCents: 1500,
  }).run();
  db.insert(schema.price).values([
    { securityId: 's', date: '2026-09-10', priceMicro: 10_000_000, currency: 'EUR', source: 'manual' },
    { securityId: 's', date: '2026-09-11', priceMicro: 12_345_000, currency: 'EUR', source: 'manual' },
    { securityId: 's', date: '2026-09-12', priceMicro: 15_000_000, currency: 'EUR', source: 'manual' },
  ]).run();
  const tradesBefore = db.select().from(schema.trade).all();
  const history = await read();
  expect(history.points.map(({ date, unitsE8, valueCents }) => ({ date, unitsE8, valueCents }))).toEqual([
    { date: '2026-09-10', unitsE8: 200_000_000, valueCents: 2000 },
    { date: '2026-09-11', unitsE8: 200_000_000, valueCents: 2469 },
    { date: '2026-09-12', unitsE8: 100_000_000, valueCents: 1500 },
  ]);
  expect(history.position).toMatchObject({ valueCents: 1500, costCents: 1000, unitsE8: 100_000_000 });
  expect(history.events.map(({ id, date }) => ({ id, date }))).toEqual([
    { id: 'buy', date: '2026-09-10' }, { id: 'sell', date: '2026-09-12' },
  ]);
  const dated = await read('?from=2026-09-10&to=2026-09-11');
  expect(dated.position).toMatchObject({ valueCents: 2469, costCents: 2000, unitsE8: 200_000_000 });
  const positionResponse = await app.request('/api/portfolio/positions?asOf=2026-09-11');
  expect(positionResponse.status).toBe(200);
  const positions = (await positionResponse.json()).positions;
  expect(dated.position).toEqual(positions.find((position: { securityId: string }) => position.securityId === 's'));
  expect(dated.events.map(({ id }) => id)).toEqual(['buy']);
  expect(db.select().from(schema.trade).all()).toEqual(tradesBefore);
});

it('preserves account/day rounding instead of multiplying combined rounded holdings', async () => {
  db.insert(schema.holding).values(['a', 'b'].map((accountId) => ({
    id: accountId, accountId, securityId: 's', asOf: '2026-09-10', unitsE8: 100_000_000, costBasisCents: 1,
  }))).run();
  db.insert(schema.price).values({ securityId: 's', date: '2026-09-10', priceMicro: 5000, currency: 'EUR', source: 'manual' }).run();
  const history = await read('?to=2026-09-10');
  // Each account's half cent rounds to one: 1 + 1 = 2 cents, not aggregate rounding to one.
  expect(history.points[0]).toMatchObject({ unitsE8: 200_000_000, valueCents: 2 });
  expect(history.position).toMatchObject({ valueCents: 2, costCents: 2 });
});

it('keeps a missing quote unavailable and exposes the observation without inventing zero', async () => {
  db.insert(schema.holding).values({ id: 'a', accountId: 'a', securityId: 's', asOf: '2026-09-10', unitsE8: 100_000_000, costBasisCents: null }).run();
  const history = await read('?to=2026-09-10');
  expect(history.position?.valueCents).toBeNull();
  expect(history.points[0]).toMatchObject({ unitsE8: 100_000_000, valueCents: null, missing: 'price' });
});

it('keeps missing FX unavailable while retaining the canonical documented basis', async () => {
  db.insert(schema.holding).values({ id: 'a', accountId: 'a', securityId: 's', asOf: '2026-09-10', unitsE8: 200_000_000, costBasisCents: 2000 }).run();
  db.insert(schema.price).values({ securityId: 's', date: '2026-09-10', priceMicro: 12_345_000, currency: 'USD', source: 'manual' }).run();
  const history = await read('?to=2026-09-10');
  expect(history.unavailable).toBe('missing_fx');
  expect(history.points).toEqual([]);
  expect(history.position).toMatchObject({ valueCents: null, costCents: 2000 });
});

it('uses the saved FIFO basis for the endpoint without recalculating it in the chart', async () => {
  db.insert(schema.investmentPreference).values({ id: 'portfolio', costMethod: 'fifo' }).run();
  db.insert(schema.trade).values([
    { id: 'one', accountId: 'a', securityId: 's', date: '2026-09-10', kind: 'buy', unitsE8: 100_000_000, amountCents: 1000 },
    { id: 'two', accountId: 'a', securityId: 's', date: '2026-09-11', kind: 'buy', unitsE8: 100_000_000, amountCents: 2000 },
    { id: 'sale', accountId: 'a', securityId: 's', date: '2026-09-12', kind: 'sell', unitsE8: -100_000_000, amountCents: 3000 },
  ]).run();
  db.insert(schema.price).values({ securityId: 's', date: '2026-09-12', priceMicro: 40_000_000, currency: 'EUR', source: 'manual' }).run();
  const history = await read();
  expect(history.costMethod).toBe('fifo');
  expect(history.position).toMatchObject({ costCents: 2000, valueCents: 4000, unitsE8: 100_000_000 });
  expect(history.points.at(-1)?.valueCents).toBe(4000);
});

it('uses the selected day FX literally and retains source-date metadata', async () => {
  db.insert(schema.holding).values({ id: 'a', accountId: 'a', securityId: 's', asOf: '2026-09-10', unitsE8: 200_000_000, costBasisCents: 2000 }).run();
  db.insert(schema.price).values({ securityId: 's', date: '2026-09-10', priceMicro: 12_345_000, currency: 'USD', source: 'manual' }).run();
  db.insert(schema.fxRate).values([
    { date: '2026-09-10', currency: 'USD', rateMicro: 900_000, source: 'ecb' },
    { date: '2026-09-11', currency: 'USD', rateMicro: 1_100_000, source: 'ecb' },
  ]).run();
  const history = await read('?to=2026-09-10');
  // 2 × USD12.345 × EUR0.9/USD = EUR22.221 → 2222 cents.
  expect(history.points[0]).toMatchObject({ valueCents: 2222, unitsE8: 200_000_000 });
  expect(history.points[0]!.observations[0]).toMatchObject({ date: '2026-09-10', fx: { kind: 'rate', date: '2026-09-10' } });
});

it('rejects invalid, reversed, future and unbounded ranges and requires authentication', async () => {
  expect((await get('?from=2026-02-30&to=2026-09-12')).status).toBe(400);
  expect((await get('?from=2026-09-12&to=2026-09-10')).status).toBe(400);
  expect((await get('?to=2026-09-18')).status).toBe(400);
  expect((await get('?from=1900-01-01&to=2026-09-12')).status).toBe(400);
  signedIn = false;
  expect((await get()).status).toBe(401);
});
