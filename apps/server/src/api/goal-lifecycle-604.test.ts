import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  accounts,
  categories,
  createEntity,
  createTestDatabase,
  schema,
  setAssigned,
  type OpenedDatabase,
} from '@budget/db';
import { createApp, type AuthGate } from '../app';

const ctx = { actor: 'synthetic-goal-http-604' };
const gate: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: OpenedDatabase, directory: string, app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  directory = mkdtempSync(join(tmpdir(), 'synthetic-goal-http-604-'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Synthetic</title>');
  accounts.create(
    opened.db,
    {
      id: 'cash-604-http',
      name: 'Synthetic budget',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-05-01',
      openingBalanceCents: 500000,
    },
    ctx,
  );
  createEntity(
    opened.db,
    schema.categoryGroup,
    { id: 'group-604-http', name: 'Synthetic savings' },
    ctx,
  );
  categories.create(
    opened.db,
    {
      id: 'category-604-http',
      name: 'Synthetic goal category',
      groupId: 'group-604-http',
      class: 'future',
    },
    ctx,
  );
  app = createApp({
    webDir: directory,
    auth: gate,
    ledger: { db: opened.db, today: () => '2026-10-15' },
  });
});
afterEach(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
});
async function call(method: string, path: string, data?: unknown) {
  const response = await app.request('/api' + path, {
    method,
    ...(data === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
  });
  return { status: response.status, body: await response.json() };
}
const goalInput = {
  name: 'Synthetic HTTP goal',
  categoryId: 'category-604-http',
  targetCents: 120000,
  targetDate: '2026-12-31',
  startMonth: '2026-10',
};

it('exposes only public intent, funds the missing literal25000 through HTTP and restores manual completion with public Undo', async () => {
  setAssigned(opened.db, 'category-604-http', '2026-10', 15000, ctx);
  const created = await call('POST', '/goals?month=2026-10', goalInput);
  expect(created.status).toBe(201);
  const initial = created.body.goal;
  expect(initial).toMatchObject({
    effectiveStartMonth: '2026-10',
    funding: { monthlyCents: 40000, remainingCents: 25000, conflict: null },
  });
  expect(initial).not.toHaveProperty('lifecycleAnchorJson');
  expect(initial).not.toHaveProperty('lifecycle_anchor_json');
  const funded = await call('POST', `/goals/${initial.id}/fund?month=2026-10`, {
    reviewToken: initial.funding.reviewToken,
  });
  expect(funded.status).toBe(200);
  expect(funded.body).toMatchObject({ assignedCents: 25000, changedCount: 1 });
  const current = await call('GET', '/goals?month=2026-10');
  expect(current.body.goals[0]).toMatchObject({
    savedCents: 40000,
    funding: { monthlyCents: 40000, remainingCents: 0 },
  });
  expect((await call('POST', '/undo', { groupId: funded.body.groupId })).status).toBe(200);
  expect((await call('GET', '/goals?month=2026-10')).body.goals[0]).toMatchObject({
    savedCents: 15000,
    funding: { remainingCents: 25000 },
  });
  const completed = await call('POST', `/goals/${initial.id}/complete`);
  expect(completed.status).toBe(200);
  expect((await call('GET', '/goals?month=2026-10')).body.goals[0]).toMatchObject({
    lifecycle: { state: 'completed' },
    savedCents: 15000,
  });
  expect(opened.sqlite.prepare('SELECT id FROM booking').all()).toEqual([]);
  expect((await call('POST', '/undo', { groupId: completed.body.groupId })).status).toBe(200);
  expect((await call('GET', '/goals?month=2026-10')).body.goals[0]).toMatchObject({
    lifecycle: { state: 'open' },
    savedCents: 15000,
  });
  expect(
    opened.sqlite.prepare('SELECT id FROM savings_goal WHERE deleted_at IS NULL').all(),
  ).toHaveLength(1);
});

it('returns six actual month-end history points from the explicitly selected earlier start', async () => {
  for (const month of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    setAssigned(opened.db, 'category-604-http', month, 1000, ctx);
  const created = await call('POST', '/goals?month=2026-10', {
    ...goalInput,
    startMonth: '2026-05',
  });
  expect(created.status).toBe(201);
  const report = await call('GET', '/goals/report?month=2026-10');
  expect(report.status).toBe(200);
  const history = report.body.history.find(
    (entry: { id: string }) => entry.id === created.body.goal.id,
  );
  expect(history.points.map((point: { month: string }) => point.month)).toEqual([
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
  ]);
  expect(history.points.map((point: { actualCents: number | null }) => point.actualCents)).toEqual([
    1000,
    2000,
    3000,
    4000,
    5000,
    6000,
    null,
    null,
  ]);
  expect(JSON.stringify(report.body)).not.toContain('lifecycleAnchorJson');
  expect(JSON.stringify(report.body)).not.toContain('lifecycle_anchor_json');
});
