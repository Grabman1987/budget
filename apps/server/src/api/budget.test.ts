/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { createTestDatabase } from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-api-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
/** The session guard has its own tests (auth.test.ts); here every request is signed in. */
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  routes: new Hono(),
};
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp({
    webDir,
    auth: signedIn,
    ledger: { db: createTestDatabase().db, today: () => '2026-10-15' },
  });
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function ok(method: string, path: string, body?: unknown) {
  const res = await call(method, path, body);
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
  return res.body;
}

describe('categories and budget API', () => {
  it('builds categories, fills targets, moves and covers money, merges with one undo', async () => {
    const giro = (
      await ok('POST', '/accounts', {
        name: 'Giro',
        type: 'checking',
        openingDate: '2026-10-01',
        openingBalanceCents: 300_000,
      })
    )['account'];
    const group = (await ok('POST', '/categories/groups', { name: 'Alltag' }))['group'];
    const make = async (name: string, extra: object = {}) =>
      (
        await ok('POST', '/categories', {
          name,
          groupId: group.id,
          class: 'need',
          stage: 2,
          ...extra,
        })
      )['category'];
    const essen = await make('Lebensmittel', { icon: '🛒' });
    const miete = await make('Miete', { kind: 'fixed', stage: 1 });
    const cafe = await make('Café', { class: 'want' });
    expect((await call('POST', '/categories', { name: 'X', groupId: group.id })).status).toBe(422);

    await ok('PUT', `/categories/${miete.id}/target`, {
      validFrom: '2026-10',
      target: { kind: 'monthly', amountCents: 89_000, dueDay: 1 },
    });
    let month = await ok('GET', '/budget/2026-10');
    expect(month['summary']).toMatchObject({
      toBeAssignedCents: 300_000,
      incomeCents: 300_000,
      carryInCents: 0,
    });
    expect(month['categories'].map((c: any) => c.icon)).toEqual(['🛒', null, null]);
    const need = month['summary'].envelopes.find((e: any) => e.categoryId === miete.id);
    expect(need).toMatchObject({ needCents: 89_000, target: { dueDay: 1 } });

    await ok('PUT', '/budget/2026-10/assigned', {
      items: [
        { categoryId: miete.id, assignedCents: 89_000 },
        { categoryId: cafe.id, assignedCents: 5_000 },
      ],
    });
    await ok('POST', '/budget/2026-10/move', { fromId: null, toId: essen.id, amountCents: 1_000 });
    await ok('POST', '/bookings', {
      type: 'booking',
      accountId: giro.id,
      date: '2026-10-03',
      amountCents: -4_000,
      categoryId: essen.id,
    });
    const cover = await ok('POST', '/budget/2026-10/cover', {
      categoryId: essen.id,
      fromId: cafe.id,
    });
    expect(cover['coveredCents']).toBe(3_000);
    month = await ok('GET', '/budget/2026-10');
    expect(month['summary']).toMatchObject({ assignedCents: 95_000, toBeAssignedCents: 205_000 });
    expect(month['summary'].groups).toEqual([
      { groupId: group.id, assignedCents: 95_000, activityCents: -4_000, availableCents: 91_000 },
    ]);

    const merged = await ok('POST', '/categories/merge', {
      sourceIds: [cafe.id],
      targetId: essen.id,
    });
    expect(merged).toMatchObject({ movedSplits: 0, movedMonths: 1 });
    const after = await ok('GET', '/budget/2026-10');
    expect(after['categories']).toHaveLength(2);
    expect(after['summary'].toBeAssignedCents).toBe(205_000);
    await ok('POST', '/undo', { groupId: merged['groupId'] });
    expect((await ok('GET', '/categories'))['categories']).toHaveLength(3);

    const found = await ok('GET', `/categories/${essen.id}/split-off?from=2026-10-01`);
    const split = await ok('POST', `/categories/${essen.id}/split-off`, {
      splitIds: found['splits'].map((s: any) => s.splitId),
      newCategory: { name: 'Drogerie', groupId: group.id, class: 'need' },
    });
    expect(split['moved']).toBe(1);

    await ok('PATCH', `/categories/${cafe.id}`, { hidden: true, icon: '☕' });
    const tree = await ok('GET', '/categories');
    expect(tree['categories'].find((c: any) => c.id === cafe.id)).toMatchObject({ icon: '☕' });
    expect(tree['categories'].find((c: any) => c.id === cafe.id).hiddenAt).not.toBeNull();
    expect((await call('GET', '/budget/2026-13')).status).toBe(400);
  });
});
