import {
  accounts,
  createTestDatabase,
  getBooking,
  schema,
  undo,
  type OpenedDatabase,
} from '@budget/db';
import { balanceOn } from '@budget/domain';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { bookingRoutes } from './bookings';
import { errorResponse } from './http';
import { createBody } from './schemas';

const day = '2026-11-13';
const body = {
  type: 'transfer',
  fromAccountId: 'source1080',
  toAccountId: 'settlement1080',
  date: day,
  amountCents: 12345,
  bankLegs: {
    from: { date: day, status: 'confirmed' },
    to: { date: '2026-11-16', status: 'pending' },
  },
};
let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  for (const [id, openingBalanceCents] of [
    ['source1080', 50000],
    ['settlement1080', 10000],
  ] as const)
    accounts.create(
      opened.db,
      {
        id,
        name: id,
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents,
        openingDate: '2026-01-01',
      },
      { actor: 'fixture1080' },
    );
  app = new Hono().route(
    '/bookings',
    bookingRoutes(opened.db, () => day),
  );
  app.onError(errorResponse);
});
afterEach(() => opened.close());
const post = (input: unknown) =>
  app.request('/bookings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': 'synthetic-bank-transfer-1080',
    },
    body: JSON.stringify(input),
  });
const snapshot = () => ({
  bookings: opened.db.select().from(schema.booking).all(),
  splits: opened.db.select().from(schema.bookingSplit).all(),
  transfers: opened.db.select().from(schema.transfer).all(),
  audit: opened.db.select().from(schema.auditLog).all(),
  delivery: opened.db.select().from(schema.bookingDelivery).all(),
});
function confirmedBalances(asOf: string) {
  const bookings = opened.db
    .select()
    .from(schema.booking)
    .all()
    .filter((b) => b.deletedAt === null && b.status !== 'pending');
  return opened.db
    .select()
    .from(schema.account)
    .all()
    .map((a) => balanceOn(a, bookings, asOf));
}

it('stores independently dated bank legs without confirming money still in transit; replays and undoes atomically', async () => {
  const response = await post(body);
  expect(response.status).toBe(201);
  const result = (await response.json()) as {
    fromBookingId: string;
    toBookingId: string;
    groupId: string;
  };
  expect(getBooking(opened.db, result.fromBookingId)).toMatchObject({
    date: day,
    status: 'confirmed',
    amountCents: -12345,
  });
  expect(getBooking(opened.db, result.toBookingId)).toMatchObject({
    date: '2026-11-16',
    status: 'pending',
    amountCents: 12345,
  });
  expect(confirmedBalances(day)).toEqual([37655, 10000]);
  expect(confirmedBalances('2026-11-16')).toEqual([37655, 10000]);
  expect(opened.db.select().from(schema.booking).all()).toHaveLength(2);
  expect(
    opened.db
      .select()
      .from(schema.bookingSplit)
      .all()
      .map((s) => s.categoryId),
  ).toEqual([null, null]);
  const saved = snapshot();
  expect(await (await post(body)).json()).toEqual(result);
  expect(snapshot()).toEqual(saved);
  const changed = await post({
    ...body,
    bankLegs: { ...body.bankLegs, to: { date: '2026-11-16', status: 'confirmed' } },
  });
  expect(changed.status).toBe(409);
  expect(snapshot()).toEqual(saved);

  const undone = undo(opened.db, { groupId: result.groupId }, { actor: 'fixture1080' });
  expect(getBooking(opened.db, result.fromBookingId)).toBeUndefined();
  expect(getBooking(opened.db, result.toBookingId)).toBeUndefined();
  expect(confirmedBalances(day)).toEqual([50000, 10000]);
  undo(opened.db, { groupId: undone.groupId }, { actor: 'fixture1080' });
  expect(confirmedBalances('2026-11-16')).toEqual([37655, 10000]);

  const confirmed = await app.request(`/bookings/${result.toBookingId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(confirmed.status).toBe(200);
  expect(confirmedBalances(day)).toEqual([37655, 10000]);
  expect(confirmedBalances('2026-11-16')).toEqual([37655, 22345]);
  expect(getBooking(opened.db, result.fromBookingId)?.date).toBe(day);
});

it.each(['cash', 'brokerage', 'credit_card'] as const)(
  'refuses bankLegs for %s before writing',
  async (type) => {
    accounts.create(
      opened.db,
      {
        id: 'other1080',
        name: 'Other',
        openingDate: '2026-01-01',
        type,
        role: type === 'brokerage' ? 'investment' : 'budget',
        onBudget: type !== 'brokerage',
      },
      { actor: 'fixture1080' },
    );
    const before = snapshot();
    expect((await post({ ...body, toAccountId: 'other1080' })).status).toBe(422);
    expect(snapshot()).toEqual(before);
  },
);

it('refuses competing cash/bank status intent without writing', async () => {
  const before = snapshot();
  expect((await post({ ...body, bankStatus: 'confirmed' })).status).toBe(422);
  expect(snapshot()).toEqual(before);
});

it('rolls back both sides, audit and delivery when dates exceed the existing five-day window', async () => {
  const before = snapshot();
  const response = await post({
    ...body,
    bankLegs: { ...body.bankLegs, to: { date: '2026-11-19', status: 'pending' } },
  });
  expect(response.status).toBe(422);
  expect(snapshot()).toEqual(before);
});

it.each([
  { from: body.bankLegs.from },
  { ...body.bankLegs, to: { date: '2026-02-30', status: 'pending' } },
  { ...body.bankLegs, to: { date: day, status: 'reconciled' } },
  { ...body.bankLegs, to: { date: day } },
])('rejects incomplete, invalid or reconciled side intent', (bankLegs) => {
  expect(createBody.safeParse({ ...body, bankLegs }).success).toBe(false);
});
