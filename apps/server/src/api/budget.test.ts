/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { createTestDatabase, reportTables, type Db } from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-api-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
let app: ReturnType<typeof createApp>;
let db: Db;
/** The session guard has its own tests (auth.test.ts); here every request is signed in. */
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

beforeEach(() => {
  db = createTestDatabase().db;
  app = createApp({
    webDir,
    auth: signedIn,
    ledger: { db, today: () => '2026-10-15' },
  });
});

it('quick assigns shared target/history cents in one capped, undoable group', async () => {
  const account = (
    await ok('POST', '/accounts', {
      name: 'Synthetic plan account',
      type: 'checking',
      openingDate: '2026-07-01',
      // 3,329 cents stay reserved in History after September's assignment/spending.
      openingBalanceCents: 103_329,
    })
  )['account'];
  const group = (await ok('POST', '/categories/groups', { name: 'Synthetic plan' }))['group'];
  const make = async (name: string, extra = {}) =>
    (
      await ok('POST', '/categories', {
        name,
        groupId: group.id,
        class: 'need',
        kind: 'variable',
        stage: 2,
        ...extra,
      })
    )['category'];
  const target = await make('Target');
  const history = await make('History');
  const empty = await make('Empty');
  const income = await make('Income', { kind: 'income', class: null, stage: null });
  await ok('PUT', `/categories/${target.id}/target`, {
    validFrom: '2026-10',
    target: { kind: 'monthly', amountCents: 40_001 },
  });
  for (const [month, amountCents] of [
    ['2026-07', -10_001],
    ['2026-08', -20_002],
    ['2026-09', -30_004],
  ] as const)
    await ok('POST', '/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `${month}-02`,
      amountCents,
      categoryId: history.id,
    });
  await ok('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-08-03',
    amountCents: 1_000,
    categoryId: history.id,
  });
  await ok('PUT', '/budget/2026-09/assigned', {
    items: [{ categoryId: history.id, assignedCents: 33_333 }],
  });
  const view = await ok('GET', '/budget/2026-10');
  expect(view['summary'].toBeAssignedCents).toBe(40_993);
  const env = (id: string, v = view) =>
    v['summary'].envelopes.find((e: any) => e.categoryId === id);
  const tables = reportTables(db, { today: '2026-09-30' });
  expect(tables.months.map((m) => m.spending[history.id])).toEqual([10_001, 19_002, 30_004]);
  expect(env(history.id).quickAssign).toEqual({
    lastMonthCents: 33_333,
    averageCents: 19_669,
    ghostCents: 19_002,
    ghostSource: 'median',
    historyMonths: ['2026-07', '2026-08', '2026-09'],
  });
  expect(env(target.id).quickAssign.ghostCents).toBe(env(target.id).needCents);
  expect(env(empty.id).quickAssign.ghostCents).toBe(0);
  const fill = await ok('POST', '/budget/2026-10/quick-assign', {
    mode: 'empty',
    categoryIds: [target.id, history.id, empty.id],
  });
  expect(fill).toMatchObject({ changedCount: 2, openCount: 1, missingCents: 18_010 });
  const filled = await ok('GET', '/budget/2026-10');
  expect(filled['summary'].toBeAssignedCents).toBe(0);
  expect(env(target.id, filled).assignedCents).toBe(40_001);
  expect(env(history.id, filled).assignedCents).toBe(992);
  // Repeated/stale empty-fill must never overwrite an already assigned category.
  expect(
    (
      await ok('POST', '/budget/2026-10/quick-assign', {
        mode: 'empty',
        categoryIds: [target.id, history.id],
      })
    ).changedCount,
  ).toBe(0);
  const undone = await ok('POST', '/undo', { groupId: fill.groupId });
  expect(env(target.id, await ok('GET', '/budget/2026-10')).assignedCents).toBe(0);
  const redone = await ok('POST', '/undo', { groupId: undone.groupId });
  expect(env(history.id, await ok('GET', '/budget/2026-10')).assignedCents).toBe(992);
  await ok('POST', '/undo', { groupId: redone.groupId });
  for (const [mode, expected] of [
    ['last-month', 33_333],
    ['average', 19_669],
  ] as const) {
    const assigned = await ok('POST', '/budget/2026-10/quick-assign', {
      mode,
      categoryIds: [history.id, empty.id],
    });
    expect(env(history.id, await ok('GET', '/budget/2026-10')).assignedCents).toBe(expected);
    await ok('POST', '/undo', { groupId: assigned.groupId });
  }
  const goal = await ok('POST', '/budget/2026-10/quick-assign', {
    mode: 'target',
    categoryIds: [target.id, empty.id],
  });
  expect(env(target.id, await ok('GET', '/budget/2026-10')).assignedCents).toBe(40_001);
  await ok('POST', '/undo', { groupId: goal.groupId });
  await ok('PUT', '/budget/2026-11/assigned', {
    items: [{ categoryId: history.id, assignedCents: 1_234 }],
  });
  const future = await ok('GET', '/budget/2026-12');
  expect(env(history.id, future).quickAssign.lastMonthCents).toBe(
    env(history.id, await ok('GET', '/budget/2026-11')).assignedCents,
  );
  for (const categoryIds of [
    [history.id, income.id],
    [history.id, 'missing'],
  ])
    expect(
      (await call('POST', '/budget/2026-10/quick-assign', { mode: 'empty', categoryIds })).status,
    ).toBe(422);
  for (const categoryIds of [[history.id, history.id], []])
    expect(
      (await call('POST', '/budget/2026-10/quick-assign', { mode: 'empty', categoryIds })).status,
    ).toBe(400);
  expect(env(history.id, await ok('GET', '/budget/2026-10')).assignedCents).toBe(0);
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

    // The guard: more than "Zu verteilen" holds is refused with 422 and names the maximum; a
    // write that only reduces or reshuffles passes. Only "Decken" can confirm going below 0.
    const tooMuch = await call('PUT', '/budget/2026-10/assigned', {
      items: [{ categoryId: cafe.id, assignedCents: 5_000 + 205_001 }],
    });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body).toMatchObject({ error: 'category_rule' });
    expect(tooMuch.body['message']).toContain('Höchstens 2.050,00 € mehr');
    expect(
      (
        await call('POST', '/budget/2026-10/move', {
          fromId: null,
          toId: cafe.id,
          amountCents: 205_001,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call('PUT', '/budget/2026-10/assigned', {
          items: [{ categoryId: cafe.id, assignedCents: 0 }],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call('PUT', '/budget/2026-10/assigned', {
          items: [{ categoryId: cafe.id, assignedCents: 2_000 }],
        })
      ).status,
    ).toBe(200);
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
      newCategory: {
        name: 'Drogerie',
        groupId: group.id,
        class: 'need',
        target: { validFrom: '2026-10', target: { kind: 'monthly', amountCents: 4_000 } },
      },
    });
    expect(split['moved']).toBe(1);
    // The target of the new category is stored, not dropped.
    const targets = (await ok('GET', '/categories'))['targets'];
    expect(targets.find((t: any) => t.categoryId === split['targetId'])).toMatchObject({
      amountCents: 4_000,
    });

    await ok('PATCH', `/categories/${cafe.id}`, { hidden: true, icon: '☕' });
    const tree = await ok('GET', '/categories');
    expect(tree['categories'].find((c: any) => c.id === cafe.id)).toMatchObject({ icon: '☕' });
    expect(tree['categories'].find((c: any) => c.id === cafe.id).hiddenAt).not.toBeNull();
    expect((await call('GET', '/budget/2026-13')).status).toBe(400);
  });
});

it('bulk cover uses one selected source or suggestions in stage order, stops at zero, one undo/redo', async () => {
  const account = (
    await ok('POST', '/accounts', {
      name: 'Testkonto',
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: 10_000,
      overdraftLimitCents: 3500,
    })
  ).account;
  const group = (await ok('POST', '/categories/groups', { name: 'Testgruppe' })).group;
  const make = async (name: string, stage: number) =>
    (await ok('POST', '/categories', { name, stage, groupId: group.id, class: 'need' })).category
      .id;
  const later = await make('Später', 3);
  const first = await make('Zuerst', 1);
  const last = await make('Zuletzt', 4);
  const large = await make('Große Quelle', 2);
  const small = await make('Kleine Quelle', 2);
  await ok('PUT', '/budget/2026-10/assigned', {
    items: [
      { categoryId: large, assignedCents: 2000 },
      { categoryId: small, assignedCents: 800 },
    ],
  });
  for (const [categoryId, amountCents] of [
    [later, -2000],
    [first, -1200],
    [last, -300],
  ] as const)
    await ok('POST', '/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-10-03',
      categoryId,
      amountCents,
    });
  const before = (await ok('GET', '/budget/2026-10')).summary;
  const remaining = async () =>
    Object.fromEntries(
      (await ok('GET', '/budget/2026-10')).summary.envelopes.map((e: any) => [
        e.categoryId,
        e.availableCents,
      ]),
    );
  const result = await ok('POST', '/budget/2026-10/move', { coverAll: true, fromId: large });
  expect(result).toMatchObject({ coveredCount: 1, openCount: 2, missingCents: 1500 });
  expect(await remaining()).toMatchObject({
    [first]: 0,
    [later]: -1200,
    [last]: -300,
    [large]: 0,
    [small]: 800,
  });
  const undo = await ok('POST', '/undo', { groupId: result.groupId });
  expect((await ok('GET', '/budget/2026-10')).summary).toEqual(before);
  const redo = await ok('POST', '/undo', { groupId: undo.groupId });
  expect(await remaining()).toMatchObject({ [first]: 0, [later]: -1200, [large]: 0 });
  await ok('POST', '/undo', { groupId: redo.groupId });
  const freeCover = await ok('POST', '/budget/2026-10/move', { coverAll: true, fromId: null });
  expect(freeCover).toMatchObject({ coveredCount: 3, openCount: 0, missingCents: 0 });
  await ok('POST', '/undo', { groupId: freeCover.groupId });
  // Drain unassigned money into a fully spent envelope; suggestions must stop with two open.
  const held = await make('Gebunden', 9);
  await ok('PUT', '/budget/2026-10/assigned', {
    items: [{ categoryId: held, assignedCents: before.toBeAssignedCents }],
  });
  await ok('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-03',
    categoryId: held,
    amountCents: -before.toBeAssignedCents,
  });
  const drained = (await ok('GET', '/budget/2026-10')).summary;
  const auto = await ok('POST', '/budget/2026-10/move', { coverAll: true });
  expect(auto).toMatchObject({ coveredCount: 1, openCount: 2, missingCents: 700 });
  expect(await remaining()).toMatchObject({
    [first]: 0,
    [later]: -400,
    [last]: -300,
    [large]: 0,
    [small]: 0,
  });
  await ok('POST', '/undo', { groupId: auto.groupId });
  expect((await ok('GET', '/budget/2026-10')).summary).toEqual(drained);
  expect(
    (await call('POST', '/budget/2026-10/move', { coverAll: true, fromId: 'missing' })).status,
  ).toBe(404);
  expect((await ok('GET', '/budget/2026-10')).summary).toEqual(drained);
  expect(
    (await call('POST', '/budget/2026-10/move', { coverAll: true, fromId: first })).status,
  ).toBe(422);
  expect(
    (await call('POST', '/budget/2026-10/move', { coverAll: true, fromId: large, amountCents: 1 }))
      .status,
  ).toBe(400);
});

it('bulk cover includes a payment envelope and accounts for funding it from covered card spending', async () => {
  const account = (
    await ok('POST', '/accounts', {
      name: 'Testkarte',
      type: 'credit_card',
      openingDate: '2026-10-01',
      openingBalanceCents: -10000,
    })
  ).account;
  await ok('POST', '/accounts', {
    name: 'Testgiro',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 10000,
    overdraftLimitCents: 3000,
  });
  const group = (await ok('POST', '/categories/groups', { name: 'Testdeckung' })).group;
  const target = (
    await ok('POST', '/categories', {
      name: 'Testkauf',
      groupId: group.id,
      stage: 1,
      class: 'need',
    })
  ).category;
  const source = (
    await ok('POST', '/categories', {
      name: 'Testquelle',
      groupId: group.id,
      stage: 2,
      class: 'want',
    })
  ).category;
  const payment = (
    await ok('POST', '/categories', {
      name: 'Testzahlung',
      groupId: group.id,
      stage: 3,
      kind: 'card_payment',
      cardAccountId: account.id,
    })
  ).category;
  await ok('PUT', '/budget/2026-10/assigned', {
    items: [
      { categoryId: source.id, assignedCents: 2000 },
      { categoryId: payment.id, assignedCents: -1000 },
    ],
  });
  await ok('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    categoryId: target.id,
    date: '2026-10-03',
    amountCents: -1000,
  });
  const before = (await ok('GET', '/budget/2026-10')).summary;
  const result = await ok('POST', '/budget/2026-10/move', { coverAll: true, fromId: source.id });
  expect(result).toMatchObject({ coveredCount: 2, openCount: 0, missingCents: 0 });
  const after = (await ok('GET', '/budget/2026-10')).summary;
  expect(
    Object.fromEntries(after.envelopes.map((e: any) => [e.categoryId, e.availableCents])),
  ).toMatchObject({ [target.id]: 0, [source.id]: 1000, [payment.id]: 0 });
  await ok('POST', '/undo', { groupId: result.groupId });
  expect((await ok('GET', '/budget/2026-10')).summary).toEqual(before);
  expect(
    (await call('POST', '/budget/2026-10/move', { coverAll: true, fromId: payment.id })).status,
  ).toBe(422);
});

it('refuses a card-payment source for a single cover with the bulk-cover message', async () => {
  const account = (
    await ok('POST', '/accounts', {
      name: 'Testkarte',
      type: 'credit_card',
      openingDate: '2026-10-01',
      openingBalanceCents: 0,
    })
  ).account;
  const group = (await ok('POST', '/categories/groups', { name: 'Testquellen' })).group;
  const payment = (
    await ok('POST', '/categories', {
      name: 'Testzahlung',
      groupId: group.id,
      kind: 'card_payment',
      cardAccountId: account.id,
    })
  ).category;
  const result = await call('POST', '/budget/2026-10/cover', {
    categoryId: 'test',
    fromId: payment.id,
  });
  expect([400, 422]).toContain(result.status);
  expect(JSON.stringify(result.body)).toContain('Diese Kategorie ist keine Deckungsquelle.');
});

it('rejects the old negative-money cover override before any mutation', async () => {
  const result = await call('POST', '/budget/2026-10/cover', {
    categoryId: 'test',
    fromId: null,
    allowNegative: true,
  });
  expect(result.status).toBe(400);
});
