import {
  createBooking,
  assertLedgerInvariants,
  settleContact,
  createEntity,
  createExpectedPayment,
  linkOccurrence,
  createTestDatabase,
  createTransfer,
  getBooking,
  schema,
  undo,
  updateBooking,
  type BookingBulkSelection,
  type OpenedDatabase,
} from '@budget/db';
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
const post = (path: string, body: unknown) =>
  app.request(`/bookings/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const row = (amountCents: number, extra: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-02',
      amountCents,
      splits: [{ categoryId: 'essen', amountCents }],
      ...extra,
    },
    testCtx,
  );
type Preview = {
  ids: string[];
  selection: BookingBulkSelection;
  eligibleIds: string[];
  eligibleTotals: BookingBulkSelection['totals'];
  skipped: { id: string; reason: string }[];
  revision: string;
};

it('previews exact signed native deletion totals and names all protected or missing selected rows without writing', async () => {
  const a = row(-1234, {
    splits: [
      { categoryId: 'essen', amountCents: -1000 },
      { categoryId: 'miete', amountCents: -234 },
    ],
  });
  const b = row(567);
  const usd = row(-4321, {
    accountId: 'usd',
    currency: 'USD',
    splits: [{ categoryId: null, amountCents: -4321 }],
  });
  const locked = row(-890, { status: 'reconciled' });
  const contact = row(-300, {
    splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -300 }],
  });
  settleContact(
    opened.db,
    'k1',
    { accountId: 'giro', date: '2026-10-03', amountCents: 300 },
    testCtx,
  );
  const transfer = createTransfer(
    opened.db,
    { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-10-02', amountCents: 2500 },
    testCtx,
  );
  const ids = [a, b, usd, locked, contact, transfer.fromBookingId, transfer.toBookingId, 'missing'];
  const before = ids.map((id) => getBooking(opened.db, id));
  const auditBefore = opened.db.select().from(schema.auditLog).all();
  const response = await post('delete-preview', { ids });
  expect(response.status).toBe(200);
  const preview = (await response.json()) as Preview;
  expect(preview.ids).toEqual([...ids].sort());
  expect(preview.eligibleIds.sort()).toEqual(
    [a, b, usd, transfer.fromBookingId, transfer.toBookingId].sort(),
  );
  expect(preview.eligibleTotals).toEqual([
    { currency: 'EUR', count: 4, cents: -667, unavailable: null },
    { currency: 'USD', count: 1, cents: -4321, unavailable: null },
  ]);
  expect(new Map(preview.skipped.map((item) => [item.id, item.reason]))).toEqual(
    new Map([
      [locked, 'reconciled_locked'],
      [contact, 'linked_contact'],
      ['missing', 'not_found'],
    ]),
  );
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
  const read = async (ids: string[]) =>
    (await (await post('delete-preview', { ids })).json()) as Preview;
  const first = await read([a, b]);
  expect((await read([b, a, a])).revision).toBe(first.revision);
  expect((await read([a])).revision).not.toBe(first.revision);
  updateBooking(opened.db, a, { memo: 'Changed after preview' }, testCtx);
  expect((await read([a, b])).revision).not.toBe(first.revision);
});

it.each([false, true])(
  'deletes eligible cents/splits and both transfer sides in one audit group; exact Undo (preview=%s)',
  async (previewed) => {
    const a = row(-1234, {
      memo: 'Retained split metadata',
      splits: [
        { categoryId: 'essen', amountCents: -1000, memo: 'First' },
        { categoryId: 'miete', amountCents: -234, memo: 'Second' },
      ],
    });
    const b = row(567);
    const locked = row(-890, { status: 'reconciled' });
    const contact = row(-300, {
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -300 }],
    });
    settleContact(
      opened.db,
      'k1',
      { accountId: 'giro', date: '2026-10-03', amountCents: 300 },
      testCtx,
    );
    const transfer = createTransfer(
      opened.db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-10-02', amountCents: 2500 },
      testCtx,
    );
    const ids = [a, b, locked, contact, transfer.fromBookingId];
    const allIds = [...ids, transfer.toBookingId];
    const before = allIds.map((id) => getBooking(opened.db, id));
    const preview = (await (await post('delete-preview', { ids })).json()) as Preview;
    expect(preview.eligibleTotals).toEqual([
      { currency: 'EUR', count: 4, cents: -667, unavailable: null },
    ]);
    const response = await post('bulk', {
      action: 'delete',
      ids,
      ...(previewed ? { previewRevision: preview.revision } : {}),
      unlockReconciled: true,
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      changed: string[];
      skipped: { id: string; reason: string }[];
      groupId: string;
      transferPairs: number;
    };
    expect(result.changed.sort()).toEqual(
      [a, b, transfer.fromBookingId, transfer.toBookingId].sort(),
    );
    expect(result.skipped.map((item) => [item.id, item.reason])).toEqual([
      [locked, 'reconciled_locked'],
      [contact, 'linked_contact'],
    ]);
    expect(result.transferPairs).toBe(1);
    expect(
      [a, b, transfer.fromBookingId, transfer.toBookingId].map((id) => getBooking(opened.db, id)),
    ).toEqual([undefined, undefined, undefined, undefined]);
    expect([locked, contact].map((id) => getBooking(opened.db, id))).toEqual([
      before[2],
      before[3],
    ]);
    const group = opened.db
      .select()
      .from(schema.auditLog)
      .all()
      .filter((entry) => entry.groupId === result.groupId);
    expect(group).toHaveLength(4);
    expect(group.map((entry) => entry.entityType)).toEqual([
      'booking',
      'booking',
      'booking',
      'booking',
    ]);
    expect(group.map((entry) => entry.entityId).sort()).toEqual(
      [a, b, transfer.fromBookingId, transfer.toBookingId].sort(),
    );
    undo(opened.db, { groupId: result.groupId }, testCtx);
    expect(allIds.map((id) => getBooking(opened.db, id))).toEqual(before);
  },
);

it.each([false, true])(
  'excludes both sides when the unselected transfer partner is reconciled (preview=%s)',
  async (previewed) => {
    const transfer = createTransfer(
      opened.db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-10-02', amountCents: 2500 },
      testCtx,
    );
    updateBooking(opened.db, transfer.toBookingId, { status: 'reconciled' }, testCtx);
    const ids = [transfer.fromBookingId];
    const before = [transfer.fromBookingId, transfer.toBookingId].map((id) =>
      getBooking(opened.db, id),
    );
    const preview = (await (await post('delete-preview', { ids })).json()) as Preview;
    expect(preview.eligibleIds).toEqual([]);
    expect(preview.eligibleTotals).toEqual([]);
    expect(preview.skipped.map((item) => item.reason)).toEqual([
      'reconciled_locked',
      'reconciled_locked',
    ]);
    const response = await post('bulk', {
      action: 'delete',
      ids,
      ...(previewed ? { previewRevision: preview.revision } : {}),
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { changed: string[] }).changed).toEqual([]);
    expect(
      [transfer.fromBookingId, transfer.toBookingId].map((id) => getBooking(opened.db, id)),
    ).toEqual(before);
  },
);

it('refuses a stale preview before any write or audit, retaining the new literal amount', async () => {
  const a = row(-1234),
    b = row(567);
  const ids = [a, b];
  const preview = (await (await post('delete-preview', { ids })).json()) as Preview;
  updateBooking(
    opened.db,
    a,
    { amountCents: -2000, splits: [{ categoryId: 'essen', amountCents: -2000 }] },
    testCtx,
  );
  const before = ids.map((id) => getBooking(opened.db, id));
  const auditBefore = opened.db.select().from(schema.auditLog).all();
  const response = await post('bulk', { action: 'delete', ids, previewRevision: preview.revision });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: 'stale_delete_preview' });
  expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
  expect(getBooking(opened.db, a)?.amountCents).toBe(-2000);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual(auditBefore);
});

it('ordinary single deletion and Undo retain every original cent and split identity', async () => {
  const id = row(-1234, {
    splits: [
      { categoryId: 'essen', amountCents: -1000, memo: 'First' },
      { categoryId: 'miete', amountCents: -234, memo: 'Second' },
    ],
  });
  const before = getBooking(opened.db, id);
  const preview = (await (await post('delete-preview', { ids: [id] })).json()) as Preview;
  const response = await app.request(`/bookings/${id}?previewRevision=${preview.revision}`, {
    method: 'DELETE',
  });
  expect(response.status).toBe(200);
  const result = (await response.json()) as { groupId: string };
  expect(getBooking(opened.db, id)).toBeUndefined();
  undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(getBooking(opened.db, id)).toEqual(before);
});

it.each(['single', 'bulk'] as const)(
  'restores a released expected-payment link and original split cents with one Undo (%s)',
  async (mode) => {
    const id = row(-1234, {
      payeeId: 'p1',
      splits: [{ categoryId: 'miete', amountCents: -1234, memo: 'Retain link split' }],
    });
    const payment = createExpectedPayment(
      opened.db,
      {
        name: 'Synthetic expected rent',
        accountId: 'giro',
        payeeId: 'p1',
        categoryId: 'miete',
        dueDay: 2,
        startDate: '2026-10-01',
      },
      { validFrom: '2026-10-01', amountCents: 1234 },
      testCtx,
      '2026-10-02',
    ).payment;
    const occurrence =
      opened.db
        .select()
        .from(schema.expectedOccurrence)
        .all()
        .find((item) => item.expectedPaymentId === payment.id && item.dueDate === '2026-10-02') ??
      createEntity(
        opened.db,
        schema.expectedOccurrence,
        {
          expectedPaymentId: payment.id,
          dueDate: '2026-10-02',
          expectedAmountCents: -1234,
          status: 'expected',
        },
        testCtx,
      );
    linkOccurrence(opened.db, occurrence.id, id, testCtx);
    const before = getBooking(opened.db, id);
    const linksBefore = opened.db.select().from(schema.expectedOccurrence).all();
    const preview = (await (await post('delete-preview', { ids: [id] })).json()) as Preview;
    expect(preview.eligibleIds).toEqual([id]);
    expect(preview.eligibleTotals).toEqual([
      { currency: 'EUR', count: 1, cents: -1234, unavailable: null },
    ]);
    const response =
      mode === 'single'
        ? await app.request(`/bookings/${id}?previewRevision=${preview.revision}`, {
            method: 'DELETE',
          })
        : await post('bulk', { action: 'delete', ids: [id], previewRevision: preview.revision });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { groupId: string };
    expect(getBooking(opened.db, id)).toBeUndefined();
    expect(
      opened.db
        .select()
        .from(schema.expectedOccurrence)
        .all()
        .find((item) => item.id === occurrence.id),
    ).toMatchObject({ bookingId: null, status: 'expected' });
    undo(opened.db, { groupId: result.groupId }, testCtx);
    expect(getBooking(opened.db, id)).toEqual(before);
    expect(opened.db.select().from(schema.expectedOccurrence).all()).toEqual(linksBefore);
  },
);

const splitTransferComponent = () => {
  createEntity(
    opened.db,
    schema.account,
    {
      id: 'second-savings',
      name: 'Second savings',
      type: 'savings',
      role: 'reserve',
      onBudget: true,
      openingDate: '2023-10-01',
    },
    testCtx,
  );
  const parent = row(-3000, {
    splits: [
      { categoryId: null, amountCents: -1000, transferAccountId: 'spar' },
      { categoryId: null, amountCents: -2000, transferAccountId: 'second-savings' },
    ],
  });
  const parts = getBooking(opened.db, parent)!.splits;
  const rows = opened.db.select().from(schema.booking).all();
  const leaf1 = rows.find((item) => item.transferId === parts[0]!.transferId)!.id;
  const leaf2 = rows.find((item) => item.transferId === parts[1]!.transferId)!.id;
  return { parent, leaf1, leaf2, ids: [parent, leaf1, leaf2] };
};

it.each(['single', 'bulk-preview', 'bulk-legacy'] as const)(
  'deletes the entire real two-split transfer component from one leaf and exactly undoes all3 (%s)',
  async (mode) => {
    const component = splitTransferComponent();
    const before = component.ids.map((id) => getBooking(opened.db, id));
    const transfersBefore = opened.db.select().from(schema.transfer).all();
    const preview = (await (
      await post('delete-preview', { ids: [component.leaf1] })
    ).json()) as Preview & { affectedIds: string[]; transferPairs: number };
    expect(preview.affectedIds.sort()).toEqual([...component.ids].sort());
    expect(preview.eligibleIds.sort()).toEqual([...component.ids].sort());
    expect(preview.eligibleTotals).toEqual([
      { currency: 'EUR', count: 3, cents: 0, unavailable: null },
    ]);
    expect(preview.transferPairs).toBe(2);
    expect(preview.skipped).toEqual([]);
    expect(before.map((item) => item?.amountCents)).toEqual([-3000, 1000, 2000]);
    const response =
      mode === 'single'
        ? await app.request(`/bookings/${component.leaf1}?previewRevision=${preview.revision}`, {
            method: 'DELETE',
          })
        : await post('bulk', {
            action: 'delete',
            ids: [component.leaf1],
            ...(mode === 'bulk-preview' ? { previewRevision: preview.revision } : {}),
          });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { groupId: string; changed?: string[] };
    if (mode !== 'single') expect(result.changed?.sort()).toEqual([...component.ids].sort());
    expect(component.ids.map((id) => getBooking(opened.db, id))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    const group = opened.db
      .select()
      .from(schema.auditLog)
      .all()
      .filter((item) => item.groupId === result.groupId);
    expect(group).toHaveLength(3);
    expect(group.map((item) => item.entityId).sort()).toEqual([...component.ids].sort());
    expect(() => assertLedgerInvariants(opened.db, component.ids)).not.toThrow();
    undo(opened.db, { groupId: result.groupId }, testCtx);
    expect(component.ids.map((id) => getBooking(opened.db, id))).toEqual(before);
    expect(opened.db.select().from(schema.transfer).all()).toEqual(transfersBefore);
    expect(() => assertLedgerInvariants(opened.db, component.ids)).not.toThrow();
  },
);

it.each([false, true])(
  'excludes the whole real split-transfer component when the other leaf is locked; no audit or orphan (preview=%s)',
  async (previewed) => {
    const component = splitTransferComponent();
    // A real reconciliation locks this one booking side, not the unrelated transfer component.
    opened.sqlite.prepare("UPDATE booking SET status='reconciled' WHERE id=?").run(component.leaf2);
    const before = component.ids.map((id) => getBooking(opened.db, id));
    const auditBefore = opened.db.select().from(schema.auditLog).all();
    const preview = (await (
      await post('delete-preview', { ids: [component.leaf1] })
    ).json()) as Preview & { affectedIds: string[]; transferPairs: number };
    expect(preview.affectedIds.sort()).toEqual([...component.ids].sort());
    expect(preview.eligibleIds).toEqual([]);
    expect(preview.eligibleTotals).toEqual([]);
    expect(preview.skipped.map((item) => item.id).sort()).toEqual([...component.ids].sort());
    expect(preview.skipped.map((item) => item.reason)).toEqual([
      'reconciled_locked',
      'reconciled_locked',
      'reconciled_locked',
    ]);
    const response = await post('bulk', {
      action: 'delete',
      ids: [component.leaf1],
      unlockReconciled: true,
      ...(previewed ? { previewRevision: preview.revision } : {}),
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { changed: string[] }).changed).toEqual([]);
    expect(component.ids.map((id) => getBooking(opened.db, id))).toEqual(before);
    expect(opened.db.select().from(schema.auditLog).all()).toEqual(auditBefore);
    expect(() => assertLedgerInvariants(opened.db, component.ids)).not.toThrow();
  },
);

it.each(['single', 'bulk'] as const)(
  'permits an unsettled contact outlay through the canonical delete contract and restores its contact split (%s)',
  async (mode) => {
    const id = row(-300, {
      splits: [
        {
          categoryId: 'auslagen',
          contactId: 'k1',
          amountCents: -300,
          memo: 'Unsettled contact outlay',
        },
      ],
    });
    const before = getBooking(opened.db, id);
    const preview = (await (await post('delete-preview', { ids: [id] })).json()) as Preview;
    expect(preview.skipped).toEqual([]);
    expect(preview.eligibleIds).toEqual([id]);
    expect(preview.eligibleTotals).toEqual([
      { currency: 'EUR', count: 1, cents: -300, unavailable: null },
    ]);
    const response =
      mode === 'single'
        ? await app.request(`/bookings/${id}?previewRevision=${preview.revision}`, {
            method: 'DELETE',
          })
        : await post('bulk', { action: 'delete', ids: [id], previewRevision: preview.revision });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { groupId: string };
    expect(getBooking(opened.db, id)).toBeUndefined();
    undo(opened.db, { groupId: result.groupId }, testCtx);
    expect(getBooking(opened.db, id)).toEqual(before);
  },
);
