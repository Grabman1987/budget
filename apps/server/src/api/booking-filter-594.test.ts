import {
  createBooking,
  createTestDatabase,
  schema,
  type BookingPage,
  type OpenedDatabase,
} from '@budget/db';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { eq } from 'drizzle-orm';
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
    bookingRoutes(opened.db, () => '2026-10-02'),
  );
  app.onError(errorResponse);
});
afterEach(() => opened.close());
const row = (amountCents: number, extra: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-02',
      amountCents,
      memo: 'Current filter',
      splits: [{ categoryId: 'essen', amountCents }],
      ...extra,
    },
    testCtx,
  );

it('returns exact signed native totals for the whole filter, independent of cursor pages', async () => {
  const ids = [row(-1234), row(567), row(-890)];
  row(-4321, {
    accountId: 'usd',
    currency: 'USD',
    splits: [{ categoryId: null, amountCents: -4321 }],
  });
  row(-9999, { memo: 'Outside filter' });
  const response = await app.request(
    '/bookings?q=Current%20filter&limit=1&sort=amount&direction=asc',
  );
  expect(response.status).toBe(200);
  const page = (await response.json()) as BookingPage;
  expect(page.total).toBe(4);
  expect(page.items).toHaveLength(1);
  expect(page.nativeTotals).toEqual([
    { currency: 'EUR', count: 3, cents: -1557 },
    { currency: 'USD', count: 1, cents: -4321 },
  ]);
  const next = (await (
    await app.request(
      `/bookings?q=Current%20filter&limit=1&sort=amount&direction=asc&cursor=${page.nextCursor}`,
    )
  ).json()) as BookingPage;
  expect(next.nativeTotals).toEqual(page.nativeTotals);
  const filtered = (await (
    await app.request('/bookings?q=Current%20filter&accountId=giro')
  ).json()) as BookingPage;
  expect(filtered.total).toBe(3);
  expect(filtered.nativeTotals).toEqual([{ currency: 'EUR', count: 3, cents: -1557 }]);
  expect(new Set(filtered.items.map((item) => item.id))).toEqual(new Set(ids));
});

it('marks unsafe native totals unavailable rather than displaying rounded money', async () => {
  row(9007199254740991);
  row(9007199254740991);
  const page = (await (await app.request('/bookings')).json()) as BookingPage;
  expect(page.nativeTotals).toEqual([{ currency: 'EUR', count: 2, cents: null }]);
});

it('retains canonical dated EUR totals for the same full foreign-account filter beyond the visible page', async () => {
  opened.db
    .insert(schema.fxRate)
    .values([
      { currency: 'USD', date: '2026-09-25', rateMicro: 500000, source: 'ecb' },
      { currency: 'USD', date: '2026-10-02', rateMicro: 750000, source: 'ecb' },
    ])
    .run();
  for (const [date, amountCents] of [
    ['2026-10-01', -101],
    ['2026-10-02', 201],
    ['2026-10-02', -10],
    ['2026-10-02', 100],
  ] as const) {
    row(amountCents, {
      accountId: 'usd',
      currency: 'USD',
      date,
      splits: [{ categoryId: null, amountCents }],
    });
  }
  const first = (await (
    await app.request('/bookings?accountId=usd&limit=1&sort=date&direction=asc')
  ).json()) as BookingPage;
  expect(first.total).toBe(4);
  expect(first.items).toHaveLength(1);
  expect(first.nativeTotals).toEqual([{ currency: 'USD', count: 4, cents: 190 }]);
  expect(first.sumEurCents).toBe(167);
  const next = (await (
    await app.request(
      `/bookings?accountId=usd&limit=1&sort=date&direction=asc&cursor=${first.nextCursor}`,
    )
  ).json()) as BookingPage;
  expect(next.nativeTotals).toEqual([{ currency: 'USD', count: 4, cents: 190 }]);
  expect(next.sumEurCents).toBe(167);
  row(-100, {
    accountId: 'usd',
    currency: 'USD',
    date: '2026-09-01',
    splits: [{ categoryId: null, amountCents: -100 }],
  });
  const missing = (await (
    await app.request('/bookings?accountId=usd&limit=1')
  ).json()) as BookingPage;
  expect(missing.total).toBe(5);
  expect(missing.nativeTotals).toEqual([{ currency: 'USD', count: 5, cents: 90 }]);
  expect(missing.sumEurCents).toBeNull();
});

it('exports exactly all filtered bookings beyond one cursor page with integer cents and safe UTF-8 CSV text', async () => {
  const ids = new Set<string>();
  for (let index = 0; index < 205; index++) ids.add(row(-101, { memo: 'Filtered ü; "quoted"' }));
  const formula = row(567, { memo: '  =SUM(1)' });
  row(-9999, { memo: 'Excluded' });
  row(-777, { memo: 'Filtered future', date: '2026-11-02' });
  const response = await app.request(
    '/bookings/csv?accountId=giro&from=2026-10-02&to=2026-10-02&q=Filtered&sort=amount&direction=asc&limit=1',
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/csv');
  expect(response.headers.get('cache-control')).toBe('no-store');
  const text = await response.text();
  const lines = text
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');
  expect(lines).toHaveLength(206);
  expect(new Set(lines.slice(1).map((line) => line.split(';')[0]?.replaceAll('"', '')))).toEqual(
    ids,
  );
  expect(lines[1]).toContain(';-101;-101;"EUR";');
  expect(lines[1]).toContain('"Filtered ü; ""quoted"""');
  const historyOnly = await app.request('/bookings/csv?q=Filtered');
  expect(historyOnly.status).toBe(200);
  expect((await historyOnly.text()).trimEnd().split('\r\n')).toHaveLength(206);
  const safe = await app.request(`/bookings/csv?ids=${formula}`);
  expect(safe.status).toBe(200);
  expect(await safe.text()).toContain('"\'  =SUM(1)"');
  expect(
    opened.db.select().from(schema.booking).where(eq(schema.booking.id, formula)).get()?.memo,
  ).toBe('  =SUM(1)');
});
