/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect real JSON boundary results. */
import {
  ContactLinkedError,
  createTestDatabase,
  restoreBooking,
  schema,
  undo,
  updateBooking,
  type OpenedDatabase,
} from '@budget/db';
import { eq, isNull } from 'drizzle-orm';
import type { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());
async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as any };
}
const statement = async () => (await call('GET', '/contacts/k1')).body;
const liveRows = () => ({
  bookings: opened.db.select().from(schema.booking).where(isNull(schema.booking.deletedAt)).all(),
  splits: opened.db.select().from(schema.bookingSplit).all(),
  settlements: opened.db
    .select()
    .from(schema.contactSettlement)
    .where(isNull(schema.contactSettlement.deletedAt))
    .all(),
  allocations: opened.db
    .select()
    .from(schema.contactAllocation)
    .where(isNull(schema.contactAllocation.deletedAt))
    .all(),
});
const outlay = async (amountCents: number) =>
  (
    await call('POST', '/bookings', {
      type: 'booking',
      accountId: 'giro',
      date: '2026-09-01',
      amountCents,
      splits: [{ categoryId: 'essen', contactId: 'k1', amountCents }],
    })
  ).body.bookings[0].id as string;
const repay = (amountCents: number, date = '2026-09-02') =>
  call('POST', '/contacts/k1/settlements', { accountId: 'giro', date, amountCents });

/** Envelope activity: all live split cents per category (what the budget sees). */
const envelopes = () => {
  const live = new Set(
    opened.db
      .select()
      .from(schema.booking)
      .where(isNull(schema.booking.deletedAt))
      .all()
      .map((b) => b.id),
  );
  const sums: Record<string, number> = {};
  for (const split of opened.db.select().from(schema.bookingSplit).all())
    if (live.has(split.bookingId) && split.categoryId)
      sums[split.categoryId] = (sums[split.categoryId] ?? 0) + split.amountCents;
  return sums;
};
const cash = () =>
  opened.db
    .select()
    .from(schema.booking)
    .where(isNull(schema.booking.deletedAt))
    .all()
    .reduce((sum, b) => sum + b.amountCents, 0);
function expectFits(s: any) {
  const claims = s.movements
    .filter((m: any) => m.amountCents < 0)
    .reduce((sum: number, m: any) => sum - m.amountCents, 0);
  const received = s.movements
    .filter((m: any) => m.amountCents > 0)
    .reduce((sum: number, m: any) => sum + m.amountCents, 0);
  expect(s.balanceCents).toBe(claims - received);
  for (const o of s.outlays) {
    const allocated = s.receipts
      .flatMap((r: any) => r.allocations)
      .filter((a: any) => a.outlaySplitId === o.splitId)
      .reduce((sum: number, a: any) => sum + a.amountCents, 0);
    expect(allocated).toBeLessThanOrEqual(-o.amountCents);
  }
}

it('moves the category return with the outlay when its category changes (A1)', async () => {
  const id = await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  // The repayment returned 701 to essen: essen carries 1001 - 701 = 300.
  expect(envelopes()['essen']).toBe(-300);
  const before = liveRows();
  const changed = await call('PATCH', `/bookings/${id}`, {
    splits: [{ categoryId: 'reise', contactId: 'k1', amountCents: -1001 }],
    unlockContactLinked: true,
  });
  expect(changed.status).toBe(200);
  // No phantom +701 left on essen; reise carries the whole outlay, nothing is returned to it.
  expect(envelopes()['essen'] ?? 0).toBe(0);
  expect(envelopes()['reise']).toBe(-1001);
  const s = await statement();
  expect(s.balanceCents).toBe(300);
  expect(s.creditCents).toBe(701);
  expect(s.receipts[0]).toMatchObject({ creditCents: 701, allocations: [] });
  expectFits(s);
  expect((await call('POST', '/undo', { groupId: changed.body.groupId })).status).toBe(200);
  expect(liveRows()).toEqual(before);
  expect(envelopes()['essen']).toBe(-300);
});

it('releases the allocation when the split count changes; the part stays credit (A6)', async () => {
  const id = await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  const split = await call('PATCH', `/bookings/${id}`, {
    splits: [
      { categoryId: 'essen', contactId: 'k1', amountCents: -600 },
      { categoryId: 'essen', amountCents: -401 },
    ],
    unlockContactLinked: true,
  });
  expect(split.status).toBe(200);
  const s = await statement();
  // The repayment is dated after the outlay, so the released 701 is not re-applied: it is credit.
  expect(s.receipts[0]).toMatchObject({ creditCents: 701, allocations: [] });
  expect(s.outlays.map((o: any) => o.remainingCents)).toEqual([600]);
  expect(s.balanceCents).toBe(600 - 701);
  expectFits(s);
});

it('keeps account cash unchanged by the reallocation itself (A6)', async () => {
  const id = await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  const cashBefore = cash();
  expect(
    (await call('PATCH', `/bookings/${id}`, { amountCents: -500, unlockContactLinked: true }))
      .status,
  ).toBe(200);
  // Only the edit itself moved cash (+501); the release booked no money.
  expect(cash()).toBe(cashBefore + 501);
});

it('uses the booking order, not the id, as tie-break for the newest repayment (A5)', async () => {
  const id = await outlay(-1000);
  expect((await repay(400, '2026-09-02')).status).toBe(201);
  expect((await repay(300, '2026-09-02')).status).toBe(201);
  expect(
    (await call('PATCH', `/bookings/${id}`, { amountCents: -500, unlockContactLinked: true }))
      .status,
  ).toBe(200);
  const s = await statement();
  expect(s.receipts.map((r: any) => r.creditCents)).toEqual([0, 200]);
});

it('does not let a later repayment ride on an undone override (A2)', async () => {
  const id = await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  const grown = await call('PATCH', `/bookings/${id}`, {
    amountCents: -2000,
    unlockContactLinked: true,
  });
  expect(grown.status).toBe(200);
  // Another action allocates 1200 more: 701 + 1200 = 1901 only fits the grown outlay.
  expect((await repay(1200, '2026-09-03')).status).toBe(201);
  const bytes = opened.sqlite.serialize();
  const refused = await call('POST', '/undo', { groupId: grown.body.groupId });
  expect(refused.status).not.toBe(200);
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  // Even a forced undo cannot leave allocations of 1901 on an outlay of 1001.
  expect(() =>
    undo(opened.db, { groupId: grown.body.groupId }, { actor: 'test' }, { force: true }),
  ).toThrow();
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  expectFits(await statement());
});

it('the repo flag alone cannot bypass the release (A3)', async () => {
  const id = await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  const bytes = opened.sqlite.serialize();
  expect(() =>
    updateBooking(
      opened.db,
      id,
      { amountCents: -500 },
      { actor: 'test' },
      { unlockContactLinked: true },
    ),
  ).toThrow(ContactLinkedError);
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
});

it.each(['outlay', 'repayment'])(
  'needs the reconciled unlock as well when the %s is checked (A6)',
  async (which) => {
    const id = await outlay(-1001);
    expect((await repay(701)).status).toBe(201);
    const receiptBooking = (await statement()).movements.find((m: any) => m.amountCents > 0)
      .bookingId as string;
    opened.db
      .update(schema.booking)
      .set({ status: 'reconciled' })
      .where(eq(schema.booking.id, which === 'outlay' ? id : receiptBooking))
      .run();
    const bytes = opened.sqlite.serialize();
    const locked = await call('PATCH', `/bookings/${id}`, {
      amountCents: -500,
      unlockContactLinked: true,
    });
    expect(locked.status).toBe(409);
    expect(locked.body.error).toBe('reconciled_locked');
    expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
    const scoped = await call('PATCH', `/bookings/${id}`, {
      amountCents: -500,
      unlockContactLinked: true,
      unlockLinkedRepayment: true,
    });
    expect(scoped.status).toBe(which === 'outlay' ? 409 : 200);
    if (which === 'repayment')
      expect((await call('POST', '/undo', { groupId: scoped.body.groupId })).status).toBe(200);
    const open = await call('PATCH', `/bookings/${id}`, {
      amountCents: -500,
      unlockContactLinked: true,
      unlockReconciled: true,
      unlockLinkedRepayment: which === 'repayment',
    });
    expect(open.status, JSON.stringify(open.body)).toBe(200);
    const s = await statement();
    expect(s.receipts[0]).toMatchObject({ creditCents: 201, allocations: [{ amountCents: 500 }] });
    expectFits(s);
    const restored = await call('POST', '/undo', { groupId: open.body.groupId });
    expect(restored.body, JSON.stringify(restored.body)).toMatchObject({
      groupId: expect.any(String),
    });
    expect((await statement()).receipts[0]).toMatchObject({
      creditCents: 0,
      allocations: [{ amountCents: 701 }],
    });
  },
);

it('restores a deleted outlay without breaking the allocation rules (A6)', async () => {
  const id = await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  expect((await call('DELETE', `/bookings/${id}?unlockLinked=1`)).status).toBe(200);
  restoreBooking(opened.db, id, { actor: 'test' });
  const s = await statement();
  // The release stays: the repayment is credit, the restored outlay is open again.
  expect(s.receipts[0]).toMatchObject({ creditCents: 701, allocations: [] });
  expect(s.balanceCents).toBe(1001 - 701);
  expectFits(s);
});
