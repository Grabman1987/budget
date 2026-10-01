/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  createTestDatabase,
  schema,
  setAssigned,
  type Db,
} from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-20';
const webDir = mkdtempSync(join(tmpdir(), 'budget-inbox-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;
let bookings: { a: string; b: string; free: string };

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
      openingDate: '2025-01-01',
      openingBalanceCents: 500_000,
    },
    ctx,
  );
  createEntity(db, schema.categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
  categories.create(db, { id: 'essen', name: 'Essen', groupId: 'g', class: 'need' }, ctx);
  setAssigned(db, 'essen', '2026-03', 50_000, ctx);
  createEntity(db, schema.payee, { id: 'p1', name: 'Markt', defaultCategoryId: 'essen' }, ctx);
  const spend = (date: string, amountCents: number, payeeId: string | null) =>
    createBooking(
      db,
      { accountId: 'giro', date, amountCents, payeeId, splits: [{ amountCents }] },
      ctx,
    );
  bookings = {
    a: spend('2026-03-02', -1_200, 'p1'),
    b: spend('2026-03-03', -800, 'p1'),
    free: spend('2026-03-04', -300, null),
  };
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

const splitCategory = (bookingId: string) =>
  db
    .select()
    .from(schema.bookingSplit)
    .all()
    .find((s) => s.bookingId === bookingId)?.categoryId;

describe('GET /inbox', () => {
  it('lists the open items grouped, with count, minutes and letters', async () => {
    const res = await call('GET', '/inbox');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 3, minutes: 2 });
    expect(res.body.groups).toHaveLength(1);
    const group = res.body.groups[0];
    expect(group).toMatchObject({ id: 'uncat', no: 2, title: 'Ohne Kategorie', count: 3 });
    expect(group.items.map((i: any) => i.letter)).toEqual(['A', 'B', 'C']);
    expect(group.items[0]).toMatchObject({
      title: 'Ohne Empfänger · −3,00 €',
      suggestion: null,
      canRule: false,
    });
    expect(group.items[1]).toMatchObject({
      title: 'Markt · −8,00 €',
      suggestion: { categoryId: 'essen', categoryName: 'Essen' },
      canRule: true,
    });
  });

  it('picks up writes made through the API on the next read', async () => {
    await call('GET', '/inbox');
    const res = await call('POST', '/bookings', {
      type: 'booking',
      accountId: 'giro',
      date: '2026-03-10',
      amountCents: -500,
      payeeId: 'p1',
      categoryId: null,
    });
    expect(res.status).toBe(201);
    expect((await call('GET', '/inbox')).body.count).toBe(4);
  });
});

describe('POST /inbox/:id/accept, /rule, /dismiss and undo', () => {
  const firstOf = async (refId: string) =>
    (await call('GET', '/inbox')).body.groups[0].items.find((i: any) => i.refId === refId);

  it('accepts the suggestion; undo through the audit group brings the item back', async () => {
    const item = await firstOf(bookings.a);
    const done = await call('POST', `/inbox/${item.id}/accept`, {});
    expect(done.status).toBe(200);
    expect(done.body.resolvedIds).toEqual([item.id]);
    expect(splitCategory(bookings.a)).toBe('essen');
    expect((await call('GET', '/inbox')).body.count).toBe(2);

    expect((await call('POST', '/undo', { groupId: done.body.groupId })).status).toBe(200);
    expect(splitCategory(bookings.a)).toBeNull();
    expect((await call('GET', '/inbox')).body.count).toBe(3);
  });

  it('answers 422 without a suggestion and takes a chosen category', async () => {
    const item = await firstOf(bookings.free);
    const refused = await call('POST', `/inbox/${item.id}/accept`, {});
    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe('invalid');
    expect((await call('POST', `/inbox/${item.id}/accept`, { categoryId: 'essen' })).status).toBe(
      200,
    );
    expect(splitCategory(bookings.free)).toBe('essen');
    // already resolved
    expect((await call('POST', `/inbox/${item.id}/accept`, {})).status).toBe(409);
  });

  it('"Immer so zuordnen" makes a rule and applies it to the open bookings of the payee', async () => {
    const item = await firstOf(bookings.a);
    const done = await call('POST', `/inbox/${item.id}/rule`, {});
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ applied: 2, categoryId: 'essen' });
    expect(db.select().from(schema.assignmentRule).all()).toHaveLength(1);
    expect([splitCategory(bookings.a), splitCategory(bookings.b)]).toEqual(['essen', 'essen']);
    expect((await call('GET', '/inbox')).body.count).toBe(1);
  });

  it('accepts all suggestions and dismisses', async () => {
    const all = await call('POST', '/inbox/accept-all');
    expect(all.status).toBe(200);
    expect(all.body.resolvedIds).toHaveLength(2);
    const [left] = (await call('GET', '/inbox')).body.groups[0].items;
    expect((await call('POST', `/inbox/${left.id}/dismiss`)).status).toBe(200);
    expect((await call('GET', '/inbox')).body).toEqual({ count: 0, minutes: 0, groups: [] });
  });

  it('rejects an unknown item and a bad body', async () => {
    expect((await call('POST', '/inbox/nope/dismiss')).status).toBe(404);
    expect((await call('POST', '/inbox/nope/accept', { valueCents: -1 })).status).toBe(400);
  });

  it('POST /refresh forces a look at changes made behind the API', async () => {
    await call('GET', '/inbox');
    db.update(schema.bookingSplit).set({ categoryId: 'essen' }).run();
    expect((await call('GET', '/inbox')).body.count).toBe(3); // served from the last run
    expect((await call('POST', '/inbox/refresh')).body.count).toBe(0);
  });
});
