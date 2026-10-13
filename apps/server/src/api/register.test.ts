import {
  accounts,
  createTestDatabase,
  schema,
  type BookingPage,
  type OpenedDatabase,
} from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { bookingRoutes } from './bookings';
import { errorResponse } from './http';

let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: 'register',
      name: 'Register Muster',
      type: 'credit_card',
      role: 'debt',
      onBudget: true,
      openingDate: '2023-01-01',
      openingBalanceCents: 100000,
    },
    { actor: 'tester' },
  );
  // Synthetic large ledger: tied dates, five calendar months, integer-cent movements.
  opened.sqlite.transaction(() => {
    const b = opened.sqlite.prepare(
      "INSERT INTO booking (id, account_id, date, amount_cents, memo, status) VALUES (?, 'register', ?, -100, ?, 'confirmed')",
    );
    const s = opened.sqlite.prepare(
      'INSERT INTO booking_split (id, booking_id, amount_cents) VALUES (?, ?, -100)',
    );
    for (let i = 0; i < 10000; i++) {
      const id = `fixture-${String(i).padStart(5, '0')}`;
      b.run(
        id,
        `2026-${String(5 + Math.floor(i / 2000)).padStart(2, '0')}-01`,
        i % 2 ? 'Other' : 'Needle',
      );
      s.run(`split-${id}`, id);
    }
  })();
  app = new Hono().route(
    '/bookings',
    bookingRoutes(opened.db, () => '2026-10-02'),
  );
  app.onError(errorResponse);
});
afterEach(() => opened.close());

it('paginates filtered history to the first booking with unfiltered running balances', async () => {
  let cursor: string | null = null;
  const seen = new Set<string>();
  let last: BookingPage['items'][number] | undefined;
  do {
    const params = new URLSearchParams({ accountId: 'register', q: 'Needle', limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const response = await app.request(`/bookings?${params}`);
    expect(response.status).toBe(200);
    const page = (await response.json()) as BookingPage;
    expect(page.total).toBe(5000);
    expect(page.sumCents).toBe(-500000);
    for (const b of page.items) {
      expect(seen.has(b.id)).toBe(false);
      seen.add(b.id);
      const index = Number(b.id.slice(-5));
      expect(b.balanceAfterCents).toBe(100000 - (index + 1) * 100);
    }
    last = page.items.at(-1);
    cursor = page.nextCursor;
  } while (cursor);
  expect(seen.size).toBe(5000);
  expect(last).toMatchObject({ id: 'fixture-00000', date: '2026-05-01', balanceAfterCents: 99900 });
});

it('reports POST/PATCH server timing below 500 ms on 10000 synthetic bookings', async () => {
  const write = async (method: string, path: string, body: unknown) => {
    const start = performance.now();
    const response = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const elapsed = performance.now() - start;
    expect(response.ok, await response.clone().text()).toBe(true);
    const timing = response.headers.get('server-timing');
    expect(timing).toMatch(/^booking;dur=\d+(\.\d+)?$/);
    const duration = Number(timing!.split('=')[1]);
    expect(duration).toBeLessThan(500);
    console.info(
      `${method} booking: server=${duration} ms, request=${elapsed.toFixed(1)} ms, fixture=10000`,
    );
    return response.json();
  };
  const created = (await write('POST', '/bookings', {
    type: 'booking',
    accountId: 'register',
    date: '2026-10-02',
    amountCents: -203,
  })) as { id: string };
  await write('PATCH', `/bookings/${created.id}`, { amountCents: -204 });
  expect(opened.db.select().from(schema.booking).all()).toHaveLength(10001);
});
