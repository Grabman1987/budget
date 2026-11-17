/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect real JSON boundary results. */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { isNull } from 'drizzle-orm';
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
  return { status: response.status, body: (await response.json()) as any };
}
const statement = async () => (await call('GET', '/contacts/k1')).body;
/** Cash held on all accounts: what net worth moves with. The offset itself must not change it. */
const cash = () =>
  opened.db
    .select()
    .from(schema.booking)
    .where(isNull(schema.booking.deletedAt))
    .all()
    .reduce((sum, b) => sum + b.amountCents, 0);
const purchase = (date: string, total: number, share: number) =>
  call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date,
    amountCents: -total,
    splits: [
      { categoryId: 'essen', amountCents: -(total - share) },
      { categoryId: 'essen', contactId: 'k1', amountCents: -share },
    ],
  });

it('settles a share against credit the contact paid in advance, counting every cent once', async () => {
  // The contact paid 600 beforehand: credit, no claim.
  expect(
    (
      await call('POST', '/contacts/k1/settlements', {
        accountId: 'giro',
        date: '2026-09-01',
        amountCents: 600,
      })
    ).status,
  ).toBe(201);
  const before = await statement();
  expect(before).toMatchObject({ balanceCents: -600, creditCents: 600 });
  const cashBefore = cash();

  // A purchase of 1000 with a contact share of 400 is covered by the credit.
  const saved = await purchase('2026-09-05', 1000, 400);
  expect(saved.status).toBe(201);
  const after = await statement();
  expect(after.balanceCents).toBe(before.balanceCents + 400);
  expect(after.creditCents).toBe(200);
  expect(after.outlays.map((o: any) => o.remainingCents)).toEqual([0]);
  expect(after.creditUses.reduce((sum: number, u: any) => sum + u.amountCents, 0)).toBe(400);
  // Cash moves by the purchase only; the offset booked no money.
  expect(cash()).toBe(cashBefore - 1000);
  const booking = opened.db
    .select()
    .from(schema.booking)
    .all()
    .find((b) => b.amountCents === -1000)!;
  const splits = opened.db.select().from(schema.bookingSplit).all();
  expect(
    splits.filter((s) => s.bookingId === booking.id).reduce((sum, s) => sum + s.amountCents, 0),
  ).toBe(-1000);

  // Undo takes the whole purchase and its offset back in one step.
  expect((await call('POST', '/undo', { groupId: saved.body.groupId })).status).toBe(200);
  expect(await statement()).toMatchObject({ balanceCents: -600, creditCents: 600 });
  expect(cash()).toBe(cashBefore);
});

it('leaves the part the credit does not cover open as a claim', async () => {
  await call('POST', '/contacts/k1/settlements', {
    accountId: 'giro',
    date: '2026-09-01',
    amountCents: 300,
  });
  expect((await purchase('2026-09-05', 1000, 500)).status).toBe(201);
  const s = await statement();
  // 500 share - 300 credit = 200 open; balance = share - received.
  expect(s.balanceCents).toBe(200);
  expect(s.creditCents).toBe(0);
  expect(s.outlays.map((o: any) => o.remainingCents)).toEqual([200]);
  const applied = s.creditUses.reduce((sum: number, u: any) => sum + u.amountCents, 0);
  expect(applied + s.outlays[0].remainingCents).toBe(500);
});
