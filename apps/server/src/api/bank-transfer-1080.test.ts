import {
  accounts,
  createTestDatabase,
  getBooking,
  netWorthAsOf,
  netWorthDaily,
  accountPreview,
  accountSummaries,
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
import { forecastInputs, loadFacts } from '../../../../packages/db/src/repos/rule-inputs';

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
  expect(netWorthAsOf(opened.db, '2026-11-14').totalCents).toBe(60000);
  undo(opened.db, { groupId: undone.groupId }, { actor: 'fixture1080' });
  expect(confirmedBalances('2026-11-16')).toEqual([37655, 10000]);
  expect(netWorthAsOf(opened.db, '2026-11-14').totalCents).toBe(60000);

  const confirmed = await app.request(`/bookings/${result.toBookingId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(confirmed.status).toBe(200);
  expect(confirmedBalances(day)).toEqual([37655, 10000]);
  expect(confirmedBalances('2026-11-16')).toEqual([37655, 22345]);
  expect(getBooking(opened.db, result.fromBookingId)?.date).toBe(day);
  expect(netWorthAsOf(opened.db, '2026-11-17').totalCents).toBe(60000);
});

it('counts the transfer once in net worth between dates and after a still-pending receipt', async () => {
  await post(body);
  for (const asOf of ['2026-11-14', '2026-11-17']) {
    expect(netWorthAsOf(opened.db, asOf)).toMatchObject({
      totalCents: 60000,
      byAccount: { source1080: 37655, settlement1080: 22345 },
    });
    expect(confirmedBalances(asOf)).toEqual([37655, 10000]);
  }
  expect(netWorthDaily(opened.db, '2026-11-12', '2026-11-17')).toEqual(
    ['12', '13', '14', '15', '16', '17'].map((d) => ({
      date: `2026-11-${d}`,
      netWorthCents: 60000,
      changeCents: 0,
      marketCents: 0,
      ownCents: 0,
      cumulativeMarketCents: 0,
      cumulativeOwnCents: 0,
    })),
  );
});

it.each([
  ['fromBookingId', '2026-11-16'],
  ['toBookingId', '2026-11-16'],
  ['fromBookingId', day],
  ['toBookingId', day],
] as const)(
  'refuses a date correction of %s with receipt on %s without writes',
  async (key, receiptDate) => {
    const result = (await (
      await post({
        ...body,
        bankLegs: {
          ...body.bankLegs,
          to: { date: receiptDate, status: 'pending' },
        },
      })
    ).json()) as Record<string, string>;
    const before = snapshot();
    const response = await app.request(`/bookings/${result[key]}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: '2026-11-15' }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: 'invariant',
      message:
        'Bei Umbuchungen zwischen Bankkonten ist eine einzelne Datumsänderung nicht möglich.',
    });
    expect(snapshot()).toEqual(before);
  },
);

it('projects a pending receipt exactly once in the account preview, before and after its date', async () => {
  await post(body);
  const before = snapshot();
  for (const asOf of ['2026-11-14', '2026-11-17']) {
    const source = accountPreview(opened.db, 'source1080', 'EUR', asOf, 7);
    const receipt = accountPreview(opened.db, 'settlement1080', 'EUR', asOf, 7);
    const forecast = forecastInputs(
      loadFacts(opened.db, asOf),
      asOf,
      netWorthAsOf(opened.db, asOf),
    );
    expect(forecast.startCents).toBe(60000);
    expect(forecast.items).toEqual([]);
    for (const point of source.points) expect(point.balanceCents).toBe(37655);
    for (const point of receipt.points)
      expect(point.balanceCents).toBe(point.date < '2026-11-16' ? 10000 : 22345);
    expect(accountSummaries(opened.db, asOf).find((a) => a.id === 'settlement1080')).toMatchObject({
      balanceCents: asOf < '2026-11-16' ? 10000 : 22345,
      clearedCents: 10000,
      unclearedCents: asOf < '2026-11-16' ? 0 : 12345,
      scheduledCents: asOf < '2026-11-16' ? 12345 : 0,
    });
  }
  expect(snapshot()).toEqual(before);
});

it.each(['fromBookingId', 'toBookingId'] as const)(
  'refuses a repeated current date on %s without collapsing the other date',
  async (key) => {
    const result = (await (await post(body)).json()) as Record<string, string>;
    const before = snapshot();
    const response = await app.request(`/bookings/${result[key]}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: key === 'fromBookingId' ? day : '2026-11-16' }),
    });
    expect(response.status).toBe(422);
    expect(snapshot()).toEqual(before);
  },
);

it('conserves valuation when the recipient date precedes the debit date', async () => {
  await post({
    ...body,
    bankLegs: {
      from: { date: '2026-11-16', status: 'pending' },
      to: { date: day, status: 'confirmed' },
    },
  });
  expect(netWorthAsOf(opened.db, '2026-11-14')).toMatchObject({
    totalCents: 60000,
    byAccount: { source1080: 50000, settlement1080: 10000 },
  });
  expect(
    netWorthDaily(opened.db, '2026-11-12', '2026-11-17').map((row) => row.netWorthCents),
  ).toEqual([60000, 60000, 60000, 60000, 60000, 60000]);
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

it('refuses a debit before the recipient account exists, without writing transfer rows', async () => {
  accounts.update(
    opened.db,
    'settlement1080',
    { openingDate: '2026-11-15' },
    { actor: 'fixture1080' },
  );
  const before = snapshot();
  const response = await post(body);
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    message: 'Der Abgang darf nicht vor dem Eröffnungsdatum des Zielkontos liegen.',
  });
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
