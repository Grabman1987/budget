import {
  createTestDatabase,
  createBooking,
  createEntity,
  schema,
  type OpenedDatabase,
  type ListedBooking,
} from '@budget/db';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createLedgerApi } from './index';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';

let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  createEntity(
    opened.db,
    schema.contact,
    { id: 'contact-alpha', name: 'Contact Alpha' },
    { actor: 'test' },
  );
  createEntity(
    opened.db,
    schema.category,
    { id: 'gift', name: 'Synthetisches Geschenk', groupId: 'g', class: 'want' },
    { actor: 'test' },
  );
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-20',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());
async function call<T>(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as T };
}
const origin = () =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-01',
      amountCents: -5500,
      memo: 'Synthetisches Geschenk mit Eigenanteil',
      splits: [
        {
          categoryId: 'auslagen',
          contactId: 'contact-alpha',
          amountCents: -4000,
          memo: 'Kontaktanteil',
        },
        { categoryId: 'essen', amountCents: -1500, memo: 'Unveränderter Eigenanteil' },
      ],
    },
    { actor: 'test' },
  );
const read = async (id: string) =>
  (await call<{ booking: ListedBooking }>('GET', `/bookings/${id}`)).body.booking;
const contact = () =>
  call<{ balanceCents: number; movements: { bookingId: string; amountCents: number }[] }>(
    'GET',
    '/contacts/contact-alpha',
  );

it('opens the actual mixed source read-only, converts only its unallocated share to a gift and restores it with real audited Undo', async () => {
  const id = origin();
  const beforeBytes = opened.sqlite.serialize();
  const before = await read(id);
  expect(before).toMatchObject({ id, accountId: 'giro', date: '2026-10-01', amountCents: -5500 });
  expect((await contact()).body).toMatchObject({
    balanceCents: 4000,
    movements: [{ bookingId: id, amountCents: -4000 }],
  });
  expect(opened.sqlite.serialize().equals(beforeBytes)).toBe(true);
  const changed = await call<{ groupId: string; bookings: ListedBooking[] }>(
    'PATCH',
    `/bookings/${id}`,
    {
      splits: [
        { categoryId: 'gift', contactId: null, amountCents: -4000, memo: 'Kontaktanteil' },
        { categoryId: 'essen', amountCents: -1500, memo: 'Unveränderter Eigenanteil' },
      ],
    },
  );
  expect(changed.status).toBe(200);
  const after = await read(id);
  expect(after).toEqual({
    ...before,
    splits: [
      {
        ...before.splits[0]!,
        categoryId: 'gift',
        categoryName: 'Synthetisches Geschenk',
        contactId: null,
      },
      before.splits[1]!,
    ],
  });
  expect((await contact()).body).toMatchObject({ balanceCents: 0, movements: [] });
  const undo = await call<{ groupId: string }>('POST', '/undo', { groupId: changed.body.groupId });
  expect(undo.status).toBe(200);
  expect(await read(id)).toEqual(before);
  expect((await contact()).body.balanceCents).toBe(4000);
  expect((await call('POST', '/undo', { groupId: undo.body.groupId })).status).toBe(200);
  expect((await contact()).body.balanceCents).toBe(0);
});

it('refuses gift conversion of an allocated source with the existing dependency explanation and zero partial writes', async () => {
  const id = origin();
  const receipt = await call('POST', '/contacts/contact-alpha/settlements', {
    accountId: 'giro',
    date: '2026-10-02',
    amountCents: 1500,
  });
  expect(receipt.status).toBe(201);
  const before = await read(id);
  const bytes = opened.sqlite.serialize();
  const rejected = await call<{ message: string }>('PATCH', `/bookings/${id}`, {
    splits: [
      { categoryId: 'gift', amountCents: -4000, contactId: null, memo: 'Kontaktanteil' },
      { categoryId: 'essen', amountCents: -1500, memo: 'Unveränderter Eigenanteil' },
    ],
  });
  expect(rejected.status).toBe(422);
  expect(rejected.body.message).toContain('Undo the related contact settlement');
  expect(await read(id)).toEqual(before);
  expect((await contact()).body.balanceCents).toBe(2500);
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
});

it('refuses editing an outlay bound by a cashless write-off without changing the bank payment', async () => {
  const id = origin();
  const writeOff = await call('POST', '/contacts/contact-alpha/write-offs', {
    accountId: 'giro',
    date: '2026-10-20',
    amountCents: 4000,
    categoryId: 'gift',
  });
  expect(writeOff.status).toBe(201);
  const before = await read(id);
  const bytes = opened.sqlite.serialize();
  const rejected = await call<{ message: string }>('PATCH', `/bookings/${id}`, {
    amountCents: -5600,
  });
  expect(rejected.status).toBe(422);
  expect(rejected.body.message).toContain('zuerst den Ausgleich rückgängig');
  expect(await read(id)).toEqual(before);
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
});
