import { createBooking, createEntity, createTestDatabase, createTransfer, getBooking, undo, schema, type OpenedDatabase } from '@budget/db';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { bookingRoutes } from './bookings';
import { errorResponse } from './http';

let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  app = new Hono().route('/bookings', bookingRoutes(opened.db));
  app.onError(errorResponse);
});
afterEach(() => opened.close());
const post = (path: string, body: unknown) => app.request(`/bookings/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const row = (amountCents: number, extra: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(opened.db, {
    accountId: 'giro', date: '2026-10-02', amountCents,
    splits: [{ categoryId: 'essen', amountCents }], ...extra,
  }, testCtx);

it('accounts for every selected id and sums signed native cents independently of pagination', async () => {
  const a = row(-1234), b = row(567), c = row(-890);
  const usd = row(-4321, { accountId: 'usd', currency: 'USD', splits: [{ categoryId: null, amountCents: -4321 }] });
  const response = await post('selection', { ids: [a, b, c, usd, a, 'missing'] });
  expect(response.status).toBe(200);
  const facts = await response.json();
  expect(facts.selectedCount).toBe(5);
  expect(facts.items.map((item: { id: string }) => item.id)).toEqual([a, b, c, usd]);
  expect(facts.missingIds).toEqual(['missing']);
  expect(facts.totals).toEqual([
    { currency: 'EUR', count: 3, cents: -1557, unavailable: null },
    { currency: 'USD', count: 1, cents: -4321, unavailable: null },
  ]);
});

it('skips reconciled and financially linked rows even for flags; one audit group undoes exact mixed rows', async () => {
  const a = row(-1234), b = row(567, { flag: 'blue', memo: 'Retained memo' });
  const locked = row(-890);
  opened.db.update(schema.booking).set({ status: 'reconciled' }).where(eq(schema.booking.id, locked)).run();
  const contact = row(-300, { splits: [{ categoryId: 'auslagen', amountCents: -300, contactId: 'k1' }] });
  const transfer = createTransfer(opened.db, { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-10-02', amountCents: 2500 }, testCtx);
  const ids = [a, b, locked, contact, transfer.fromBookingId, transfer.toBookingId];
  const before = ids.map((id) => getBooking(opened.db, id));
  const response = await post('bulk', { action: 'update', ids, set: { flag: 'orange' }, unlockReconciled: true });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.changed).toEqual([a, b]);
  expect(result.skipped.map((skip: { id: string; reason: string }) => [skip.id, skip.reason])).toEqual([
    [locked, 'reconciled_locked'], [contact, 'linked_contact'],
    [transfer.fromBookingId, 'linked_transfer'], [transfer.toBookingId, 'linked_transfer'],
  ]);
  expect(ids.slice(2).map((id) => getBooking(opened.db, id))).toEqual(before.slice(2));
  const audit = opened.db.select().from(schema.auditLog).where(eq(schema.auditLog.groupId, result.groupId)).all();
  expect(audit).toHaveLength(2);
  expect(audit.map((entry) => entry.entityId).sort()).toEqual([a, b].sort());
  expect(getBooking(opened.db, a)?.flag).toBe('orange');
  expect(getBooking(opened.db, b)?.flag).toBe('orange');
  undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
});

it.each([
  { categoryId: 'miete' }, { status: 'pending' }, { projectId: 'synthetic-project' },
])('uses the existing grouped writer and exact Undo for $categoryId$status$projectId', async (set) => {
  createEntity(opened.db, schema.project, { id: 'synthetic-project', name: 'Synthetic project' }, testCtx);
  const a = row(-1234), b = row(567, { memo: 'Retained memo', flag: 'blue' });
  const ids = [a, b], before = ids.map((id) => getBooking(opened.db, id));
  const response = await post('bulk', { action: 'update', ids, set });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.changed).toEqual(ids);
  expect(result.skipped).toEqual([]);
  expect(ids.map((id) => getBooking(opened.db, id)?.amountCents)).toEqual([-1234, 567]);
  undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
});

it('reports no-op without writing an audit group', async () => {
  const id = row(-101, { flag: 'blue' });
  const before = getBooking(opened.db, id);
  const response = await post('bulk', { action: 'update', ids: [id], set: { flag: 'blue' } });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.changed).toEqual([]);
  expect(result.skipped).toMatchObject([{ id, reason: 'unchanged' }]);
  expect(opened.db.select().from(schema.auditLog).where(eq(schema.auditLog.groupId, result.groupId)).all()).toEqual([]);
  expect(getBooking(opened.db, id)).toEqual(before);
});
