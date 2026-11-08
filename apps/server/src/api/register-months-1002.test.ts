import {
  accounts,
  createBooking,
  createTestDatabase,
  createTransfer,
  schema,
  type BookingPage,
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
  app = new Hono().route(
    '/bookings',
    bookingRoutes(opened.db, () => '2026-11-08'),
  );
  app.onError(errorResponse);
});
afterEach(() => opened.close());
const row = (
  date: string,
  amountCents: number,
  extra: Partial<Parameters<typeof createBooking>[1]> = {},
) =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents,
      status: 'confirmed',
      memo: 'Synthetic filter',
      payeeId: 'p1',
      flag: 'blue',
      splits: [{ categoryId: 'essen', amountCents }],
      ...extra,
    },
    testCtx,
  );
const read = async (query = '') => {
  const response = await app.request(`/bookings?${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as BookingPage;
};

it('aggregates every matching split before pagination and applies all register predicates', async () => {
  row('2026-11-02', -1001, {
    splits: [
      { categoryId: 'essen', amountCents: -301 },
      { categoryId: 'reise', amountCents: -700 },
    ],
  });
  row('2026-11-03', 101);
  row('2026-10-01', -203);
  row('2026-09-01', -999);
  row('2026-10-01', -999, { status: 'pending' });
  row('2026-10-01', -999, { accountId: 'spar' });
  row('2026-10-01', -999, { memo: 'Excluded' });
  row('2026-10-01', -999, { flag: 'red' });
  row('2026-10-01', -999, { payeeId: null });
  row('2026-10-01', -999, { splits: [{ categoryId: 'reise', amountCents: -999 }] });
  const query =
    'categoryId=essen&accountId=giro&status=confirmed&q=Synthetic&flag=blue&payeeId=p1&from=2026-10-01&to=2026-11-08&limit=1';
  const first = await read(query);
  expect(first.items).toHaveLength(1);
  expect(first.monthlyTotals).toEqual([
    { month: '2026-11', count: 2, cents: -200, cumulativeCents: -200 },
    { month: '2026-10', count: 1, cents: -203, cumulativeCents: -403 },
  ]);
  expect((await read(`${query}&cursor=${first.nextCursor}`)).monthlyTotals).toEqual(
    first.monthlyTotals,
  );
  expect((await read(`${query}&sort=amount&direction=asc`)).monthlyTotals).toEqual(
    first.monthlyTotals,
  );
  expect((await read(`${query}&basis=category-spending`)).monthlyTotals).toEqual(
    first.monthlyTotals,
  );
  expect((await read('q=no-match')).monthlyTotals).toEqual([]);
});

it('excludes whole and split transfers, retains refunds and ignores deleted bookings/accounts', async () => {
  const transfer = createTransfer(
    opened.db,
    { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-11-01', amountCents: 1000 },
    testCtx,
  );
  const id = row('2026-10-01', -1001, {
    splits: [
      { categoryId: 'essen', amountCents: -301 },
      { categoryId: null, amountCents: -700 },
    ],
  });
  // Synthetic historical split-transfer shape, without touching ledger write semantics.
  opened.sqlite
    .prepare(
      'UPDATE booking_split SET transfer_id = ? WHERE booking_id = ? AND category_id IS NULL',
    )
    .run(transfer.transferId, id);
  row('2026-10-02', 101);
  const removed = row('2026-10-03', -999);
  opened.sqlite
    .prepare('UPDATE booking SET deleted_at = ? WHERE id = ?')
    .run('2026-11-01', removed);
  row('2026-10-03', -999, { accountId: 'spar' });
  opened.sqlite.prepare('UPDATE account SET deleted_at = ? WHERE id = ?').run('2026-11-01', 'spar');
  expect((await read()).monthlyTotals).toEqual([
    { month: '2026-11', count: 0, cents: 0, cumulativeCents: 0 },
    { month: '2026-10', count: 2, cents: -200, cumulativeCents: -200 },
  ]);
});

it('uses booking-day EUR valuation and marks missing FX unavailable', async () => {
  opened.db
    .insert(schema.fxRate)
    .values({ currency: 'USD', date: '2026-11-01', rateMicro: 500000, source: 'ecb' })
    .run();
  row('2026-11-02', -102, { accountId: 'usd', currency: 'USD' });
  row('2026-10-01', -100, { accountId: 'usd', currency: 'USD' });
  expect((await read('accountId=usd')).monthlyTotals).toEqual([
    { month: '2026-11', count: 1, cents: -51, cumulativeCents: -51 },
    { month: '2026-10', count: 1, cents: null, cumulativeCents: null },
  ]);
});

it('excludes real mixed and whole transfer legs consistently for category and group report filters', async () => {
  accounts.create(
    opened.db,
    {
      id: 'tracking',
      name: 'Tracking Muster',
      type: 'other_asset',
      role: 'investment',
      onBudget: false,
      openingDate: '2023-10-01',
    },
    testCtx,
  );
  row('2026-11-01', -1001, {
    splits: [
      { categoryId: 'essen', amountCents: -301 },
      { categoryId: 'essen', amountCents: -700, transferAccountId: 'tracking' },
    ],
  });
  createTransfer(
    opened.db,
    {
      fromAccountId: 'giro',
      toAccountId: 'tracking',
      date: '2026-11-02',
      amountCents: 500,
      categoryId: 'essen',
    },
    testCtx,
  );
  const expected = [{ month: '2026-11', count: 1, cents: -301, cumulativeCents: -301 }];
  expect((await read('categoryId=essen')).monthlyTotals).toEqual(expected);
  const classified = await read('categoryId=essen&basis=category-spending');
  expect(classified.categorySpendingCents).toBe(1501);
  expect(classified.monthlyTotals).toEqual(expected);
  expect((await read('categoryGroupId=g')).monthlyTotals).toEqual(expected);
  row('2026-10-01', -701, {
    splits: [
      { categoryId: null, amountCents: -201 },
      { categoryId: 'reise', amountCents: -500 },
    ],
  });
  expect((await read('categoryId=none')).monthlyTotals).toEqual([
    { month: '2026-11', count: 0, cents: 0, cumulativeCents: 0 },
    { month: '2026-10', count: 1, cents: -201, cumulativeCents: -201 },
  ]);
});
