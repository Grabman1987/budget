/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect real JSON boundary results. */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { consumeContactCredit } from '@budget/domain';
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

it('keeps declined credit available for the next share and undoes the purchase as one group', async () => {
  const receipt = await call('POST', '/contacts/k1/settlements', {
    accountId: 'giro',
    date: '2026-09-01',
    amountCents: 301,
  });
  expect(receipt.status).toBe(201);
  const accounts = async () => {
    const { body } = await call('GET', '/accounts');
    return {
      balance: body.accounts.find((a: any) => a.id === 'giro').balanceCents,
      netWorth: body.netWorthEurCents,
    };
  };
  const before = await accounts();
  const saved = await call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date: '2026-09-05',
    amountCents: -853,
    splits: [
      { categoryId: 'auslagen', contactId: 'k1', amountCents: -101 },
      { categoryId: 'essen', contactId: 'k1', amountCents: -351, offsetContactCredit: false },
      { categoryId: 'reise', contactId: 'k1', amountCents: -401 },
    ],
  });
  expect(saved.status).toBe(201);
  const [standalone, declined, offset] = saved.body.bookings[0].splits;
  const after = await statement();
  expect(after).toMatchObject({ balanceCents: 552, creditCents: 0 });
  expect(after.outlays).toMatchObject([
    { splitId: standalone.id, remainingCents: 101 },
    { splitId: declined.id, remainingCents: 351 },
    { splitId: offset.id, remainingCents: 100 },
  ]);
  expect(after.creditUses).toMatchObject([{ outlaySplitId: offset.id, amountCents: 301 }]);
  expect(saved.body.bookings[0].splits.slice(3)).toMatchObject([
    { categoryId: 'reise', amountCents: 301 },
    { amountCents: -301 },
  ]);
  expect(await accounts()).toEqual({
    balance: before.balance - 853,
    netWorth: before.netWorth - 853,
  });
  expect((await call('POST', '/undo', { groupId: saved.body.groupId })).status).toBe(200);
  expect(await accounts()).toEqual(before);
  expect(await statement()).toMatchObject({ balanceCents: -301, creditCents: 301, outlays: [] });
});

it('leaves held credit alone when editing a purchase saved without an offset', async () => {
  expect(
    (
      await call('POST', '/contacts/k1/settlements', {
        accountId: 'giro',
        date: '2026-09-01',
        amountCents: 301,
      })
    ).status,
  ).toBe(201);
  const saved = await call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date: '2026-09-05',
    amountCents: -401,
    splits: [
      { categoryId: 'essen', contactId: 'k1', amountCents: -401, offsetContactCredit: false },
    ],
  });
  expect(saved.status).toBe(201);
  expect((await call('PATCH', `/bookings/${saved.body.id}`, { amountCents: -402 })).status).toBe(
    200,
  );
  expect(await statement()).toMatchObject({
    balanceCents: 101,
    creditCents: 301,
    creditUses: [],
    outlays: [{ remainingCents: 402 }],
  });
});

it('offers only unreserved credit when capturing a backdated share', async () => {
  expect(
    (
      await call('POST', '/contacts/k1/settlements', {
        accountId: 'giro',
        date: '2026-09-01',
        amountCents: 501,
      })
    ).status,
  ).toBe(201);
  expect((await purchase('2026-09-05', 800, 301)).status).toBe(201);
  const availability = await call('GET', '/contacts/k1/credit-availability?asOf=2026-09-03');
  expect(availability.status).toBe(200);
  expect(availability.body).toMatchObject([{ remainingCents: 200, categoryId: null }]);
  expect((await call('GET', '/contacts/k1?asOf=2026-09-03')).body.creditCents).toBe(501);

  expect((await purchase('2026-09-03', 800, 401)).status).toBe(201);
  expect(await statement()).toMatchObject({
    creditCents: 0,
    balanceCents: 201,
    outlays: [{ remainingCents: 201 }, { remainingCents: 0 }],
    creditUses: [{ amountCents: 200 }, { amountCents: 301 }],
  });
});

it('rejects declining credit on a repayment without leaving a booking or allocation', async () => {
  const cashBefore = cash();
  const saved = await call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date: '2026-09-05',
    amountCents: 301,
    splits: [{ contactId: 'k1', amountCents: 301, offsetContactCredit: false }],
  });
  expect(saved.status).toBe(422);
  expect(cash()).toBe(cashBefore);
  expect(await statement()).toMatchObject({ balanceCents: 0, creditCents: 0, receipts: [] });
});

/** The preview of the form (`consumeContactCredit`) must match what saving books (A4). */
async function parity(bound: boolean) {
  await call('POST', '/contacts/k1/settlements', {
    accountId: 'giro',
    date: '2026-09-01',
    amountCents: 300,
  });
  if (bound) {
    const receipt = (await statement()).receipts[0].receiptSplitId;
    const chosen = await call('POST', `/contacts/k1/credits/${receipt}`, {
      date: '2026-09-02',
      amountCents: 300,
      choice: 'category',
      categoryId: 'essen',
    });
    expect(chosen.status).toBe(201);
  }
  const before = await statement();
  const pool = before.credits
    .filter((c: any) => !c.targetOutlaySplitId)
    .map((c: any) => ({ remainingCents: c.remainingCents, categoryId: c.categoryId }));
  const preview = [
    consumeContactCredit(pool, 'reise', 200),
    consumeContactCredit(pool, 'essen', 200),
  ];
  const saved = await call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date: '2026-09-05',
    amountCents: -400,
    splits: [
      { categoryId: 'reise', contactId: 'k1', amountCents: -200 },
      { categoryId: 'essen', contactId: 'k1', amountCents: -200 },
    ],
  });
  expect(saved.status).toBe(201);
  const after = await statement();
  const created = new Set(saved.body.bookings[0].splits.map((x: any) => x.id));
  const booked = after.outlays
    .filter((o: any) => created.has(o.splitId))
    .map((o: any) =>
      after.creditUses
        .filter((u: any) => u.outlaySplitId === o.splitId)
        .reduce((sum: number, u: any) => sum + u.amountCents, 0),
    );
  expect(booked).toEqual(preview);
  return preview;
}

it('previews the credit use like the saved booking: free credit goes in line order', async () => {
  expect(await parity(false)).toEqual([200, 100]);
});

it('previews the credit use like the saved booking: category credit only for its category', async () => {
  expect(await parity(true)).toEqual([0, 200]);
});
