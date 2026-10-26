import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '@budget/db';
import { fundingTemplate, type FundingPlanState } from '@budget/domain';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AuthGate } from '../app';

let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let directory: string;
let signedIn = true,
  originAllowed = true;
beforeEach(() => {
  opened = createTestDatabase();
  directory = mkdtempSync(join(tmpdir(), 'budget-funding-'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Synthetic</title>');
  signedIn = originAllowed = true;
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
    ledger: { db: opened.db, today: () => '2026-10-25' },
  });
});
afterEach(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
});
const path = '/api/portfolio/funding-plan';
const get = async () => (await (await app.request(path)).json()) as FundingPlanState;
const send = (method: string, url: string, body: unknown) =>
  app.request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
it('persists the scenario with actual undo/redo, conflict protection and no financial writes', async () => {
  const initial = await get();
  expect(initial).toEqual({ plan: null, revision: 'none', unavailable: false });
  const plan = fundingTemplate();
  plan.monthlyCents = 40000;
  const response = await send('PUT', path, { revision: initial.revision, plan });
  expect(response.status).toBe(200);
  const saved = (await response.json()) as { groupId: string };
  expect((await get()).plan).toEqual(plan);
  expect((await send('PUT', path, { revision: initial.revision, plan })).status).toBe(409);
  const reversed = await send('POST', '/api/undo', { groupId: saved.groupId });
  expect(reversed.status).toBe(200);
  expect((await get()).plan).toBeNull();
  expect((await get()).revision).not.toBe('none');
  expect((await send('PUT', path, { revision: initial.revision, plan })).status).toBe(409);
  const reversal = (await reversed.json()) as { groupId: string };
  const redo = await send('POST', '/api/undo', { groupId: reversal.groupId });
  expect(redo.status).toBe(200);
  expect((await get()).plan).toEqual(plan);
  for (const table of ['booking', 'trade', 'savings_plan', 'asset_class_target'])
    expect(opened.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
});
it('rejects unauthenticated reads/writes, foreign origins and invalid/extra payloads', async () => {
  const plan = fundingTemplate();
  signedIn = false;
  expect((await app.request(path)).status).toBe(401);
  expect((await send('PUT', path, { revision: 'none', plan })).status).toBe(401);
  signedIn = true;
  originAllowed = false;
  expect((await send('PUT', path, { revision: 'none', plan })).status).toBe(403);
  originAllowed = true;
  expect((await send('PUT', path, { revision: 'none', plan, extra: true })).status).toBe(400);
  plan.stages[0]!.weights[0] = 6499;
  expect((await send('PUT', path, { revision: 'none', plan })).status).toBe(400);
  expect((await get()).plan).toBeNull();
  expect(opened.sqlite.prepare('SELECT count(*) AS n FROM audit_log').get()).toEqual({ n: 0 });
});
it('keeps corrupt stored settings visible and refuses replacement', async () => {
  opened.sqlite
    .prepare('INSERT INTO app_setting(id,value) VALUES(?,?)')
    .run('portfolio.funding-plan', '{broken');
  expect((await get()).unavailable).toBe(true);
  expect((await send('PUT', path, { revision: 'none', plan: fundingTemplate() })).status).toBe(409);
});
