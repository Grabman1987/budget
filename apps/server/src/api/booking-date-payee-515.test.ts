import {
  accountBalances,
  createBooking,
  createPayee,
  createTransfer,
  createTestDatabase,
  getBooking,
  schema,
  settleContact,
  undo,
  updateBooking,
  type OpenedDatabase,
} from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { bookingRoutes } from './bookings';
import { errorResponse } from './http';
import type { bookingFieldPreview } from './booking-note-preview';

let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  app = new Hono().route('/bookings', bookingRoutes(opened.db));
  app.onError(errorResponse);
});
afterEach(() => opened.close());
const post = (path: string, body: unknown) =>
  app.request(`/bookings/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const row = (
  date: string,
  cents: number,
  extra: Partial<Parameters<typeof createBooking>[1]> = {},
) =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents: cents,
      splits: [{ categoryId: 'essen', amountCents: cents }],
      ...extra,
    },
    testCtx,
  );
type Preview = ReturnType<typeof bookingFieldPreview>;
const datePreview = async (ids: string[], date = '2026-10-03') => {
  const response = await post('date-preview', { ids, date });
  expect(response.status).toBe(200);
  return response.json() as Promise<Preview>;
};
const dateApply = (p: Preview, date = '2026-10-03') =>
  post('bulk', { action: 'update', ids: p.ids, set: { date }, previewRevision: p.revision });
const payeePreview = async (ids: string[], payeeId: string | null) => {
  const response = await post('payee-preview', { ids, payeeId });
  expect(response.status).toBe(200);
  return response.json() as Promise<Preview>;
};
const payeeApply = (p: Preview, payeeId: string | null) =>
  post('bulk', { action: 'update', ids: p.ids, set: { payeeId }, previewRevision: p.revision });
const auditRows = () => opened.db.select().from(schema.auditLog).all();
const essenByMonth = () =>
  Object.fromEntries(
    opened.sqlite
      .prepare(
        `SELECT substr(b.date,1,7) AS m, SUM(s.amount_cents) AS c FROM booking_split s
         JOIN booking b ON b.id = s.booking_id
         WHERE b.deleted_at IS NULL AND s.category_id = 'essen' GROUP BY m`,
      )
      .all()
      .map((r) => [(r as { m: string }).m, (r as { c: number }).c]),
  );
const giro = (asOf?: string) =>
  accountBalances(opened.db, asOf).find((b) => b.accountId === 'giro')!.balanceCents;

it('moves only eligible dates, reports skips and month shifts, and undoes everything at once', async () => {
  const a = row('2026-09-30', -1000),
    b = row('2026-10-01', -234),
    same = row('2026-10-03', -300),
    locked = row('2026-09-29', -50, { status: 'reconciled' });
  const outlay = row('2026-09-28', -70, {
    splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -70 }],
  });
  const settlement = settleContact(
    opened.db,
    'k1',
    { accountId: 'giro', date: '2026-10-04', amountCents: 70 },
    testCtx,
  ).bookingId;
  const transfer = createTransfer(
    opened.db,
    { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-09-27', amountCents: 2500 },
    testCtx,
  );
  const ids = [
    a,
    b,
    same,
    locked,
    outlay,
    settlement,
    transfer.fromBookingId,
    transfer.toBookingId,
  ];
  const before = ids.map((id) => getBooking(opened.db, id));
  const auditBefore = auditRows();
  expect(essenByMonth()).toEqual({ '2026-09': -1050, '2026-10': -534 });
  const balanceBefore = giro(),
    septBefore = giro('2026-09-30');

  const p = await datePreview([...ids, a, 'missing']);
  expect(p.ids).toHaveLength(9);
  expect(p.changed).toEqual([a, b].sort());
  expect(p.unchanged).toEqual([same]);
  expect(new Map(p.skipped.map((s) => [s.id, s.reason]))).toEqual(
    new Map([
      [locked, 'reconciled_locked'],
      [outlay, 'linked_contact'],
      [settlement, 'linked_contact'],
      [transfer.fromBookingId, 'linked_transfer'],
      [transfer.toBookingId, 'linked_transfer'],
      ['missing', 'not_found'],
    ]),
  );
  expect(p.monthShifts).toEqual([
    { month: '2026-09', deltaCents: 1000 },
    { month: '2026-10', deltaCents: -1000 },
  ]);
  expect(auditRows()).toEqual(auditBefore);

  const response = await dateApply(p);
  expect(response.status).toBe(200);
  const result = (await response.json()) as { changed: string[]; groupId: string };
  expect(result.changed).toEqual([a, b].sort());
  for (const [index, id] of ids.entries()) {
    const after = getBooking(opened.db, id);
    if (id === a || id === b) {
      expect(after?.date).toBe('2026-10-03');
      expect({ ...after, date: before[index]!.date, updatedAt: before[index]!.updatedAt }).toEqual(
        before[index],
      );
    } else expect(after).toEqual(before[index]);
  }
  const audit = auditRows().filter((entry) => entry.groupId === result.groupId);
  expect(audit.map((entry) => [entry.entityType, entry.entityId])).toEqual(
    [a, b].sort().map((id) => ['booking', id]),
  );
  expect(auditRows()).toHaveLength(auditBefore.length + 2);
  // Amounts untouched: the full balance is the same, the September snapshot lost the moved -1000.
  expect(giro()).toBe(balanceBefore);
  expect(giro('2026-09-30')).toBe(septBefore + 1000);
  expect(essenByMonth()).toEqual({ '2026-09': -50, '2026-10': -1534 });

  undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
  expect(essenByMonth()).toEqual({ '2026-09': -1050, '2026-10': -534 });
  expect(giro('2026-09-30')).toBe(septBefore);
  expect((await dateApply(p)).status).toBe(409);
});

it.each(['edit', 'lock'] as const)(
  'rejects a date apply after a concurrent %s without changing anything',
  async (change) => {
    const a = row('2026-09-30', -1000),
      b = row('2026-10-01', -234);
    const p = await datePreview([a, b]);
    if (change === 'lock')
      opened.sqlite.prepare("UPDATE booking SET status='reconciled' WHERE id=?").run(b);
    else updateBooking(opened.db, b, { memo: 'Concurrent' }, { ...testCtx, groupId: 'concurrent' });
    const before = [getBooking(opened.db, a), getBooking(opened.db, b)],
      auditBefore = auditRows();
    expect((await dateApply(p)).status).toBe(409);
    expect([getBooking(opened.db, a), getBooking(opened.db, b)]).toEqual(before);
    expect(auditRows()).toEqual(auditBefore);
  },
);

it('rolls back the first date and its audit entry when the second write fails', async () => {
  const ids = [row('2026-09-30', -1000), row('2026-10-01', -234)].sort();
  const p = await datePreview(ids);
  const before = ids.map((id) => getBooking(opened.db, id)),
    auditBefore = auditRows();
  opened.sqlite.exec(`CREATE TRIGGER synthetic_date_fail BEFORE UPDATE ON booking
    BEGIN SELECT CASE WHEN OLD.id = '${ids[1]}' THEN RAISE(ABORT, 'synthetic failure') END; END`);
  expect((await dateApply(p)).status).toBeGreaterThanOrEqual(400);
  expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
  expect(auditRows()).toEqual(auditBefore);
});

it('changes the payee only, keeps categories and amounts, and undoes in one step', async () => {
  const target = createPayee(
    opened.db,
    { name: 'Synthetic Shop', defaultCategoryId: 'reise' },
    testCtx,
  ).id;
  const a = row('2026-10-01', -1000),
    b = row('2026-10-02', -234, { payeeId: 'p1' }),
    same = row('2026-10-03', -5, { payeeId: target }),
    locked = row('2026-10-04', -50, { status: 'reconciled' });
  const transfer = createTransfer(
    opened.db,
    { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-10-05', amountCents: 2500 },
    testCtx,
  );
  const ids = [a, b, same, locked, transfer.fromBookingId, transfer.toBookingId];
  const before = ids.map((id) => getBooking(opened.db, id));
  const auditBefore = auditRows();
  const p = await payeePreview(ids, target);
  expect(p.changed).toEqual([a, b].sort());
  expect(p.unchanged).toEqual([same]);
  expect(new Map(p.skipped.map((s) => [s.id, s.reason]))).toEqual(
    new Map([
      [locked, 'reconciled_locked'],
      [transfer.fromBookingId, 'linked_transfer'],
      [transfer.toBookingId, 'linked_transfer'],
    ]),
  );
  expect(auditRows()).toEqual(auditBefore);
  const balance = giro();
  const response = await payeeApply(p, target);
  expect(response.status).toBe(200);
  const result = (await response.json()) as { changed: string[]; groupId: string };
  expect(result.changed).toEqual([a, b].sort());
  for (const [index, id] of ids.entries()) {
    const after = getBooking(opened.db, id);
    if (id === a || id === b) {
      expect(after?.payeeId).toBe(target);
      // The payee's default category is NOT applied: splits (categories, cents) stay identical.
      expect({
        ...after,
        payeeId: before[index]!.payeeId,
        updatedAt: before[index]!.updatedAt,
      }).toEqual(before[index]);
    } else expect(after).toEqual(before[index]);
  }
  expect(essenByMonth()).toEqual({ '2026-10': -1289 });
  expect(giro()).toBe(balance);
  expect(auditRows().filter((entry) => entry.groupId === result.groupId)).toHaveLength(2);
  undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
  expect((await payeeApply(p, target)).status).toBe(409);
});

it('clears a payee and rejects a stale payee preview', async () => {
  const a = row('2026-10-01', -1000, { payeeId: 'p1' });
  const p = await payeePreview([a], null);
  expect(p.changed).toEqual([a]);
  updateBooking(opened.db, a, { memo: 'Concurrent' }, { ...testCtx, groupId: 'concurrent' });
  expect((await payeeApply(p, null)).status).toBe(409);
  expect(getBooking(opened.db, a)?.payeeId).toBe('p1');
  const fresh = await payeePreview([a], null);
  expect((await payeeApply(fresh, null)).status).toBe(200);
  expect(getBooking(opened.db, a)?.payeeId).toBeNull();
});

it('binds the revision to the field and value and rejects invalid input', async () => {
  const a = row('2026-09-30', -1000);
  const before = getBooking(opened.db, a),
    auditBefore = auditRows();
  const p = await datePreview([a]);
  expect((await dateApply(p, '2026-10-04')).status).toBe(409);
  // A date revision cannot authorise a payee write.
  expect((await payeeApply(p, 'p1')).status).toBe(409);
  expect((await post('date-preview', { ids: [a], date: '2026-02-30' })).status).toBe(400);
  expect((await post('date-preview', { ids: [a], date: 'tomorrow' })).status).toBe(400);
  expect((await post('payee-preview', { ids: [a], payeeId: 'unknown' })).status).toBe(400);
  expect(
    (
      await post('bulk', {
        action: 'update',
        ids: [a],
        set: { payeeId: 'unknown' },
        previewRevision: p.revision,
      })
    ).status,
  ).toBe(400);
  for (const set of [
    { date: '2026-10-04', payeeId: 'p1' },
    { date: '2026-10-04', flag: 'blue' },
    { date: '2026-02-30' },
  ])
    expect((await post('bulk', { action: 'update', ids: [a], set })).status).toBe(400);
  expect(
    (await post('bulk', { action: 'update', ids: [a], set: { date: '2026-10-04' } })).status,
  ).toBe(409);
  expect(getBooking(opened.db, a)).toEqual(before);
  expect(auditRows()).toEqual(auditBefore);
});
