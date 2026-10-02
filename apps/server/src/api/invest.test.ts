/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { createTestDatabase, schema, type Db } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-invest-api-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');

const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

const appFor = (db: Db) =>
  createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });

function caller(app: ReturnType<typeof appFor>) {
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
}

describe('GET /api/portfolio on the seeded sample ledger (17.09.2026)', () => {
  let call: ReturnType<typeof caller>;
  beforeAll(() => {
    const db = createTestDatabase().db;
    seedDatabase(db);
    call = caller(appFor(db));
  });

  it('answers with the prototype figures: 68.500 / 7.000 / 3.950 / 3.400 / 935 / 4.215 EUR', async () => {
    const res = await call('GET', '/portfolio?period=3J');
    expect(res.status).toBe(200);
    const p = res.body['portfolio'];
    const values = Object.fromEntries(p.positions.map((l: any) => [l.securityId, l.valueCents]));
    expect(values).toEqual({
      'sec-etfw': 6_850_000,
      'sec-etfem': 700_000,
      'sec-akta': 395_000,
      'sec-btc': 340_000,
      'sec-eth': 93_500,
      'sec-p2p': 421_500,
    });
    expect(p.valueCents).toBe(8_800_000);
    expect(p.speculative).toMatchObject({ shareBp: 1420, breach: true });
    const em = p.allocation.rows.find((r: any) => r.assetClass === 'ac-em');
    expect(em).toMatchObject({ breach: true, side: 'under', targetBp: 1200 });
    expect(p.proposals.map((r: any) => r.code)).toEqual(['r13_under', 'r15_speculative']);
    expect(p.performance.ttwror).toBeCloseTo(0.382, 3);
    expect(p.classes.map((c: any) => c.name)).toEqual([
      'Aktien Welt',
      'Schwellenländer',
      'Spekulativ',
    ]);
    expect(p.platforms.reduce((a: number, x: any) => a + x.shareBp, 0)).toBe(10_000);
    expect(p.names.securities['sec-etfw']).toBe('ETF Welt');
  });

  it('supports the depot view and validates its query', async () => {
    const depot = await call('GET', '/portfolio?view=depot&period=1J');
    expect(depot.status).toBe(200);
    expect(depot.body['portfolio'].view).toBe('depot');
    expect(depot.body['portfolio'].performance.endValueCents).toBeGreaterThan(8_800_000 - 1);
    expect((await call('GET', '/portfolio?period=5J')).status).toBe(400);
    expect((await call('GET', '/portfolio?view=other')).status).toBe(400);
  });

  it('lists the sample savings plans, their executions and the proposal', async () => {
    const plans = await call('GET', '/savings-plans');
    expect(plans.body['plans']).toHaveLength(5);
    const exec = await call('GET', '/savings-plans/executions?month=2026-08');
    expect(exec.body['executions'].map((e: any) => e.status)).toEqual(Array(5).fill('executed'));
    const proposal = await call('GET', '/savings-plans/proposal');
    const next = Object.fromEntries(
      proposal.body['proposal'].plans.map((p: any) => [p.name, p.proposedCents]),
    );
    expect(next).toEqual({
      'ETF Welt': 30_000,
      'ETF Schwellenländer': 10_000,
      'Einzelaktie A': 0,
      Bitcoin: 0,
      Ethereum: 0,
    });
    expect((await call('GET', '/savings-plans/proposal?step=0')).status).toBe(400);
  });
});

describe('invest CRUD', () => {
  let db: Db;
  let call: ReturnType<typeof caller>;
  beforeEach(() => {
    db = createTestDatabase().db;
    db.insert(schema.account)
      .values([
        {
          id: 'giro',
          name: 'Giro',
          type: 'checking',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-01-01',
        },
        {
          id: 'depot',
          name: 'Depot',
          type: 'brokerage',
          role: 'investment',
          onBudget: false,
          openingDate: '2026-01-01',
        },
      ])
      .run();
    call = caller(appFor(db));
  });

  it('securities: create, validate, patch, refuse a duplicate ISIN, delete and restore', async () => {
    const created = await call('POST', '/securities', {
      name: 'Welt-ETF',
      kind: 'etf',
      isin: 'IE00B4L5Y983',
      terBp: 20,
    });
    expect(created.status).toBe(201);
    const id = created.body['security'].id;
    expect(created.body['security']).toMatchObject({
      currency: 'EUR',
      terBp: 20,
      pricesEnabled: true,
    });
    expect(
      (await call('POST', '/securities', { name: 'X', kind: 'etf', isin: 'bad' })).status,
    ).toBe(400);
    expect((await call('POST', '/securities', { name: 'X', kind: 'nope' })).status).toBe(400);
    expect(
      (await call('POST', '/securities', { name: 'Zwilling', kind: 'etf', isin: 'IE00B4L5Y983' }))
        .status,
    ).toBe(409);
    const patched = await call('PATCH', `/securities/${id}`, { name: 'Welt-ETF 2', terBp: 12 });
    expect(patched.body['security']).toMatchObject({ name: 'Welt-ETF 2', terBp: 12 });
    expect((await call('PATCH', `/securities/${id}`, {})).status).toBe(400);
    expect((await call('PATCH', '/securities/nope', { name: 'A' })).status).toBe(404);
    expect((await call('DELETE', `/securities/${id}`)).status).toBe(200);
    expect((await call('GET', `/securities/${id}`)).status).toBe(404);
    expect((await call('GET', '/securities?deleted=1')).body['securities']).toHaveLength(1);
    expect((await call('POST', `/securities/${id}/restore`)).status).toBe(200);
  });

  it('basic instrument metadata is audited, undoable and leaves source/cost settings intact', async () => {
    const cls = (await call('POST', '/asset-classes', { name: 'Musterklasse' })).body['assetClass'];
    const created = await call('POST', '/securities', {
      name: 'Musterinstrument',
      kind: 'etf',
      isin: 'XX0000000001',
      currency: 'EUR',
      symbol: 'SYN-ONE',
      terBp: 17,
      fallbackQuoteId: 'SYN-FALLBACK',
      quoteExchange: 'SYN',
      quoteAdjusted: true,
      pricesEnabled: false,
      benchmark: 'SYN-BENCHMARK',
    });
    const id = created.body['security'].id;
    const edited = await call('PATCH', `/securities/${id}`, {
      name: 'Musterinstrument neu',
      kind: 'fund',
      currency: 'CHF',
      isin: null,
      symbol: null,
      assetClassId: cls.id,
    });
    expect(edited.status).toBe(200);
    expect(edited.body['security']).toMatchObject({
      name: 'Musterinstrument neu',
      kind: 'fund',
      currency: 'CHF',
      isin: null,
      symbol: null,
      assetClassId: cls.id,
      terBp: 17,
      fallbackQuoteId: 'SYN-FALLBACK',
      quoteExchange: 'SYN',
      quoteAdjusted: true,
      pricesEnabled: false,
      benchmark: 'SYN-BENCHMARK',
    });
    const undone = await call('POST', '/undo', { groupId: edited.body['groupId'] });
    expect(undone.status).toBe(200);
    expect((await call('GET', `/securities/${id}`)).body['security']).toMatchObject({
      name: 'Musterinstrument',
      kind: 'etf',
      currency: 'EUR',
      isin: 'XX0000000001',
      symbol: 'SYN-ONE',
      assetClassId: null,
      terBp: 17,
      pricesEnabled: false,
    });
    expect((await call('POST', '/undo', { groupId: undone.body['groupId'] })).status).toBe(200);
    expect((await call('GET', `/securities/${id}`)).body['security'].name).toBe(
      'Musterinstrument neu',
    );
    const another = await call('POST', '/securities', { name: 'Leer', kind: 'other' });
    const creationUndo = await call('POST', '/undo', { groupId: another.body['groupId'] });
    expect((await call('GET', `/securities/${another.body['security'].id}`)).status).toBe(404);
    expect((await call('POST', '/undo', { groupId: creationUndo.body['groupId'] })).status).toBe(
      200,
    );
    expect(
      (await call('GET', `/securities/${another.body['security'].id}`)).body['security'].name,
    ).toBe('Leer');
  });

  it('instrument metadata list, creation and editing require a session', async () => {
    const locked = caller(
      createApp({
        webDir,
        ledger: { db, today: () => TODAY },
        auth: { ...signedIn, requireSession: async (c) => c.json({ error: 'unauthorized' }, 401) },
      }),
    );
    expect((await locked('GET', '/securities')).status).toBe(401);
    expect((await locked('POST', '/securities', { name: 'Leer', kind: 'other' })).status).toBe(401);
    expect((await locked('PATCH', '/securities/example', { name: 'Leer' })).status).toBe(401);
  });

  it('asset classes and targets: Σ = 10 000 bp, versioned, class in use cannot be deleted', async () => {
    const welt = (await call('POST', '/asset-classes', { name: 'Aktien Welt', sortOrder: 1 })).body[
      'assetClass'
    ];
    const em = (await call('POST', '/asset-classes', { name: 'Schwellenländer', sortOrder: 2 }))
      .body['assetClass'];
    const bad = await call('PUT', '/asset-classes/targets', {
      validFrom: '2026-01-01',
      targets: [{ assetClassId: welt.id, targetShareBp: 9_000 }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body['message']).toMatch(/10 000/);
    const ok = await call('PUT', '/asset-classes/targets', {
      validFrom: '2026-01-01',
      targets: [
        { assetClassId: welt.id, targetShareBp: 8_800, bandBp: 500 },
        { assetClassId: em.id, targetShareBp: 1_200 },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.body['version'].sumBp).toBe(10_000);
    const list = await call('GET', '/asset-classes');
    expect(list.body['assetClasses'].map((c: any) => [c.name, c.target.targetShareBp])).toEqual([
      ['Aktien Welt', 8_800],
      ['Schwellenländer', 1_200],
    ]);
    expect((await call('GET', '/asset-classes/targets')).body['versions']).toHaveLength(1);
    expect(
      (
        await call('PUT', '/asset-classes/targets', {
          validFrom: '2026-02-30',
          targets: [{ assetClassId: welt.id, targetShareBp: 10_000 }],
        })
      ).status,
    ).toBe(400);
    await call('POST', '/securities', { name: 'ETF', kind: 'etf', assetClassId: em.id });
    expect((await call('DELETE', `/asset-classes/${em.id}`)).status).toBe(409);
    expect((await call('DELETE', '/asset-classes/targets/2026-01-01')).status).toBe(200);
    expect((await call('DELETE', '/asset-classes/targets/2026-01-01')).status).toBe(404);
  });

  it('trades: units rule, settlement booking, decimal units, undo, import key, filters', async () => {
    const sec = (await call('POST', '/securities', { name: 'Welt-ETF', kind: 'etf' })).body[
      'security'
    ];
    const buy = await call('POST', '/trades', {
      securityId: sec.id,
      accountId: 'depot',
      date: '2026-03-02',
      kind: 'buy',
      units: '2.5',
      amountCents: 50_000,
      feeCents: 100,
      importKey: 'k1',
    });
    expect(buy.status).toBe(201);
    expect(buy.body['trade']).toMatchObject({ unitsE8: 250_000_000, amountCents: 50_000 });
    expect(buy.body['bookingId']).toEqual(expect.any(String));
    const booking = await app_get(call, `/bookings/${buy.body['bookingId']}`);
    expect(booking.amountCents).toBe(-50_100);
    const repeat = await call('POST', '/trades', {
      securityId: sec.id,
      accountId: 'depot',
      date: '2026-03-02',
      kind: 'buy',
      units: '2.5',
      amountCents: 50_000,
      feeCents: 100,
      importKey: 'k1',
    });
    expect(repeat.status).toBe(200);
    expect(repeat.body['duplicate']).toBe(true);

    // Validation.
    const wrongSign = await call('POST', '/trades', {
      securityId: sec.id,
      accountId: 'depot',
      date: '2026-03-03',
      kind: 'sell',
      units: '1',
      amountCents: 100,
    });
    expect(wrongSign.status).toBe(400);
    expect(wrongSign.body['message']).toMatch(/negative/);
    expect(
      (
        await call('POST', '/trades', {
          securityId: sec.id,
          accountId: 'depot',
          date: '2026-03-03',
          kind: 'buy',
          units: '1',
          unitsE8: 1,
          amountCents: 100,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', '/trades', {
          securityId: sec.id,
          accountId: 'giro',
          date: '2026-03-03',
          kind: 'buy',
          units: '1',
          amountCents: 100,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', '/trades', {
          securityId: 'nope',
          accountId: 'depot',
          date: '2026-03-03',
          kind: 'buy',
          units: '1',
          amountCents: 100,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call('POST', '/trades', {
          securityId: sec.id,
          accountId: 'depot',
          date: '2026-13-03',
          kind: 'buy',
          units: '1',
          amountCents: 100,
        })
      ).status,
    ).toBe(400);

    // Filters.
    await call('POST', '/trades', {
      securityId: sec.id,
      accountId: 'depot',
      date: '2026-04-02',
      kind: 'sell',
      units: '-1',
      amountCents: 20_000,
    });
    expect((await call('GET', '/trades')).body['trades']).toHaveLength(2);
    expect((await call('GET', '/trades?from=2026-04-01')).body['trades']).toHaveLength(1);
    expect(
      (await call('GET', `/trades?account=depot&security=${sec.id}&to=2026-03-31`)).body['trades'],
    ).toHaveLength(1);
    expect((await call('GET', '/trades?account=giro')).body['trades']).toHaveLength(0);

    // Patch, then undo the patch as one action.
    const patched = await call('PATCH', `/trades/${buy.body['trade'].id}`, { amountCents: 40_000 });
    expect(patched.status).toBe(200);
    expect((await app_get(call, `/bookings/${buy.body['bookingId']}`)).amountCents).toBe(-40_100);
    const undone = await call('POST', '/undo', { groupId: patched.body['groupId'] });
    expect(undone.status).toBe(200);
    expect((await app_get(call, `/bookings/${buy.body['bookingId']}`)).amountCents).toBe(-50_100);

    // Delete a trade: its booking goes, undo brings both back.
    const del = await call('DELETE', `/trades/${buy.body['trade'].id}`);
    expect(del.status).toBe(200);
    expect((await call('GET', '/trades')).body['trades']).toHaveLength(1);
    expect((await call('GET', `/bookings/${buy.body['bookingId']}`)).status).toBe(404);
    await call('POST', '/undo', { groupId: del.body['groupId'] });
    expect((await call('GET', '/trades')).body['trades']).toHaveLength(2);
    expect((await call('GET', `/bookings/${buy.body['bookingId']}`)).status).toBe(200);
  });

  it('bulk booking deletes skip a trade settlement and still apply unrelated selections', async () => {
    const sec = (await call('POST', '/securities', { name: 'Welt-ETF', kind: 'etf' })).body[
      'security'
    ];
    const trade = await call('POST', '/trades', {
      securityId: sec.id,
      accountId: 'depot',
      date: '2026-03-02',
      kind: 'buy',
      units: '1',
      amountCents: 10_000,
    });
    const settlementId = trade.body['bookingId'] as string;
    const plain = await call('POST', '/bookings', {
      type: 'booking',
      accountId: 'giro',
      date: '2026-03-02',
      amountCents: -1_000,
      categoryId: null,
    });
    const plainId = plain.body['id'] as string;

    const result = await call('POST', '/bookings/bulk', {
      action: 'delete',
      ids: [settlementId, plainId],
    });
    expect(result.status).toBe(200);
    expect(result.body['changed']).toEqual([plainId]);
    expect(result.body['skipped']).toMatchObject([{ id: settlementId, reason: 'invalid' }]);
    expect((await call('GET', `/bookings/${settlementId}`)).status).toBe(200);
    expect((await call('GET', `/bookings/${plainId}`)).status).toBe(404);
  });

  it('savings plans: create, change with history, end, executions and apply with an inbox item', async () => {
    const sec = (
      await call('POST', '/securities', { name: 'Welt-ETF', kind: 'etf', assetClassId: null })
    ).body['security'];
    const created = await call('POST', '/savings-plans', {
      securityId: sec.id,
      accountId: 'depot',
      sourceAccountId: 'giro',
      amountCents: 30_000,
      dayOfMonth: 15,
      validFrom: '2026-01-01',
    });
    expect(created.status).toBe(201);
    const id = created.body['plan'].id;
    expect(
      (
        await call('POST', '/savings-plans', {
          securityId: sec.id,
          accountId: 'depot',
          amountCents: 100,
          dayOfMonth: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call('POST', '/savings-plans', {
          securityId: sec.id,
          accountId: 'depot',
          amountCents: 0,
          dayOfMonth: 1,
        })
      ).status,
    ).toBe(400);

    // Executions: the 15th of August has no buy, the window has passed (today is 17.09.).
    const exec = await call('GET', '/savings-plans/executions?month=2026-08');
    expect(exec.body['executions']).toMatchObject([{ date: '2026-08-15', status: 'missing' }]);
    await call('POST', '/trades', {
      securityId: sec.id,
      accountId: 'depot',
      date: '2026-08-16',
      kind: 'buy',
      units: '1',
      amountCents: 30_000,
    });
    expect(
      (await call('GET', '/savings-plans/executions?month=2026-08')).body['executions'][0].status,
    ).toBe('executed');

    // A change without a day starts at the next execution day.
    const changed = await call('PATCH', `/savings-plans/${id}`, { amountCents: 10_000 });
    expect(changed.body['plan']).toMatchObject({ amountCents: 10_000, validFrom: '2026-10-15' });
    const all = await call('GET', '/savings-plans?ended=1');
    expect(all.body['plans'].map((p: any) => [p.amountCents, p.validTo])).toEqual([
      [30_000, '2026-10-14'],
      [10_000, null],
    ]);
    expect((await call('PATCH', `/savings-plans/${id}`, { amountCents: 1 })).status).toBe(404);
    const newId = changed.body['plan'].id;
    const ended = await call('POST', `/savings-plans/${newId}/end`, { to: '2026-12-31' });
    expect(ended.body['plan'].validTo).toBe('2026-12-31');
    expect((await call('GET', '/savings-plans')).body['plans']).toEqual([]);
    const unavailable = await call('POST', '/savings-plans/apply');
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toMatchObject({
      error: 'valuation_unavailable',
      reason: 'missing_price',
    });
    // The executed holding has a real stored quote; allocation needs a complete current value.
    expect(
      (await call('PUT', `/securities/${sec.id}/prices/2026-08-16`, { price: '300' })).status,
    ).toBe(200);
    // Nothing to apply without open plans.
    const apply = await call('POST', '/savings-plans/apply');
    expect(apply.status).toBe(200);
    expect(apply.body['changes']).toEqual([]);
    expect(apply.body['inboxItemId']).toBeNull();
    expect((await call('DELETE', `/savings-plans/${newId}`)).status).toBe(200);
  });

  it('GET /portfolio on an empty portfolio answers without history', async () => {
    const res = await call('GET', '/portfolio');
    expect(res.status).toBe(200);
    expect(res.body['portfolio']).toMatchObject({
      valueCents: 0,
      performance: null,
      positions: [],
    });
  });

  it('GET /portfolio keeps a documented realized gain after the only position is fully sold', async () => {
    const sec = (await call('POST', '/securities', { name: 'Muster-ETF', kind: 'etf' })).body[
      'security'
    ];
    expect(
      (await call('PUT', `/securities/${sec.id}/prices/2026-09-01`, { price: '100' })).status,
    ).toBe(200);
    await call('POST', '/trades', {
      securityId: sec.id,
      accountId: 'depot',
      date: '2026-09-01',
      kind: 'buy',
      units: '1',
      amountCents: 10_000,
    });
    await call('POST', '/trades', {
      securityId: sec.id,
      accountId: 'depot',
      date: '2026-09-10',
      kind: 'sell',
      units: '-1',
      amountCents: 12_000,
    });

    const res = await call('GET', '/portfolio?period=1J&view=securities');
    expect(res.status).toBe(200);
    expect(res.body['portfolio']).toMatchObject({
      view: 'securities',
      realizedGainCents: 2_000,
      realizedGainComplete: true,
      positions: [],
    });
  });

  it('GET /portfolio reports unavailable valuation history instead of a zero return', async () => {
    const sec = (await call('POST', '/securities', { name: 'Musterinstrument', kind: 'etf' })).body[
      'security'
    ];
    await call('POST', '/trades', {
      securityId: sec.id,
      accountId: 'depot',
      date: '2026-09-01',
      kind: 'buy',
      units: '1',
      amountCents: 10_000,
    });

    const res = await call('GET', '/portfolio?period=1J&view=securities');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'valuation_unavailable', reason: 'missing_price' });
    expect(res.body['missingPriceSecurityIds']).toContain(sec.id);
    expect(res.body['portfolio']).toBeUndefined();
  });
});

async function app_get(call: ReturnType<typeof caller>, path: string) {
  const res = await call('GET', path);
  expect(res.status).toBe(200);
  return res.body['booking'] as Record<string, any>;
}
