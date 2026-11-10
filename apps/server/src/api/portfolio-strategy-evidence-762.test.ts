import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTestDatabase, type OpenedDatabase, type PortfolioStrategyView } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AuthGate } from '../app';
import {
  seedStrategyTestPortfolio,
  strategyTestConfiguration,
} from '../../../../packages/db/src/repos/portfolio-strategy-fixture';
import {
  scheduledSessionsThrough,
  seedSignalCloses,
  seedSignalInstrument,
} from '../../../../packages/db/src/repos/strategy-signal-fixture';

// No `strategyEvidence` override: the app uses its default provider, which reads stored closes.
let opened: OpenedDatabase, directory: string, app: ReturnType<typeof createApp>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Saturday after the penultimate November session (27.11.), before the last one (30.11.).
  vi.setSystemTime('2026-11-28T10:00:00.000Z');
  opened = createTestDatabase();
  seedStrategyTestPortfolio(opened);
  directory = mkdtempSync(join(tmpdir(), 'budget-strategy-evidence-'));
  const auth: AuthGate = {
    routes: new Hono(),
    requireStepUp: async (_c, next) => next(),
    requireSession: async (_c, next) => next(),
    originGuard: async (_c, next) => next(),
  };
  app = createApp({
    webDir: directory,
    auth,
    ledger: { db: opened.db, today: () => '2026-11-28' },
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

it('answers 409 and a visible unavailable state while no series was captured', async () => {
  const view = await get();
  expect(view.dailyPreview).toEqual({
    status: 'unavailable',
    reason: 'signal_series_not_captured',
  });
  expect(
    (await send('POST', '/decision', { revision: view.revision, month: '2026-11' })).status,
  ).toBe(409);
});

it('records the binding monthly decision from stored closes with source and timestamps', async () => {
  seedSignalInstrument(opened.db);
  seedSignalCloses(opened.db, scheduledSessionsThrough('2025-11', '2026-11-27'));
  const initial = await get();
  expect(initial.dailyPreview).toMatchObject({
    status: 'available',
    sessionDate: '2026-11-27',
    source: { sourceId: 'ariva:72', currency: 'USD', leverage: 1 },
  });
  expect(
    (
      await send('PUT', '/configuration', {
        revision: initial.revision,
        config: strategyTestConfiguration(),
      })
    ).status,
  ).toBe(200);
  const response = await send('POST', '/decision', {
    revision: (await get()).revision,
    month: '2026-11',
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    changedCount: 1,
    decision: {
      month: '2026-11',
      signalDate: '2026-11-27',
      effectiveDate: '2026-11-30',
      trend: 'strong',
      sourceId: 'ariva:72',
      indexId: 'nasdaq-100-usd-price-index:NDX',
    },
  });
});

it('does not answer with a decision when the stored series has a gap', async () => {
  seedSignalInstrument(opened.db);
  seedSignalCloses(
    opened.db,
    scheduledSessionsThrough('2025-11', '2026-11-27').filter((d) => d !== '2026-09-16'),
  );
  const view = await get();
  expect(view.dailyPreview).toMatchObject({
    reason: 'session_gap',
    missingSessions: ['2026-09-16'],
  });
  expect(
    (await send('POST', '/decision', { revision: view.revision, month: '2026-11' })).status,
  ).toBe(409);
});
