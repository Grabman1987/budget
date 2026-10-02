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
  it('removes deleted unallocated source rows from the report and restores them with undo', async () => {
    const id = outlay(3000);
    const removed = await call('DELETE', `/bookings/${id}`);
    expect(removed.status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.movements).toEqual([]);
    expect((await call('GET', '/contacts?history=1')).body.totals.balanceCents).toBe(0);
    expect((await call('POST', '/undo', { groupId: removed.body.groupId })).status).toBe(200);
    expect(
      (await call('GET', '/contacts/k1')).body.movements.map((m: any) => m.balanceCents),
    ).toEqual([3000]);
  });
  it('reports exact EUR cash/debt signs, running balances, pending metadata and undo', async () => {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-01',
        amountCents: -10000,
        status: 'pending',
        splits: [
          { categoryId: 'auslagen', contactId: 'k1', amountCents: -10000, memo: 'Anteil Haushalt' },
        ],
      },
      { actor: 'test' },
    );
    const receipt = await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-01',
      amountCents: 12000,
    });
    expect(receipt.status).toBe(201);
    const statement = (await call('GET', '/contacts/k1')).body;
    expect(statement).toMatchObject({ currency: 'EUR', balanceCents: -2000, creditCents: 2000 });
    expect(
      statement.movements.map((m: any) => [
        m.amountCents,
        m.contactDeltaCents,
        m.balanceCents,
        m.currency,
        m.status,
        m.accountId,
      ]),
    ).toEqual([
      [-10000, 10000, 10000, 'EUR', 'pending', 'giro'],
      [12000, -12000, -2000, 'EUR', 'confirmed', 'giro'],
    ]);
    expect(statement.movements[0].memo).toBe('Anteil Haushalt');
    expect((await call('GET', '/contacts?history=1')).body).toMatchObject({
      currency: 'EUR',
      totals: { receivableCents: 0, payableCents: 2000, balanceCents: -2000 },
    });
    expect((await call('GET', '/contacts/k1?asOf=2026-08-31')).body.movements).toEqual([]);
    const undone = await call('POST', '/undo', { groupId: receipt.body.groupId });
    expect(
      (await call('GET', '/contacts/k1')).body.movements.map((m: any) => m.balanceCents),
    ).toEqual([10000]);
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    expect(
      (await call('GET', '/contacts/k1')).body.movements.map((m: any) => m.balanceCents),
    ).toEqual([10000, -2000]);
  });
  it('retains balanced all-time history and excludes future movements until their date', async () => {
    const id = outlay(10000);
    await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 10000,
    });
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-10-01',
        amountCents: -5000,
        splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -5000 }],
      },
      { actor: 'test' },
    );
    expect((await call('GET', '/contacts')).body.contacts).toEqual([]);
    expect((await call('GET', '/contacts?history=1')).body.contacts).toHaveLength(1);
    const statement = (await call('GET', '/contacts/k1')).body;
    expect(statement.movements.map((m: any) => m.balanceCents)).toEqual([10000, 0]);
    expect(statement.movements[0].bookingId).toBe(id);
    expect((await call('GET', '/contacts/k1?asOf=2026-10-01')).body.balanceCents).toBe(5000);
    expect((await call('GET', '/contacts/missing')).status).toBe(404);
  });
  it('rejects the entire mixed-currency overview without a partial EUR total', async () => {
    outlay(10000);
    createEntity(
      opened.db,
      schema.contact,
      { id: 'foreign', name: 'Fremdwährung Kontakt' },
      { actor: 'test' },
    );
    createBooking(
      opened.db,
      {
        accountId: 'usd',
        date: '2026-09-01',
        amountCents: -5000,
        splits: [{ categoryId: 'auslagen', contactId: 'foreign', amountCents: -5000 }],
      },
      { actor: 'test' },
    );
    const result = await call('GET', '/contacts?history=1');
    expect(result.status).toBe(422);
    expect(result.body).not.toHaveProperty('totals');
    expect(result.body).not.toHaveProperty('contacts');
    expect((await call('GET', '/contacts/foreign')).status).toBe(422);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(10000);
  });
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
