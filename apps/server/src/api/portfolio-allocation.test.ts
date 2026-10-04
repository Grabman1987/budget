import {
  createTestDatabase,
  replaceExposureVersion,
  portfolioSummary,
  schema,
  type Db,
  type PortfolioAllocationView,
  type PortfolioPositionsView,
  type TargetVersion,
} from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';
const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-allocation-'));
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
  (await (await call('GET', '/portfolio/allocation')).json()) as PortfolioAllocationView;
const targets = (validFrom: string, a: number, b: number, bandBp = 0) => ({
  validFrom,
  targets: [
    { assetClassId: 'a', targetShareBp: a, bandBp },
    { assetClassId: 'b', targetShareBp: b },
  ],
});
function fixture(currency = 'EUR', costBasisCents: number | null = null) {
  db.insert(schema.account)
    .values({
      id: 'depot',
      name: 'Depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      currency,
      openingDate: '2026-01-01',
    })
    .run();
  db.insert(schema.assetClass)
    .values([
      { id: 'a', name: 'Aktien', sortOrder: 1 },
      { id: 'b', name: 'Reserve', sortOrder: 2 },
    ])
    .run();
  db.insert(schema.security)
    .values({ id: 's', name: 'Musterfonds', kind: 'fund', assetClassId: 'a' })
    .run();
  replaceExposureVersion(
    db,
    's',
    {
      validFrom: '2026-01-01',
      complete: true,
      source: 'synthetic_fixture',
      weights: [{ assetClassId: 'a', weightBp: 10000 }],
    },
    { actor: 'tester' },
  );
  db.insert(schema.holding)
    .values({
      id: 'h',
      accountId: 'depot',
      securityId: 's',
      asOf: '2026-09-01',
      unitsE8: 200_000_000,
      costBasisCents,
    })
    .run();
}
it('literal sample risk matches existing summary and shared current total', async () => {
  seedDatabase(db);
  const view = await read();
  expect(view).toMatchObject({ status: 'known', valueCents: 8_800_000, missing: [] });
  expect(view.risk!.allocation.rows.find((row) => row.assetClass === 'ac-em')).toMatchObject({
    shareBp: 796,
    targetBp: 1200,
    bandBp: 300,
    gapCents: 356_000,
    side: 'under',
    breach: true,
  });
  expect(view.risk!.proposals.map((row) => [row.code, row.gapCents])).toEqual([
    ['r13_under', 356_000],
    ['r15_speculative', 370_000],
  ]);
  const summary = portfolioSummary(db, { today: TODAY, period: '3J' });
  expect(view.risk).toEqual({
    quality: summary.quality,
    allocation: summary.allocation,
    cluster: summary.cluster,
    speculative: summary.speculative,
    proposals: summary.proposals,
  });
  expect(
    ((await (await call('GET', '/portfolio/positions')).json()) as PortfolioPositionsView)
      .valueCents,
  ).toBe(view.valueCents);
});
it('current allocation survives undocumented and missing historical basis FX, plus missing historical quotes', async () => {
  fixture('USD', 5000);
  db.insert(schema.price)
    .values({
      securityId: 's',
      date: TODAY,
      priceMicro: 50_000_000,
      currency: 'EUR',
      source: 'manual',
    })
    .run();
  await call('PUT', '/asset-classes/targets', targets('2026-01-01', 8000, 2000));
  const position = (await (
    await call('GET', '/portfolio/positions')
  ).json()) as PortfolioPositionsView;
  expect(position.classes[0]!.positions[0]!.accounts[0]!).toMatchObject({
    valueCents: 10000,
    costCents: null,
    basisStatus: 'missing_fx',
  });
  expect(await read()).toMatchObject({
    status: 'known',
    valueCents: 10000,
    risk: {
      allocation: { totalCents: 10000 },
      proposals: [
        { code: 'r13_under', gapCents: 2000 },
        { code: 'r13_over', gapCents: 2000 },
      ],
    },
  });
  expect((await call('GET', '/portfolio')).status).toBe(503);
});
it('missing current price/FX suppresses totals and proposals; known zero-cent value and empty portfolio remain distinct', async () => {
  fixture();
  await call('PUT', '/asset-classes/targets', targets('2026-01-01', 8000, 2000));
  expect(await read()).toMatchObject({
    status: 'unavailable',
    valueCents: null,
    missing: ['missing_price'],
    risk: null,
    classes: [{ targetBp: 8000 }, { targetBp: 2000 }],
  });
  db.insert(schema.price)
    .values({
      securityId: 's',
      date: TODAY,
      priceMicro: 50_000_000,
      currency: 'CHF',
      source: 'manual',
    })
    .run();
  expect(await read()).toMatchObject({
    status: 'unavailable',
    valueCents: null,
    missing: ['missing_fx'],
    risk: null,
  });
  db.update(schema.price).set({ currency: 'EUR', priceMicro: 1 }).run();
  expect(await read()).toMatchObject({ status: 'nonpositive', valueCents: 0, risk: null });
  db.update(schema.holding).set({ unitsE8: 0 }).run();
  expect(await read()).toMatchObject({ status: 'empty', valueCents: 0, risk: null });
});
it('targets are 10000 bp, dated and atomic with preserved bands and auditable undo/redo', async () => {
  fixture();
  db.insert(schema.price)
    .values({
      securityId: 's',
      date: TODAY,
      priceMicro: 50_000_000,
      currency: 'EUR',
      source: 'manual',
    })
    .run();
  const first = (await (
    await call('PUT', '/asset-classes/targets', targets('2026-01-01', 8000, 2000, 250))
  ).json()) as { groupId: string };
  for (const body of [
    targets(TODAY, 8000, 1999),
    targets(TODAY, 8000, 2001),
    targets('2026-02-30', 8000, 2000),
    {
      validFrom: TODAY,
      targets: [
        { assetClassId: 'a', targetShareBp: 5000 },
        { assetClassId: 'a', targetShareBp: 5000 },
      ],
    },
  ])
    expect((await call('PUT', '/asset-classes/targets', body)).status).toBe(400);
  expect((await read()).classes.map((row) => [row.targetBp, row.bandBp])).toEqual([
    [8000, 250],
    [2000, 500],
  ]);
  const future = (await (
    await call('PUT', '/asset-classes/targets', {
      validFrom: '2026-10-01',
      targets: [{ assetClassId: 'a', targetShareBp: 10_000 }],
    })
  ).json()) as { groupId: string };
  expect((await read()).classes[0]!.targetBp).toBe(8000);
  const history = (await (await call('GET', '/asset-classes/targets')).json()) as {
    versions: TargetVersion[];
  };
  expect(history.versions.map((version: { sumBp: number }) => version.sumBp)).toEqual([
    10_000, 10_000,
  ]);
  expect(
    history.versions[1]!.targets.map((row: { targetShareBp: number }) => row.targetShareBp),
  ).toEqual([10_000]);
  const changed = (await (
    await call('PUT', '/asset-classes/targets', targets('2026-01-01', 7000, 3000))
  ).json()) as { groupId: string };
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([7000, 3000]);
  const undone = (await (await call('POST', '/undo', { groupId: changed.groupId })).json()) as {
    groupId: string;
  };
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([8000, 2000]);
  await call('POST', '/undo', { groupId: undone.groupId });
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([7000, 3000]);
  expect(first.groupId).not.toBe(future.groupId);
});
it('class creation undo/redo retains targets and session is required for reads and writes', async () => {
  const created = (await (
    await call('POST', '/asset-classes', { name: 'Neue Klasse' })
  ).json()) as { groupId: string; assetClass: { id: string } };
  expect((await read()).classes.map((row) => row.name)).toEqual(['Neue Klasse']);
  const undone = (await (await call('POST', '/undo', { groupId: created.groupId })).json()) as {
    groupId: string;
  };
  expect((await read()).classes).toEqual([]);
  await call('POST', '/undo', { groupId: undone.groupId });
  expect((await read()).classes.map((row) => row.name)).toEqual(['Neue Klasse']);
  signedIn = false;
  for (const [method, path, body] of [
    ['GET', '/portfolio/allocation', undefined],
    ['GET', '/asset-classes/targets', undefined],
    ['PUT', '/asset-classes/targets', targets(TODAY, 8000, 2000)],
    ['POST', '/asset-classes', { name: 'Fremd' }],
  ] as const)
    expect((await call(method, path, body)).status).toBe(401);
});
it('band breach is exact on cents, not rounded displayed shares', async () => {
  fixture();
  db.insert(schema.security)
    .values({ id: 't', name: 'Reservefonds', kind: 'fund', assetClassId: 'b' })
    .run();
  replaceExposureVersion(
    db,
    't',
    {
      validFrom: '2026-01-01',
      complete: true,
      source: 'synthetic_fixture',
      weights: [{ assetClassId: 'b', weightBp: 10000 }],
    },
    { actor: 'tester' },
  );
  db.insert(schema.holding)
    .values({
      id: 'h2',
      accountId: 'depot',
      securityId: 't',
      asOf: TODAY,
      unitsE8: 100_000_000,
      costBasisCents: null,
    })
    .run();
  db.insert(schema.price)
    .values([
      { securityId: 's', date: TODAY, priceMicro: 27_500_000, currency: 'EUR', source: 'manual' },
      { securityId: 't', date: TODAY, priceMicro: 45_000_000, currency: 'EUR', source: 'manual' },
    ])
    .run();
  await call('PUT', '/asset-classes/targets', targets(TODAY, 5000, 5000, 500));
  expect((await read()).risk!.allocation.rows[0]!).toMatchObject({
    shareBp: 5500,
    bandBp: 500,
    breach: false,
  });
  // One cent less in the second class moves the first beyond the exact 5 pp boundary.
  db.delete(schema.price).run();
  db.insert(schema.price)
    .values([
      { securityId: 's', date: TODAY, priceMicro: 27_500_000, currency: 'EUR', source: 'manual' },
      { securityId: 't', date: TODAY, priceMicro: 44_990_000, currency: 'EUR', source: 'manual' },
    ])
    .run();
  expect((await read()).risk!.allocation.rows[0]!.breach).toBe(true);
});

it('opposite broker positions and negative total keep real value without allocation proposals', async () => {
  fixture();
  db.insert(schema.account)
    .values({
      id: 'other',
      name: 'Depot B',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-01-01',
    })
    .run();
  db.insert(schema.holding)
    .values({
      id: 'opposite',
      accountId: 'other',
      securityId: 's',
      asOf: TODAY,
      unitsE8: -200_000_000,
      costBasisCents: null,
    })
    .run();
  db.insert(schema.price)
    .values({
      securityId: 's',
      date: TODAY,
      priceMicro: 50_000_000,
      currency: 'EUR',
      source: 'manual',
    })
    .run();
  expect(await read()).toMatchObject({ status: 'nonpositive', valueCents: 0, risk: null });
  db.delete(schema.holding).run();
  db.insert(schema.holding)
    .values({
      id: 'negative',
      accountId: 'other',
      securityId: 's',
      asOf: TODAY,
      unitsE8: -100_000_000,
      costBasisCents: null,
    })
    .run();
  expect(await read()).toMatchObject({ status: 'nonpositive', valueCents: -5000, risk: null });
});

it('first target creation undo removes the effective version; redo and fresh same-day save restore it', async () => {
  fixture();
  const group = (await (
    await call('PUT', '/asset-classes/targets', targets(TODAY, 8000, 2000))
  ).json()) as { groupId: string };
  const undone = (await (await call('POST', '/undo', { groupId: group.groupId })).json()) as {
    groupId: string;
  };
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([null, null]);
  expect(await (await call('GET', '/asset-classes/targets')).json()).toEqual({ versions: [] });
  const redone = (await (await call('POST', '/undo', { groupId: undone.groupId })).json()) as {
    groupId: string;
  };
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([8000, 2000]);
  await call('POST', '/undo', { groupId: redone.groupId });
  const saved = (await (
    await call('PUT', '/asset-classes/targets', targets(TODAY, 7000, 3000))
  ).json()) as { groupId: string };
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([7000, 3000]);
  await call('POST', '/undo', { groupId: saved.groupId });
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([null, null]);
});
it('same-day complete replacement leaves an omitted class unmanaged and undo restores its prior positive target', async () => {
  fixture();
  await call('PUT', '/asset-classes/targets', targets('2026-01-01', 5000, 5000));
  await call('PUT', '/asset-classes/targets', targets('2026-02-01', 5000, 5000));
  const saved = (await (
    await call('PUT', '/asset-classes/targets', {
      validFrom: '2026-02-01',
      targets: [{ assetClassId: 'a', targetShareBp: 10_000 }],
    })
  ).json()) as { groupId: string };
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([10_000, null]);
  const undone = (await (await call('POST', '/undo', { groupId: saved.groupId })).json()) as {
    groupId: string;
  };
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([5000, 5000]);
  await call('POST', '/undo', { groupId: undone.groupId });
  expect((await read()).classes.map((row) => row.targetBp)).toEqual([10_000, null]);
});

it('PR3 metadata is editable through audited account/instrument APIs; invalid scope/classes roll back and undo restores quality', async () => {
  fixture();
  db.insert(schema.price)
    .values({
      securityId: 's',
      date: TODAY,
      priceMicro: 100000000,
      currency: 'EUR',
      source: 'manual',
    })
    .run();
  const created = await call('POST', '/accounts', {
    name: 'Synthetic investment cash',
    type: 'savings',
    onBudget: false,
    openingDate: TODAY,
    openingBalanceCents: 5000,
    allocationScope: 'included',
  });
  expect(created.status).toBe(201);
  const cash = ((await created.json()) as { account: { id: string; allocationScope: string } })
    .account;
  expect(cash.allocationScope).toBe('included');
  expect(await read()).toMatchObject({
    valuationQuality: 'exact',
    valueCents: 25000,
    quality: { classification: 'partial', confidence: 'provisional', unclassifiedValueCents: 5000 },
  });
  const invalid = await call('PATCH', `/accounts/${cash.id}`, {
    allocationAssetClassId: 'missing',
  });
  expect(invalid.status).toBe(422);
  expect(((await invalid.json()) as { message: string }).message).toContain('aktive Anlageklasse');
  const edited = await call('PATCH', `/accounts/${cash.id}`, { allocationAssetClassId: 'a' });
  expect(edited.status).toBe(200);
  const { groupId } = (await edited.json()) as { groupId: string };
  expect((await read()).quality.confidence).toBe('exact');
  expect((await call('POST', '/undo', { groupId })).status).toBe(200);
  expect((await read()).quality.confidence).toBe('provisional');
  const rejectedDebt = await call('POST', '/accounts', {
    name: 'Synthetic debt',
    type: 'loan',
    openingDate: TODAY,
    allocationScope: 'included',
  });
  expect(rejectedDebt.status).toBe(422);
  const excluded = await call('PATCH', '/securities/s', { allocationIncluded: false });
  expect(excluded.status).toBe(200);
  expect(await read()).toMatchObject({ valueCents: 5000, universe: { securityIds: [] } });
});
