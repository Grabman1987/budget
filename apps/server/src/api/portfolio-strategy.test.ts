import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createTestDatabase,
  createTrade,
  type OpenedDatabase,
  type PortfolioStrategyView,
} from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AuthGate } from '../app';
import {
  seedStrategyTestPortfolio,
  strategyTestConfiguration,
  strategyTestEvidence,
  STRATEGY_TEST_AS_OF,
} from '../../../../packages/db/src/repos/portfolio-strategy-fixture';

let opened: OpenedDatabase, directory: string, app: ReturnType<typeof createApp>;
let signedIn = true,
  originAllowed = true,
  evidenceAvailable = true;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(STRATEGY_TEST_AS_OF);
  opened = createTestDatabase();
  seedStrategyTestPortfolio(opened);
  directory = mkdtempSync(join(tmpdir(), 'budget-strategy-api-'));
  signedIn = originAllowed = evidenceAvailable = true;
  const auth: AuthGate = {
    routes: new Hono(),
    requireStepUp: async (_c, next) => next(),
    requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
    originGuard: async (c, next) =>
      originAllowed || c.req.method === 'GET' ? next() : c.json({ error: 'origin_rejected' }, 403),
  };
  app = createApp({
    webDir: directory,
    auth,
    ledger: {
      db: opened.db,
      today: () => '2026-09-30',
      strategyEvidence: async (asOf) =>
        evidenceAvailable
          ? strategyTestEvidence(asOf)
          : { status: 'unavailable', reason: 'synthetic-outage' },
    },
  });
});
afterEach(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
});
const path = '/api/portfolio-strategy';
const get = async () => (await (await app.request(path)).json()) as PortfolioStrategyView;
const send = (method: string, suffix: string, body: unknown) =>
  app.request(`${path}${suffix}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

it('exposes authenticated, JSON-safe projections and explicit monthly writes without ledger changes', async () => {
  const initial = await get();
  expect(initial.dailyPreview).toMatchObject({
    status: 'available',
    trend: 'weak',
    currentSma: { sumCloseUnits: '20000000' },
  });
  expect(initial.binding).toBeNull();
  expect(
    (
      await send('PUT', '/configuration', {
        revision: initial.revision,
        config: strategyTestConfiguration(),
      })
    ).status,
  ).toBe(200);
  const revision = (await get()).revision;
  expect((await send('POST', '/decision', { revision, month: '2026-09' })).status).toBe(200);
  expect((await get()).contribution?.grossCents).toBe(10000);
  const duplicate = await send('POST', '/decision', { revision, month: '2026-09' });
  expect(await duplicate.json()).toMatchObject({ changedCount: 0 });
  for (const table of ['booking', 'trade', 'savings_plan', 'asset_class_target'])
    expect(opened.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
});
it('rejects unsigned access, foreign origins and client-supplied market evidence', async () => {
  const revision = (await get()).revision;
  signedIn = false;
  expect((await app.request(path)).status).toBe(401);
  expect(
    (await send('PUT', '/configuration', { revision, config: strategyTestConfiguration() })).status,
  ).toBe(401);
  signedIn = true;
  originAllowed = false;
  expect(
    (await send('PUT', '/configuration', { revision, config: strategyTestConfiguration() })).status,
  ).toBe(403);
  originAllowed = true;
  expect(
    (
      await send('POST', '/decision', {
        revision,
        month: '2026-09',
        evidence: strategyTestEvidence(),
      })
    ).status,
  ).toBe(400);
  expect(
    (await send('POST', '/rebalance/confirm', { revision, tradeIds: [], confirmedComplete: false }))
      .status,
  ).toBe(400);
  expect((await get()).config).toBeNull();
});
it('does not invent a signal during an evidence outage or replace conflicting settings', async () => {
  const initial = await get();
  expect(
    (
      await send('PUT', '/configuration', {
        revision: initial.revision,
        config: strategyTestConfiguration(),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await send('PUT', '/configuration', {
        revision: initial.revision,
        config: strategyTestConfiguration(),
      })
    ).status,
  ).toBe(409);
  evidenceAvailable = false;
  expect((await get()).dailyPreview).toEqual({ status: 'unavailable', reason: 'synthetic-outage' });
  expect(
    (await send('POST', '/decision', { revision: (await get()).revision, month: '2026-09' }))
      .status,
  ).toBe(409);
  expect((await get()).binding).toBeNull();
});

it('confirms existing trades through the authenticated API and leaves the ledger untouched', async () => {
  await send('PUT', '/configuration', {
    revision: (await get()).revision,
    config: strategyTestConfiguration(),
  });
  await send('POST', '/decision', { revision: (await get()).revision, month: '2026-09' });
  const captured = createTrade(
    opened.db,
    {
      securityId: 'strategy-global',
      accountId: 'strategy-depot',
      date: '2026-09-30',
      kind: 'sell',
      unitsE8: -10000000,
      amountCents: 6000,
    },
    { actor: 'test', groupId: 'execution' },
  );
  const current = await get(),
    before = opened.sqlite.prepare('SELECT * FROM trade').all();
  const response = await send('POST', '/rebalance/confirm', {
    revision: current.rebalanceExecution!.revision,
    decisionFingerprint: current.binding!.fingerprint,
    tradeIds: [captured.trade.id],
    confirmedComplete: true,
  });
  expect(response.status).toBe(200);
  expect((await get()).rebalanceExecution?.completed).toBe(true);
  expect(opened.sqlite.prepare('SELECT * FROM trade').all()).toEqual(before);
});
