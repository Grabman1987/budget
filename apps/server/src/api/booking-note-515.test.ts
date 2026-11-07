import {
  accounts,
  createBooking,
  createSecurity,
  createTestDatabase,
  createTrade,
  createTransfer,
  getBooking,
  importBooking,
  schema,
  settleContact,
  undo,
  updateBooking,
  type OpenedDatabase,
} from '@budget/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { bookingRoutes } from './bookings';
import { errorResponse } from './http';
import type { bookingNotePreview } from './booking-note-preview';

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
const row = (memo: string | null, extra: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-02',
      amountCents: -1234,
      memo,
      splits: [{ categoryId: 'essen', amountCents: -1234, memo: 'Synthetic split note' }],
      ...extra,
    },
    testCtx,
  );
type Preview = ReturnType<typeof bookingNotePreview>;
const preview = async (ids: string[], memo: string | null = 'Synthetic common note') => {
  const response = await post('note-preview', { ids, memo });
  expect(response.status).toBe(200);
  return response.json() as Promise<Preview>;
};
const apply = (p: Preview) =>
  post('bulk', {
    action: 'update',
    ids: p.ids,
    set: { memo: p.memo },
    previewRevision: p.revision,
  });
const auditRows = () => opened.db.select().from(schema.auditLog).all();

it('protects current trade settlements as well as historical trade provenance', async () => {
  accounts.create(
    opened.db,
    {
      id: 'synthetic-depot',
      name: 'Synthetic depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-09-01',
    },
    testCtx,
  );
  createSecurity(
    opened.db,
    { id: 'synthetic-security', name: 'Synthetic security', kind: 'etf' },
    testCtx,
  );
  const id = createTrade(
    opened.db,
    {
      securityId: 'synthetic-security',
      accountId: 'synthetic-depot',
      date: '2026-10-02',
      kind: 'buy',
      unitsE8: 100_000_000,
      amountCents: 1234,
    },
    testCtx,
  ).bookingId!;
  const before = getBooking(opened.db, id),
    auditBefore = auditRows();
  const p = await preview([id]);
  expect(p.changed).toEqual([]);
  expect(p.skipped).toMatchObject([{ id, reason: 'linked_trade' }]);
  expect((await apply(p)).status).toBe(200);
  expect(getBooking(opened.db, id)).toEqual(before);
  expect(auditRows()).toEqual(auditBefore);
});

it('protects legacy bank-source notes without a bankSourceId or candidate', async () => {
  const id = importBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-02',
      amountCents: -234,
      source: 'bank',
      importKey: 'synthetic-legacy-bank',
      memo: 'Synthetic raw note',
      splits: [{ categoryId: 'essen', amountCents: -234 }],
    },
    testCtx,
  ).id;
  const before = getBooking(opened.db, id),
    auditBefore = auditRows();
  expect(before).toMatchObject({ bankSourceId: null, source: 'bank' });
  const p = await preview([id]);
  expect(p.changed).toEqual([]);
  expect(p.skipped).toMatchObject([{ id, reason: 'linked_bank' }]);
  expect((await apply(p)).status).toBe(200);
  expect(getBooking(opened.db, id)).toEqual(before);
  expect(auditRows()).toEqual(auditBefore);
});

it('previews without writing, skips owners, changes only notes and restores exact rows in one Undo', async () => {
  const a = row('Synthetic first'),
    b = row(null, {
      splits: [
        { categoryId: 'essen', amountCents: -1000, memo: 'Split A' },
        { categoryId: 'miete', amountCents: -234, memo: 'Split B' },
      ],
    });
  const locked = row('Synthetic locked', { status: 'reconciled' });
  const contact = row('Synthetic outlay', {
    splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -1234 }],
  });
  const settlement = settleContact(
    opened.db,
    'k1',
    { accountId: 'giro', date: '2026-10-03', amountCents: 1234 },
    testCtx,
  ).bookingId;
  const transfer = createTransfer(
    opened.db,
    { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-10-02', amountCents: 2500 },
    testCtx,
  );
  const historicalTrade = row('Synthetic former trade');
  // Historical trade provenance remains protective even without a current trade row.
  opened.db
    .insert(schema.auditLog)
    .values({
      id: 'synthetic-trade-audit',
      action: 'delete',
      entityType: 'trade',
      entityId: 'synthetic-trade',
      beforeJson: JSON.stringify({ booking_id: historicalTrade }),
    })
    .run();
  const ids = [
    a,
    b,
    locked,
    contact,
    settlement,
    transfer.fromBookingId,
    transfer.toBookingId,
    historicalTrade,
  ];
  const before = ids.map((id) => getBooking(opened.db, id));
  const auditBefore = auditRows();
  const p = await preview([...ids, a, 'missing']);
  expect(p.ids).toHaveLength(9);
  expect(p.changed).toEqual([a, b].sort());
  expect(new Map(p.skipped.map((s) => [s.id, s.reason]))).toEqual(
    new Map([
      [locked, 'reconciled_locked'],
      [contact, 'linked_contact'],
      [settlement, 'linked_contact'],
      [transfer.fromBookingId, 'linked_transfer'],
      [transfer.toBookingId, 'linked_transfer'],
      [historicalTrade, 'linked_trade'],
      ['missing', 'not_found'],
    ]),
  );
  expect(auditRows()).toEqual(auditBefore);
  const response = await apply(p);
  expect(response.status).toBe(200);
  const result = (await response.json()) as { changed: string[]; groupId: string };
  expect(result.changed).toEqual([a, b].sort());
  for (const [index, id] of ids.entries()) {
    const after = getBooking(opened.db, id);
    if ([a, b].includes(id)) {
      expect(after?.memo).toBe('Synthetic common note');
      expect({ ...after, memo: before[index]!.memo, updatedAt: before[index]!.updatedAt }).toEqual(
        before[index],
      );
    } else expect(after).toEqual(before[index]);
  }
  const audit = auditRows().filter((entry) => entry.groupId === result.groupId);
  expect(audit).toHaveLength(2);
  expect(audit.map((entry) => [entry.entityType, entry.entityId])).toEqual(
    [a, b].sort().map((id) => ['booking', id]),
  );
  undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
  expect((await apply(p)).status).toBe(409);
});

it.each(['edit', 'lock', 'undo'] as const)(
  'rejects a stale preview after %s without changing any selected row',
  async (change) => {
    const a = row('Synthetic A'),
      b = row('Synthetic B');
    const p = await preview([a, b]);
    if (change === 'lock')
      opened.db
        .update(schema.booking)
        .set({ status: 'reconciled' })
        .where(eq(schema.booking.id, b))
        .run();
    else {
      updateBooking(
        opened.db,
        b,
        { memo: 'Concurrent note' },
        { ...testCtx, groupId: 'concurrent' },
      );
      if (change === 'undo') undo(opened.db, { groupId: 'concurrent' }, testCtx);
    }
    const before = [getBooking(opened.db, a), getBooking(opened.db, b)],
      auditBefore = auditRows();
    expect((await apply(p)).status).toBe(409);
    expect([getBooking(opened.db, a), getBooking(opened.db, b)]).toEqual(before);
    expect(auditRows()).toEqual(auditBefore);
  },
);

it('rolls back the first note and audit when the second write fails', async () => {
  const ids = [row('Synthetic A'), row('Synthetic B')].sort();
  const p = await preview(ids);
  const before = ids.map((id) => getBooking(opened.db, id)),
    auditBefore = auditRows();
  const attempted: string[] = [];
  opened.sqlite.function('synthetic_note_attempt', (id) => {
    attempted.push(String(id));
    return 0;
  });
  opened.sqlite.exec(`CREATE TRIGGER synthetic_note_attempt BEFORE UPDATE ON booking
    BEGIN SELECT synthetic_note_attempt(OLD.id);
    SELECT CASE WHEN OLD.id = '${ids[1]}' THEN RAISE(ABORT, 'synthetic failure') END; END`);
  expect((await apply(p)).status).toBeGreaterThanOrEqual(400);
  expect(attempted).toEqual(ids);
  expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
  expect(auditRows()).toEqual(auditBefore);
});

it('supports explicit clearing, reports unchanged notes, rejects replay and binds value/selection', async () => {
  const a = row('Synthetic A'),
    b = row(null);
  const p = await preview([a, b], null);
  expect(p.changed).toEqual([a]);
  expect(p.unchanged).toEqual([b]);
  expect((await apply({ ...p, memo: 'Other note' })).status).toBe(409);
  expect((await apply({ ...p, ids: [a] })).status).toBe(409);
  expect((await post('bulk', { action: 'update', ids: [a], set: { memo: null } })).status).toBe(
    409,
  );
  expect((await apply(p)).status).toBe(200);
  expect(getBooking(opened.db, a)?.memo).toBeNull();
  expect((await apply(p)).status).toBe(409);
  const same = await preview([a, b], null),
    auditBefore = auditRows();
  expect(same.changed).toEqual([]);
  expect((await apply(same)).status).toBe(200);
  expect(auditRows()).toEqual(auditBefore);
});

it('rejects oversized notes, mixed-field note writes and unsupported date/payee writes', async () => {
  const id = row('Synthetic A');
  const before = getBooking(opened.db, id),
    auditBefore = auditRows();
  expect((await post('note-preview', { ids: [id], memo: 'x'.repeat(501) })).status).toBe(400);
  for (const set of [{ memo: 'x', flag: 'blue' }, { date: '2026-10-03' }, { payeeId: 'p1' }])
    expect((await post('bulk', { action: 'update', ids: [id], set })).status).toBe(400);
  expect(getBooking(opened.db, id)).toEqual(before);
  expect(auditRows()).toEqual(auditBefore);
});
