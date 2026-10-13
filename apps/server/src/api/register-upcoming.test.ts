import {
  accounts,
  createBooking,
  createPayee,
  createTestDatabase,
  queryBookings,
  undo,
  upcoming,
  type OpenedDatabase,
} from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { expectedRoutes } from './expected';
import { errorResponse } from './http';

let opened: OpenedDatabase;
let app: Hono;
let occurrenceId: string;
let payeeId: string;
beforeEach(async () => {
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: 'a',
      name: 'Konto Muster',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    },
    { actor: 'tester' },
  );
  app = new Hono().route(
    '/expected',
    expectedRoutes(opened.db, () => '2026-10-13'),
  );
  app.onError(errorResponse);
  payeeId = createPayee(opened.db, { name: 'Empfänger Muster' }, { actor: 'tester' }).id;
  await app.request('/expected', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Wöchentlich Muster',
      kind: 'outflow',
      accountId: 'a',
      payeeId,
      rhythm: 'weekly',
      dueDay: 19,
      startDate: '2026-10-19',
      validFrom: '2026-10-19',
      amountCents: 203,
    }),
  });
  occurrenceId = upcoming(opened.db, '2026-10-19', '2026-10-19')[0]!.occurrenceId;
});
afterEach(() => opened.close());

const book = (date = '2026-10-13') =>
  app.request(`/expected/occurrences/${occurrenceId}/book`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date }),
  });

it('books and links once, with atomic undo and redo of booking and recurrence', async () => {
  const response = await book();
  expect(response.status).toBe(201);
  const result = (await response.json()) as { groupId: string; bookingId: string };
  expect(queryBookings(opened.db, { accountId: 'a' }).items[0]).toMatchObject({
    id: result.bookingId,
    date: '2026-10-13',
    amountCents: -203,
    balanceAfterCents: 99797,
  });
  expect(upcoming(opened.db, '2026-10-19', '2026-10-19')[0]).toMatchObject({
    bookingId: result.bookingId,
    status: 'received',
  });
  expect((await book()).status).toBe(409);
  expect(queryBookings(opened.db, {}).total).toBe(1);
  const undone = undo(opened.db, { groupId: result.groupId }, { actor: 'tester' });
  expect(queryBookings(opened.db, {}).total).toBe(0);
  expect(upcoming(opened.db, '2026-10-19', '2026-10-19')[0]).toMatchObject({
    bookingId: null,
    status: 'expected',
  });
  undo(opened.db, { groupId: undone.groupId }, { actor: 'tester' });
  expect(queryBookings(opened.db, {}).total).toBe(1);
  expect(upcoming(opened.db, '2026-10-19', '2026-10-19')[0]?.bookingId).toBe(result.bookingId);
});

it('allows the due date and refuses arbitrary dates without creating a booking', async () => {
  expect((await book('2026-10-14')).status).toBe(422);
  expect(queryBookings(opened.db, {}).total).toBe(0);
  expect((await book('2026-10-19')).status).toBe(201);
});

it('refuses closed accounts and skipped occurrences without a partial booking', async () => {
  opened.sqlite.prepare("UPDATE account SET closed_at = '2026-10-13' WHERE id = 'a'").run();
  expect((await book()).status).toBe(409);
  opened.sqlite.prepare("UPDATE account SET closed_at = NULL WHERE id = 'a'").run();
  opened.sqlite
    .prepare("UPDATE expected_occurrence SET status = 'skipped' WHERE id = ?")
    .run(occurrenceId);
  expect((await book()).status).toBe(409);
  expect(queryBookings(opened.db, {}).total).toBe(0);
});

it('omits a matching future capture and exposes the following weekly occurrence without mutating', async () => {
  createBooking(
    opened.db,
    {
      accountId: 'a',
      payeeId,
      date: '2026-10-19',
      amountCents: -203,
      status: 'pending',
      splits: [{ amountCents: -203 }],
    },
    { actor: 'tester' },
  );
  const before = opened.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get();
  const response = await app.request('/expected/register-next');
  expect(response.status).toBe(200);
  const result = (await response.json()) as { occurrences: { dueDate: string }[] };
  expect(result.occurrences.map((o) => o.dueDate)).toEqual(['2026-10-26']);
  expect(opened.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get()).toEqual(before);
  expect((await book()).status).toBe(409);
  expect(queryBookings(opened.db, {}).total).toBe(1);
});

it('rolls back the capture when its category was deleted', async () => {
  opened.sqlite
    .prepare("INSERT INTO category_group (id, name) VALUES ('group', 'Gruppe Muster')")
    .run();
  opened.sqlite
    .prepare(
      "INSERT INTO category (id, group_id, name, class, deleted_at) VALUES ('category', 'group', 'Kategorie Muster', 'need', '2026-10-13')",
    )
    .run();
  opened.sqlite.prepare("UPDATE expected_payment SET category_id = 'category'").run();
  const before = opened.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get();
  expect((await book()).status).toBe(422);
  expect(queryBookings(opened.db, {}).total).toBe(0);
  expect(upcoming(opened.db, '2026-10-19', '2026-10-19')[0]).toMatchObject({
    bookingId: null,
    status: 'expected',
  });
  expect(opened.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get()).toEqual(before);
});

it('does not claim a foreign amount is native account cash', async () => {
  const paymentId = upcoming(opened.db, '2026-10-19', '2026-10-19')[0]!.paymentId;
  const response = await app.request(`/expected/${paymentId}/versions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ validFrom: '2026-10-20', amountCents: 203, currency: 'USD' }),
  });
  expect(response.status).toBe(201);
  occurrenceId = upcoming(opened.db, '2026-10-26', '2026-10-26')[0]!.occurrenceId;
  expect((await book()).status).toBe(422);
  expect(queryBookings(opened.db, {}).total).toBe(0);
});
