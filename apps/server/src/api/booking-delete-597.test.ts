import { createBooking, createTestDatabase, createTransfer, getBooking, schema, updateBooking, type BookingBulkSelection, type OpenedDatabase } from '@budget/db';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
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
const row = (amountCents: number, extra: Partial<Parameters<typeof createBooking>[1]> = {}) => createBooking(opened.db, {
  accountId: 'giro', date: '2026-10-02', amountCents,
  splits: [{ categoryId: 'essen', amountCents }], ...extra,
}, testCtx);
type Preview = {
  ids: string[];
  selection: BookingBulkSelection;
  eligibleIds: string[];
  eligibleTotals: BookingBulkSelection['totals'];
  skipped: { id: string; reason: string }[];
  revision: string;
};

it('previews exact signed native deletion totals and names all protected or missing selected rows without writing', async () => {
  const a = row(-1234, { splits: [{ categoryId: 'essen', amountCents: -1000 }, { categoryId: 'miete', amountCents: -234 }] });
  const b = row(567);
  const usd = row(-4321, { accountId: 'usd', currency: 'USD', splits: [{ categoryId: null, amountCents: -4321 }] });
  const locked = row(-890, { status: 'reconciled' });
  const contact = row(-300, { splits: [{ categoryId: 'auslagen', contactId: 'anna', amountCents: -300 }] });
  const transfer = createTransfer(opened.db, { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-10-02', amountCents: 2500 }, testCtx);
  const ids = [a, b, usd, locked, contact, transfer.fromBookingId, transfer.toBookingId, 'missing'];
  const before = ids.map((id) => getBooking(opened.db, id));
  const auditBefore = opened.db.select().from(schema.auditLog).all();
  const response = await post('delete-preview', { ids });
  expect(response.status).toBe(200);
  const preview = await response.json() as Preview;
  expect(preview.ids).toEqual([...ids].sort());
  expect(preview.eligibleIds.sort()).toEqual([a, b, usd].sort());
  expect(preview.eligibleTotals).toEqual([
    { currency: 'EUR', count: 2, cents: -667, unavailable: null },
    { currency: 'USD', count: 1, cents: -4321, unavailable: null },
  ]);
  expect(new Map(preview.skipped.map((item) => [item.id, item.reason]))).toEqual(new Map([
    [locked, 'reconciled_locked'], [contact, 'linked_contact'],
    [transfer.fromBookingId, 'linked_transfer'], [transfer.toBookingId, 'linked_transfer'], ['missing', 'not_found'],
  ]));
  expect(preview.selection.totals).toEqual([
    { currency: 'EUR', count: 6, cents: -1857, unavailable: null },
    { currency: 'USD', count: 1, cents: -4321, unavailable: null },
  ]);
  expect(preview.revision).toMatch(/^[a-f0-9]{64}$/);
  expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual(auditBefore);
});

it('binds the preview to exact current cents, splits, selected identities and audited source state', async () => {
  const a = row(-1234);
  const b = row(567);
  const read = async (ids: string[]) => (await (await post('delete-preview', { ids })).json()) as Preview;
  const first = await read([a, b]);
  expect((await read([b, a, a])).revision).toBe(first.revision);
  expect((await read([a])).revision).not.toBe(first.revision);
  updateBooking(opened.db, a, { memo: 'Changed after preview' }, testCtx);
  expect((await read([a, b])).revision).not.toBe(first.revision);
});
