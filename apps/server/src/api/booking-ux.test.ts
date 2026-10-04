import {
  accounts,
  createTestDatabase,
  getBooking,
  listExpectedPayments,
  listExpectedVersions,
  undo,
  schema,
  type OpenedDatabase,
  type ListedBooking,
} from '@budget/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bookingRoutes } from './bookings';
import { displaySettingsRoutes } from './display-settings';
import { errorResponse } from './http';

let opened: OpenedDatabase;
let app: Hono;
const today = '2026-10-04';
beforeEach(() => {
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: 'wallet',
      name: 'Bargeld Muster',
      type: 'cash',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
    },
    { actor: 'tester' },
  );
  app = new Hono()
    .route(
      '/bookings',
      bookingRoutes(opened.db, () => today),
    )
    .route('/settings', displaySettingsRoutes(opened.db));
  app.onError(errorResponse);
});
afterEach(() => opened.close());
const call = (method: string, path: string, body?: unknown, key?: string) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const create = (over: Record<string, unknown> = {}, key?: string) =>
  call(
    'POST',
    '/bookings',
    {
      type: 'booking',
      accountId: 'wallet',
      date: today,
      amountCents: -1234,
      memo: 'Musterzahlung',
      ...over,
    },
    key,
  );

describe('booking UX API', () => {
  it('cash defaults to confirmed; explicit pending and old rows stay unchanged', async () => {
    const old = (await (await create({ status: 'pending' })).json()) as {
      id: string;
      groupId: string;
      bookings: ListedBooking[];
    };
    const current = (await (await create()).json()) as {
      id: string;
      groupId: string;
      bookings: ListedBooking[];
    };
    expect(current.bookings[0]).toMatchObject({ status: 'confirmed' });
    expect(getBooking(opened.db, old.id)?.status).toBe('pending');
  });
  it.each([
    ['weekly', '2026-10-11'],
    ['monthly', '2026-11-04'],
    ['quarterly', '2027-01-04'],
    ['yearly', '2027-10-04'],
  ])('creates %s through the expected path and undoes both together', async (repeat, next) => {
    const response = await create({ repeat }, 'synthetic-repeat-1234');
    expect(response.status).toBe(201);
    const result = (await response.json()) as { id: string; groupId: string };
    expect(listExpectedPayments(opened.db, today)).toMatchObject([
      {
        name: 'Musterzahlung',
        accountId: 'wallet',
        rhythm: repeat,
        startDate: next,
        nextDueDate: next,
      },
    ]);
    const payment = listExpectedPayments(opened.db, today)[0]!;
    expect(listExpectedVersions(opened.db, payment.id)).toMatchObject([
      { validFrom: next, amountCents: 1234, currency: 'EUR' },
    ]);
    await create({ repeat }, 'synthetic-repeat-1234');
    expect(listExpectedPayments(opened.db, today)).toHaveLength(1);
    undo(opened.db, { groupId: result.groupId }, { actor: 'tester' });
    expect(getBooking(opened.db, result.id)).toBeUndefined();
    expect(listExpectedPayments(opened.db, today)).toHaveLength(0);
  });
  it('PATCH repeats the saved edit once, retaining stored budget month and undoing both', async () => {
    const b = (await (await create({ amountCents: 2000, incomeNextMonth: true })).json()) as {
      id: string;
      groupId: string;
      bookings: ListedBooking[];
    };
    const body = { memo: 'Muster neu', repeat: 'monthly' };
    const first = await call('PATCH', '/bookings/' + b.id, body, 'synthetic-patch-1234');
    expect(first.status).toBe(200);
    const result = (await first.json()) as { groupId: string };
    expect(getBooking(opened.db, b.id)).toMatchObject({
      memo: 'Muster neu',
      incomeNextMonth: true,
    });
    const retry = await call('PATCH', '/bookings/' + b.id, body, 'synthetic-patch-1234');
    expect(await retry.json()).toEqual(result);
    expect(listExpectedPayments(opened.db, today)).toHaveLength(1);
    undo(opened.db, { groupId: result.groupId }, { actor: 'tester' });
    expect(getBooking(opened.db, b.id)).toMatchObject({
      memo: 'Musterzahlung',
      incomeNextMonth: true,
    });
    expect(listExpectedPayments(opened.db, today)).toHaveLength(0);
  });
  it('rolls back booking and audit when the recurring create fails', async () => {
    const before = opened.db.select().from(schema.auditLog).all().length;
    opened.sqlite.exec(
      "CREATE TRIGGER reject_repeat BEFORE INSERT ON expected_payment BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    expect((await create({ repeat: 'monthly' })).status).toBe(422);
    expect(opened.db.select().from(schema.booking).all()).toEqual([]);
    expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(before);
  });
  it('checked date, amount, status and repetition need explicit unlock', async () => {
    const b = (await (await create()).json()) as {
      id: string;
      groupId: string;
      bookings: ListedBooking[];
    };
    opened.db
      .update(schema.booking)
      .set({ status: 'reconciled' })
      .where(eq(schema.booking.id, b.id))
      .run();
    for (const body of [
      { date: '2026-10-05' },
      { amountCents: -1200 },
      { status: 'pending' },
      { repeat: 'monthly' },
    ])
      expect((await call('PATCH', '/bookings/' + b.id, body)).status).toBe(409);
    expect(
      (await call('PATCH', '/bookings/' + b.id, { date: '2026-10-05', unlockReconciled: true }))
        .status,
    ).toBe(200);
  });
});
describe('future preview setting', () => {
  it('defaults to 35, accepts 0 and 365, audits and undoes', async () => {
    expect(await (await call('GET', '/settings')).json()).toEqual({ futurePreviewDays: 35 });
    const zero = (await (await call('PATCH', '/settings', { futurePreviewDays: 0 })).json()) as {
      id: string;
      groupId: string;
      bookings: ListedBooking[];
    };
    expect(await (await call('GET', '/settings')).json()).toEqual({ futurePreviewDays: 0 });
    undo(opened.db, { groupId: zero.groupId }, { actor: 'tester' });
    expect(await (await call('GET', '/settings')).json()).toEqual({ futurePreviewDays: 35 });
    expect((await call('PATCH', '/settings', { futurePreviewDays: 365 })).status).toBe(200);
  });
  it.each([-1, 366, 1.5, '35', null])('rejects %s without writing', async (futurePreviewDays) => {
    expect((await call('PATCH', '/settings', { futurePreviewDays })).status).toBe(400);
    expect(opened.db.select().from(schema.appSetting).all()).toEqual([]);
  });
});
