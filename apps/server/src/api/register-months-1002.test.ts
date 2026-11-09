import {
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

it('filtered lists: month sum of the shown rows, signed, no balance, stable across pages', async () => {
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
  expect(first.monthlyKind).toBe('filtered');
  // Category filter: only the matching split counts, outflow negative, refunds positive.
  expect(first.monthlyTotals).toEqual([
    { month: '2026-11', count: 2, cents: -200, cumulativeCents: null },
    { month: '2026-10', count: 1, cents: -203, cumulativeCents: null },
  ]);
  expect((await read(`${query}&cursor=${first.nextCursor}`)).monthlyTotals).toEqual(
    first.monthlyTotals,
  );
  expect((await read(`${query}&sort=amount&direction=asc`)).monthlyTotals).toEqual(
    first.monthlyTotals,
  );
  expect((await read('q=no-match')).monthlyTotals).toEqual([]);
});

it('category-spending basis uses the same sign as the plain filter and agrees with the label', async () => {
  row('2026-11-02', -301);
  row('2026-10-01', -203);
  const plain = await read('categoryId=essen');
  const spending = await read('categoryId=essen&basis=category-spending');
  expect(spending.categorySpendingCents).toBe(504);
  expect(spending.monthlyTotals).toEqual(plain.monthlyTotals);
  expect(spending.monthlyTotals?.reduce((sum, m) => sum + (m.cents ?? 0), 0)).toBe(
    -(spending.categorySpendingCents ?? 0),
  );
});

it('account register: month net includes transfers and equals the running balance delta', async () => {
  row('2026-09-10', -500);
  createTransfer(
    opened.db,
    { fromAccountId: 'spar', toAccountId: 'giro', date: '2026-10-05', amountCents: 2500 },
    testCtx,
  );
  row('2026-10-07', -100);
  const page = await read('accountId=giro&limit=200');
  expect(page.monthlyKind).toBe('balance');
  expect(page.monthlyTotals).toEqual([
    // opening 100000, September -500, October +2500 -100
    { month: '2026-10', count: 2, cents: 2400, cumulativeCents: 101_900 },
    { month: '2026-09', count: 1, cents: -500, cumulativeCents: 99_500 },
  ]);
  const balanceOf = (date: string) =>
    page.items.filter((b) => b.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]
      ?.balanceAfterCents;
  // The cumulative value is the balance column at the last booking of the month.
  expect(balanceOf('2026-10-31')).toBe(101_900);
  expect(balanceOf('2026-09-30')).toBe(99_500);
  expect(101_900 - 99_500).toBe(2400);
});

it('hidden upcoming rows never count, however the range is passed', async () => {
  row('2026-11-05', -100);
  row('2026-11-20', -9_999);
  row('2026-12-03', -7_777);
  const page = await read('accountId=giro');
  expect(page.monthlyTotals).toEqual([
    { month: '2026-11', count: 1, cents: -100, cumulativeCents: 99_900 },
  ]);
  const multi = await read();
  expect(multi.monthlyKind).toBe('rows');
  expect(multi.monthlyTotals).toEqual([
    { month: '2026-11', count: 1, cents: -100, cumulativeCents: null },
  ]);
});

it('excludes whole and split transfer legs from category filters and ignores deleted rows', async () => {
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
  expect((await read('categoryId=essen')).monthlyTotals).toEqual([
    { month: '2026-10', count: 2, cents: -200, cumulativeCents: null },
  ]);
  expect((await read('categoryId=none')).monthlyTotals).toEqual([]);
});

it('uses booking-day EUR valuation, marks missing FX unavailable and shows no balance for foreign accounts', async () => {
  opened.db
    .insert(schema.fxRate)
    .values({ currency: 'USD', date: '2026-11-01', rateMicro: 500000, source: 'ecb' })
    .run();
  row('2026-11-02', -102, { accountId: 'usd', currency: 'USD' });
  row('2026-10-01', -100, { accountId: 'usd', currency: 'USD' });
  const page = await read('accountId=usd');
  expect(page.monthlyTotals).toEqual([
    { month: '2026-11', count: 1, cents: -51, cumulativeCents: null },
    { month: '2026-10', count: 1, cents: null, cumulativeCents: null },
  ]);
});
