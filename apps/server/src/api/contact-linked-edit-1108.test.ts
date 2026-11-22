/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect real JSON boundary results. */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { isNull } from 'drizzle-orm';
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
/** Live rows that carry money or links, exactly as stored (undo must restore them byte for byte). */
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
const outlay = async (amountCents = -1001) =>
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

/** The invariants of this slice, in cents. */
function expectInvariants(s: any) {
  const claims = s.movements
    .filter((m: any) => m.amountCents < 0)
    .reduce((sum: number, m: any) => sum - m.amountCents, 0);
  const received = s.movements
    .filter((m: any) => m.amountCents > 0)
    .reduce((sum: number, m: any) => sum + m.amountCents, 0);
  // balance = claims - settlements (receipts); credit is the part of a receipt without a claim
  expect(s.balanceCents).toBe(claims - received);
  for (const r of s.receipts) {
    const allocated = r.allocations.reduce((sum: number, a: any) => sum + a.amountCents, 0);
    const amount = s.movements.find((m: any) => m.splitId === r.receiptSplitId).amountCents;
    expect(allocated + r.creditCents).toBe(amount);
  }
  // sum of allocations <= booking share
  for (const o of s.outlays) {
    const allocated = s.receipts
      .flatMap((r: any) => r.allocations)
      .filter((a: any) => a.outlaySplitId === o.splitId)
      .reduce((sum: number, a: any) => sum + a.amountCents, 0);
    expect(allocated).toBeLessThanOrEqual(-o.amountCents);
  }
}

it('asks first, keeps the allocation while it fits and one Undo restores every row', async () => {
  const id = await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  const before = liveRows();
  const bytes = opened.sqlite.serialize();

  const refused = await call('PATCH', `/bookings/${id}`, { amountCents: -2000 });
  expect(refused.status).toBe(422);
  expect(refused.body).toMatchObject({ error: 'contact_linked', bookingId: id });
  expect((await call('GET', `/bookings/${id}/edit-protection`)).body).toMatchObject({
    reconciled: false,
    reconciliationDates: [],
    settlementDates: ['2026-09-02'],
  });
  expect(refused.body.settlementDates).toEqual(['2026-09-02']);
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);

  const grown = await call('PATCH', `/bookings/${id}`, {
    amountCents: -2000,
    unlockContactLinked: true,
    overrideReason: 'Betrag war falsch',
  });
  expect(grown.status).toBe(200);
  const s = await statement();
  expect(s.balanceCents).toBe(1299);
  expect(s.receipts[0]).toMatchObject({ creditCents: 0, allocations: [{ amountCents: 701 }] });
  expectInvariants(s);
  const marker = opened.db.select().from(schema.appSetting).all();
  expect(marker.some((m) => m.id.startsWith('contacts.linked-override.'))).toBe(true);
  expect(JSON.stringify(marker)).toContain('Betrag war falsch');

  expect((await call('POST', '/undo', { groupId: grown.body.groupId })).status).toBe(200);
  expect(liveRows()).toEqual(before);
  expectInvariants(await statement());
});

it('turns the part an edited outlay no longer covers into credit, never dropping or double counting it', async () => {
  const id = await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  const before = liveRows();
  expect((await statement()).balanceCents).toBe(300);

  const shrunk = await call('PATCH', `/bookings/${id}`, {
    amountCents: -500,
    unlockContactLinked: true,
  });
  expect(shrunk.status).toBe(200);
  const s = await statement();
  // 701 received, 500 owed: 201 stay with the contact as credit; the balance counts them once.
  expect(s.balanceCents).toBe(-201);
  expect(s.creditCents).toBe(201);
  expect(s.receipts[0]).toMatchObject({ creditCents: 201, allocations: [{ amountCents: 500 }] });
  expect(s.outlays[0].remainingCents).toBe(0);
  expectInvariants(s);

  expect((await call('POST', '/undo', { groupId: shrunk.body.groupId })).status).toBe(200);
  expect(liveRows()).toEqual(before);
  expect((await statement()).balanceCents).toBe(300);
});

it('lets the owner delete an allocated outlay after confirming; the repayment stays as credit', async () => {
  const id = await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  const before = liveRows();
  expect((await call('DELETE', `/bookings/${id}`)).status).toBe(422);
  const deleted = await call('DELETE', `/bookings/${id}?unlockLinked=1`);
  expect(deleted.status).toBe(200);
  const s = await statement();
  expect(s.balanceCents).toBe(-701);
  expect(s.creditCents).toBe(701);
  expectInvariants(s);
  expect((await call('POST', '/undo', { groupId: deleted.body.groupId })).status).toBe(200);
  expect(liveRows()).toEqual(before);
});

it('trims the newest repayment first when two repayments allocate one outlay', async () => {
  const id = await outlay(-1000);
  expect((await repay(400, '2026-09-02')).status).toBe(201);
  expect((await repay(300, '2026-09-03')).status).toBe(201);
  const shrunk = await call('PATCH', `/bookings/${id}`, {
    amountCents: -500,
    unlockContactLinked: true,
  });
  expect(shrunk.status).toBe(200);
  const s = await statement();
  expect(s.receipts.map((r: any) => r.creditCents)).toEqual([0, 200]);
  expect(s.balanceCents).toBe(500 - 700);
  expectInvariants(s);
});

it('still refuses a repayment receipt without the old settlement being undone', async () => {
  await outlay(-1001);
  expect((await repay(701)).status).toBe(201);
  const receiptBooking = (await statement()).movements.find(
    (m: any) => m.amountCents > 0,
  ).bookingId;
  const rejected = await call('PATCH', `/bookings/${receiptBooking}`, {
    amountCents: 800,
    unlockContactLinked: true,
  });
  expect(rejected.status).toBe(422);
  expect(rejected.body.error).toBe('invariant');
});
