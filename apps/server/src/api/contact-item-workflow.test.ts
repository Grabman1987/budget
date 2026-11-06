/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect real JSON boundary results. */
import { createBooking, createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import type { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

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
  return { status: response.status, body: (await response.json().catch(() => null)) as any };
}
function outlay(amountCents: number, date = '2026-09-01') {
  return createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents: -amountCents,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -amountCents }],
    },
    { actor: 'test' },
  );
}
const receipt = (amountCents: number, extra: Record<string, unknown> = {}) =>
  call('POST', '/contacts/k1/settlements', {
    accountId: 'giro',
    date: '2026-09-17',
    amountCents,
    ...extra,
  });
const statement = async () => (await call('GET', '/contacts/k1')).body;
const budget = async () => (await call('GET', '/budget/2026-09')).body.summary.toBeAssignedCents;

it('moves only a new receipt excess into the budget and undoes both bookings as one group', async () => {
  outlay(1000);
  const before = await budget();
  const result = await receipt(1200, { excessToBudget: true });
  expect(result.status).toBe(201);
  expect((await statement()).balanceCents).toBe(0);
  expect(await budget()).toBe(before + 200);
  expect(result.body.budgetConversion.amountCents).toBe(200);
  expect((await call('POST', '/undo', { groupId: result.body.groupId })).status).toBe(200);
  expect((await statement()).balanceCents).toBe(1000);
  expect(await budget()).toBe(before);
});

it('retains legacy contact credit when a new receipt excess goes to the budget', async () => {
  expect((await receipt(300)).status).toBe(201);
  const before = await budget();
  const result = await receipt(500, { excessToBudget: true });
  expect(result.status).toBe(201);
  expect((await statement()).balanceCents).toBe(-300);
  expect((await statement()).creditCents).toBe(300);
  expect(await budget()).toBe(before + 500);
});

it('does not activate a future outlay while converting a current receipt excess', async () => {
  const futureId = outlay(1000, '2026-10-02');
  const result = await receipt(500, { excessToBudget: true });
  expect(result.status).toBe(201);
  expect((await statement()).balanceCents).toBe(0);
  const future = (await call('GET', '/contacts/k1?asOf=2026-10-02')).body;
  expect(future.balanceCents).toBe(1000);
  expect(future.outlays.find((o: any) => o.bookingId === futureId).remainingCents).toBe(1000);
});

it('rolls back the entire receipt if a dated excess was already consumed by later outlays', async () => {
  outlay(400, '2026-09-10');
  const beforeBookings = opened.db.select().from(schema.booking).all();
  const beforeAudit = opened.db.select().from(schema.auditLog).all();
  const result = await receipt(500, { date: '2026-09-02', excessToBudget: true });
  expect(result.status).toBe(422);
  expect(opened.db.select().from(schema.booking).all()).toEqual(beforeBookings);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual(beforeAudit);
});

it('reclassifies only the selected later outlay as an own expense without paying an older debt', async () => {
  outlay(1000);
  const selected = outlay(2000, '2026-09-02');
  const split = (await statement()).outlays.find((o: any) => o.bookingId === selected);
  const result = await call('POST', `/contacts/k1/outlays/${split.splitId}/gift`, {
    amountCents: 2000,
    categoryId: 'reise',
  });
  expect(result.status).toBe(201);
  const after = await statement();
  expect(after.balanceCents).toBe(1000);
  expect(after.outlays).toHaveLength(1);
  expect(after.outlays[0].remainingCents).toBe(1000);
  const booking = (await call('GET', `/bookings/${selected}`)).body.booking;
  expect(booking).toMatchObject({ date: '2026-09-02', amountCents: -2000 });
  expect(booking.splits).toMatchObject([
    { categoryId: 'reise', contactId: null, amountCents: -2000 },
  ]);
  expect((await call('POST', '/undo', { groupId: result.body.groupId })).status).toBe(200);
  expect((await statement()).balanceCents).toBe(3000);
});

it('converts an explicit partial amount while keeping the other source splits and bank amount', async () => {
  const selected = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-01',
      amountCents: -1500,
      splits: [
        { categoryId: 'auslagen', contactId: 'k1', amountCents: -1000 },
        { categoryId: 'essen', amountCents: -500 },
      ],
    },
    { actor: 'test' },
  );
  const split = (await statement()).outlays[0];
  const result = await call('POST', `/contacts/k1/outlays/${split.splitId}/gift`, {
    amountCents: 400,
    categoryId: 'reise',
  });
  expect(result.status).toBe(201);
  expect((await statement()).balanceCents).toBe(600);
  const booking = (await call('GET', `/bookings/${selected}`)).body.booking;
  expect(booking.amountCents).toBe(-1500);
  expect(booking.splits).toMatchObject([
    { categoryId: 'auslagen', contactId: 'k1', amountCents: -600 },
    { categoryId: 'essen', contactId: null, amountCents: -500 },
    { categoryId: 'reise', contactId: null, amountCents: -400 },
  ]);
});

it('refuses gifts on allocated or future outlays without bypassing their existing locks', async () => {
  outlay(1000);
  const split = (await statement()).outlays[0];
  await receipt(400);
  const before = opened.db.select().from(schema.auditLog).all();
  expect(
    (
      await call('POST', `/contacts/k1/outlays/${split.splitId}/gift`, {
        amountCents: 600,
        categoryId: 'reise',
      })
    ).status,
  ).toBe(422);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual(before);
  const futureId = outlay(500, '2026-10-02');
  const future = (await call('GET', '/contacts/k1?asOf=2026-10-02')).body.outlays.find(
    (o: any) => o.bookingId === futureId,
  );
  expect(
    (
      await call('POST', `/contacts/k1/outlays/${future.splitId}/gift`, {
        amountCents: 500,
        categoryId: 'reise',
      })
    ).status,
  ).toBe(422);
});

it('keeps the reconciled lock and refuses non-expense gift categories without audit writes', async () => {
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-01',
      amountCents: -1000,
      status: 'reconciled',
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -1000 }],
    },
    { actor: 'test' },
  );
  const split = (await statement()).outlays[0];
  const before = opened.db.select().from(schema.auditLog).all();
  expect(
    (
      await call('POST', `/contacts/k1/outlays/${split.splitId}/gift`, {
        amountCents: 1000,
        categoryId: 'reise',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call('POST', `/contacts/k1/outlays/${split.splitId}/gift`, {
        amountCents: 1000,
        categoryId: 'auslagen',
      })
    ).status,
  ).toBe(422);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual(before);
});
