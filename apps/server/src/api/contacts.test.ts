/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect JSON boundary answers. */
import {
  createTestDatabase,
  createBooking,
  createEntity,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLedgerApi } from './index';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());
async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as any };
}
const outlay = (amountCents: number) =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-01',
      amountCents: -amountCents,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -amountCents }],
    },
    { actor: 'test' },
  );
describe('contacts API', () => {
  it('keeps balanced contacts selectable, preserves excess and supports atomic undo/redo', async () => {
    expect((await call('GET', '/contacts')).body.contacts).toEqual([]);
    expect((await call('GET', '/contacts?history=1')).body.contacts).toHaveLength(1);
    outlay(10000);
    const result = await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-03',
      amountCents: 12000,
    });
    expect(result.status).toBe(201);
    expect(result.body.creditCents).toBe(2000);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(-2000);
    expect((await call('DELETE', `/bookings/${result.body.bookingId}`)).status).toBe(422);
    const undone = await call('POST', '/undo', { groupId: result.body.groupId });
    expect(undone.status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(10000);
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(-2000);
  });
  it('validates actual positive EUR cash receipt and allocation at the server boundary', async () => {
    outlay(10000);
    const body = { accountId: 'giro', date: '2026-09-03', amountCents: 4000 };
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, date: '2026-09-18' })).status,
    ).toBe(422);
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, date: '2026-13-01' })).status,
    ).toBe(400);
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, amountCents: 1.5 })).status,
    ).toBe(400);
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, incomeTypeId: 'gift' })).status,
    ).toBe(400);
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, accountId: 'usd' })).status,
    ).toBe(422);
    expect(
      (
        await call('POST', '/contacts/k1/settlements', {
          ...body,
          allocations: [{ outlaySplitId: 'missing', amountCents: 4000 }],
        })
      ).status,
    ).toBe(422);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(10000);
  });
  it('creates retained contact identity and refuses undo while it has live movements', async () => {
    const c = await call('POST', '/contacts', { name: 'Kontakt Beispiel' });
    expect(c.status).toBe(201);
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-01',
        amountCents: -1000,
        splits: [{ categoryId: 'auslagen', contactId: c.body.contact.id, amountCents: -1000 }],
      },
      { actor: 'test' },
    );
    expect((await call('POST', '/undo', { groupId: c.body.groupId, force: true })).status).toBe(
      422,
    );
    expect((await call('GET', `/contacts/${c.body.contact.id}`)).body.balanceCents).toBe(1000);
    createEntity(
      opened.db,
      schema.contact,
      { id: 'other', name: 'Zweiter Kontakt' },
      { actor: 'test' },
    );
  });
});
