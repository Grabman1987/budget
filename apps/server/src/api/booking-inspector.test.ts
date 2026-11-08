import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { bookingRoutes } from './bookings';
import { errorResponse } from './http';
import { readBookingInspector } from './booking-inspector';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
function book(id: string, overrides: Partial<typeof schema.booking.$inferInsert> = {}) {
  opened.db
    .insert(schema.booking)
    .values({
      id,
      accountId: 'giro',
      date: '2026-10-02',
      amountCents: -1234,
      payeeId: 'p1',
      status: 'confirmed',
      currency: 'EUR',
      ...overrides,
    })
    .run();
  opened.db
    .insert(schema.bookingSplit)
    .values({ id: `${id}-split`, bookingId: id, categoryId: 'essen', amountCents: -1234 })
    .run();
}
const read = (id = 'selected') => readBookingInspector(opened.db, id, '2026-10-02');

it('reads a reconciled booking without changing bookings, audit or occurrences', async () => {
  book('selected');
  opened.db
    .update(schema.booking)
    .set({ status: 'reconciled' })
    .where(eq(schema.booking.id, 'selected'))
    .run();
  opened.db
    .update(schema.payee)
    .set({ defaultCategoryId: 'essen' })
    .where(eq(schema.payee.id, 'p1'))
    .run();
  const before = [
    opened.db.select().from(schema.booking).all(),
    opened.db.select().from(schema.auditLog).all(),
    opened.db.select().from(schema.expectedOccurrence).all(),
  ];
  const app = new Hono().route(
    '/bookings',
    bookingRoutes(opened.db, () => '2026-10-02'),
  );
  app.onError(errorResponse);
  const response = await app.request('/bookings/selected/inspector');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    usualCategory: { id: 'essen', name: 'Essen' },
    history: [],
    repetition: null,
  });
  expect([
    opened.db.select().from(schema.booking).all(),
    opened.db.select().from(schema.auditLog).all(),
    opened.db.select().from(schema.expectedOccurrence).all(),
  ]).toEqual(before);
  expect((await app.request('/bookings/missing/inspector')).status).toBe(404);
});

it('bounds history to five other current bookings by identity, across accounts and currencies', () => {
  book('selected');
  for (let day = 20; day <= 26; day++) book(`history-${day}`, { date: `2026-09-${day}` });
  book('foreign', { date: '2026-10-01', accountId: 'usd', currency: 'USD' });
  book('future', { date: '2026-10-03' });
  book('no-payee', { payeeId: null });
  book('deleted');
  opened.db
    .update(schema.booking)
    .set({ deletedAt: '2026-10-02T12:00:00Z' })
    .where(eq(schema.booking.id, 'deleted'))
    .run();
  expect(read().history.map((row) => row.id)).toEqual([
    'foreign',
    'history-26',
    'history-25',
    'history-24',
    'history-23',
  ]);
  expect(read().history[0]).toMatchObject({ amountCents: -1234, currency: 'USD' });
  expect(read('no-payee')).toMatchObject({ usualCategory: null, history: [], repetition: null });
});

it('distinguishes matching rules from disabled or condition-mismatched payee references', () => {
  book('selected');
  const rules = [
    { id: 'matching', enabled: true, conditions: [{ type: 'payee', payeeId: 'p1' }] },
    { id: 'disabled', enabled: false, conditions: [{ type: 'payee', payeeId: 'p1' }] },
    {
      id: 'other-account',
      enabled: true,
      conditions: [
        { type: 'payee', payeeId: 'p1' },
        { type: 'account', accountId: 'spar' },
      ],
    },
    { id: 'unrelated', enabled: true, conditions: [{ type: 'contains', text: 'unrelated' }] },
    {
      id: 'counterparty',
      enabled: false,
      conditions: [
        { type: 'counterparty', text: 'Vermieter' },
        { type: 'account', accountId: 'spar' },
      ],
    },
  ];
  for (const [priority, rule] of rules.entries())
    opened.db
      .insert(schema.assignmentRule)
      .values({
        id: rule.id,
        name: rule.id,
        priority,
        enabled: rule.enabled,
        matchJson: JSON.stringify({ mode: 'all', conditions: rule.conditions }),
        actionJson: '{}',
        categoryId: 'essen',
      })
      .run();
  expect(read().rules).toEqual([
    { id: 'matching', name: 'matching', enabled: true, matches: true },
    { id: 'disabled', name: 'disabled', enabled: false, matches: true },
    { id: 'other-account', name: 'other-account', enabled: true, matches: false },
    { id: 'counterparty', name: 'counterparty', enabled: false, matches: false },
  ]);
});

it('only shows the stored recurrence link, including an older due date outside booking month', () => {
  book('selected');
  opened.db
    .insert(schema.expectedPayment)
    .values({ id: 'repeat', name: 'Synthetic repetition', payeeId: 'p1' })
    .run();
  expect(read().repetition).toBeNull();
  opened.db
    .insert(schema.expectedOccurrence)
    .values({
      id: 'occurrence',
      expectedPaymentId: 'repeat',
      dueDate: '2026-09-30',
      expectedAmountCents: -1234,
      status: 'received',
      bookingId: 'selected',
    })
    .run();
  expect(read().repetition).toEqual({
    id: 'repeat',
    name: 'Synthetic repetition',
    dueDate: '2026-09-30',
  });
  opened.db.update(schema.expectedOccurrence).set({ deletedAt: '2026-10-02T12:00:00Z' }).run();
  expect(read().repetition).toBeNull();
});
