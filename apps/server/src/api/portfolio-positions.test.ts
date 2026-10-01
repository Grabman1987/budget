import { createTestDatabase, schema, type Db, type PortfolioPositionsView } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';
const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-positions-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
let db: Db;
let close: () => void;
let signedIn: boolean;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  ({ db, close } = createTestDatabase());
  signedIn = true;
  const auth: AuthGate = {
    requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
    originGuard: async (_c, next) => next(),
    requireStepUp: async (_c, next) => next(),
    routes: new Hono(),
  };
  app = createApp({ webDir, auth, ledger: { db, today: () => TODAY } });
  db.insert(schema.institution)
    .values([
      { id: 'a', name: 'Broker A', kind: 'broker' },
      { id: 'b', name: 'Broker B', kind: 'broker' },
    ])
    .run();
  db.insert(schema.account)
    .values(
      ['a', 'b'].map((id) => ({
        id,
        name: `Depot ${id.toUpperCase()}`,
        type: 'brokerage' as const,
        role: 'investment' as const,
        onBudget: false,
        institutionId: id,
        openingDate: '2026-01-01',
      })),
    )
    .run();
  db.insert(schema.assetClass).values({ id: 'class', name: 'Aktien' }).run();
  db.insert(schema.security)
    .values({
      id: 's',
      name: 'Musterinstrument',
      kind: 'stock',
      currency: 'EUR',
      assetClassId: 'class',
      institutionId: 'a',
    })
    .run();
});
afterEach(() => close());
const call = (method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
const read = async () =>
  (await (await call('GET', '/portfolio/positions')).json()) as PortfolioPositionsView;
const snapshot = (id: string, unitsE8: number, costBasisCents: number | null) =>
  db
    .insert(schema.holding)
    .values({ id, accountId: id, securityId: 's', asOf: '2026-09-01', unitsE8, costBasisCents })
    .run();
const quote = (currency = 'EUR') =>
  db
    .insert(schema.price)
    .values({
      securityId: 's',
      date: '2026-09-16',
      priceMicro: 50_000_000,
      currency,
      source: 'import',
    })
    .run();
describe('portfolio positions projection', () => {
  it('retains two brokers with one security, literal shared values, metadata, and documented gain', async () => {
    snapshot('a', 200_000_000, 6000);
    snapshot('b', 100_000_000, 4500);
    quote();
    db.insert(schema.price)
      .values({
        securityId: 's',
        date: '2026-10-01',
        priceMicro: 90_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
    const view = await read();
    expect(view.valueCents).toBe(15000);
    expect(view.costCents).toBe(10500);
    expect(view.gainCents).toBe(4500);
    const p = view.classes[0]!.positions[0]!;
    expect(p).toMatchObject({
      unitsE8: 300_000_000,
      gainBp: 4286,
      shareBp: 10000,
      quote: { date: '2026-09-16', priceMicro: 50_000_000, currency: 'EUR', source: 'import' },
    });
    expect(p.accounts.map((a) => [a.accountId, a.institution, a.valueCents, a.costCents])).toEqual([
      ['a', 'Broker A', 10000, 6000],
      ['b', 'Broker B', 5000, 4500],
    ]);
    expect(view.chain?.map((t) => t.value)).toEqual([10500, 4500, 15000]);
  });
  it('keeps missing price and missing FX separate and totals unavailable, while a basis gap leaves value known', async () => {
    snapshot('a', 200_000_000, null);
    let view = await read();
    expect(view.valueCents).toBeNull();
    expect(view.classes[0]!.positions[0]!.accounts[0]!.valueStatus).toBe('missing_price');
    quote('CHF');
    view = await read();
    expect(view.valueCents).toBeNull();
    expect(view.classes[0]!.positions[0]!.accounts[0]!.valueStatus).toBe('missing_fx');
    db.insert(schema.fxRate)
      .values({ date: TODAY, currency: 'CHF', rateMicro: 1_100_000, source: 'ecb' })
      .run();
    view = await read();
    expect(view.valueCents).toBe(11000);
    expect(view.costCents).toBeNull();
    expect(view.gainCents).toBeNull();
    expect(view.chain).toBeNull();
    expect(view.classes[0]!.positions[0]!).toMatchObject({
      gainBp: null,
      accounts: [expect.objectContaining({ basisStatus: 'undocumented' })],
    });
  });
  it('does not discard a position whose current quote is valued but historical cost FX is missing', async () => {
    db.update(schema.account).set({ currency: 'CHF' }).run();
    snapshot('a', 200_000_000, 6000);
    quote();
    const view = await read();
    expect(view.valueCents).toBe(10000);
    expect(view.costCents).toBeNull();
    expect(view.classes[0]!.positions[0]!.accounts[0]!.basisStatus).toBe('missing_fx');
  });
  it('an audited manual quote changes shared positions/account valuation and undo restores both', async () => {
    snapshot('a', 200_000_000, 6000);
    quote();
    const response = await call('PUT', `/securities/s/prices/${TODAY}`, { price: '60.25' });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { groupId: string };
    const changed = await read();
    expect(changed.valueCents).toBe(12050);
    expect(changed.gainCents).toBe(6050);
    expect(changed.classes[0]!.positions[0]!.quote).toMatchObject({
      source: 'manual',
      priceMicro: 60_250_000,
      date: TODAY,
    });
    const accounts = (await (await call('GET', '/accounts')).json()) as {
      accounts: { id: string; valueEurCents: number }[];
    };
    expect(accounts.accounts.find((a) => a.id === 'a')?.valueEurCents).toBe(12050);
    expect((await call('POST', '/undo', { groupId: result.groupId })).status).toBe(200);
    expect((await read()).valueCents).toBe(10000);
    expect((await read()).classes[0]!.positions[0]!.quote?.source).toBe('import');
  });
  it('enforces sessions and rejects future/negative/overprecise manual quotes without changing values', async () => {
    snapshot('a', 200_000_000, 6000);
    quote();
    for (const [date, price] of [
      ['2026-09-18', '60'],
      [TODAY, '-1'],
      [TODAY, '1.1234567'],
    ])
      expect((await call('PUT', `/securities/s/prices/${date}`, { price })).status).toBe(400);
    expect((await read()).valueCents).toBe(10000);
    signedIn = false;
    expect((await call('GET', '/portfolio/positions')).status).toBe(401);
    expect((await call('PUT', `/securities/s/prices/${TODAY}`, { price: '60' })).status).toBe(401);
  });
});
