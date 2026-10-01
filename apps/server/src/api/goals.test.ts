/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  categories,
  createTestDatabase,
  schema,
  setAssigned,
  createEntity,
  type Db,
} from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-goals-'));
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
  const ctx = { actor: 'tester' };
  accounts.create(
    db,
    {
      id: 'giro',
      name: 'Giro',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
    },
    ctx,
  );
  createEntity(db, schema.categoryGroup, { id: 'g', name: 'Rücklagen' }, ctx);
  categories.create(db, { id: 'reise', name: 'Reisen', groupId: 'g', class: 'want' }, ctx);
  setAssigned(db, 'reise', '2026-09', 54_000, ctx);
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const urlaub = {
  name: 'Urlaub',
  targetCents: 300_000,
  targetDate: '2027-07-31',
  categoryId: 'reise',
};

describe('/api/goals', () => {
  it('creates, lists with the figures of the month of today, edits, deletes, undoes', async () => {
    const created = await call('POST', '/goals', urlaub);
    expect(created.status).toBe(201);
    const id = created.body.goal.id;
    expect(created.body.goal).toMatchObject({
      savedCents: 54_000,
      remainingCents: 246_000,
      monthsLeft: 10,
      neededMonthlyCents: 24_600,
      status: 'behind',
    });

    const list = await call('GET', '/goals');
    expect(list.body.month).toBe('2026-09');
    expect(list.body.goals).toHaveLength(1);
    expect((await call('GET', '/goals?month=2026-08')).body.goals[0].savedCents).toBe(0);

    const patched = await call('PATCH', `/goals/${id}`, { targetCents: 200_000 });
    expect(patched.body.goal).toMatchObject({ targetCents: 200_000, neededMonthlyCents: 14_600 });

    const removed = await call('DELETE', `/goals/${id}`);
    expect((await call('GET', '/goals')).body.goals).toHaveLength(0);
    expect((await call('GET', '/goals?deleted=1')).body.goals).toHaveLength(1);
    expect((await call('POST', '/undo', { groupId: removed.body.groupId })).status).toBe(200);
    expect((await call('GET', '/goals')).body.goals).toHaveLength(1);

    await call('DELETE', `/goals/${id}`);
    expect((await call('POST', `/goals/${id}/restore`)).status).toBe(200);
    expect((await call('GET', '/goals')).body.goals).toHaveLength(1);
  });

  it('refuses invalid input', async () => {
    expect((await call('POST', '/goals', { name: 'X' })).status).toBe(400);
    expect((await call('POST', '/goals', { ...urlaub, targetCents: 0 })).status).toBe(400);
    expect((await call('POST', '/goals', { ...urlaub, targetDate: '2027-02-30' })).status).toBe(
      400,
    );
    expect((await call('POST', '/goals', { ...urlaub, accountId: 'giro' })).status).toBe(422);
    expect((await call('POST', '/goals', { ...urlaub, categoryId: 'nope' })).status).toBe(404);
    expect((await call('PATCH', '/goals/unknown', { name: 'Y' })).status).toBe(404);
    expect((await call('PATCH', '/goals/unknown', {})).status).toBe(400);
  });

  it('adopt writes the category target, one undo removes it again', async () => {
    const { body } = await call('POST', '/goals', urlaub);
    const adopted = await call('POST', `/goals/${body.goal.id}/adopt`, {});
    expect(adopted.status).toBe(200);
    const targets = () => call('GET', '/categories').then((r) => r.body.targets);
    expect(await targets()).toMatchObject([
      { categoryId: 'reise', kind: 'by_date', amountCents: 300_000, validFrom: '2026-09' },
    ]);
    await call('POST', '/undo', { groupId: adopted.body.groupId });
    expect(await targets()).toEqual([]);
  });
});
