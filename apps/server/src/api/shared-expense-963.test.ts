/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect real JSON boundary results. */
import { createTestDatabase, type OpenedDatabase } from '@budget/db';
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
const purchase = () =>
  call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date: '2026-09-01',
    amountCents: -4000,
    splits: [
      { categoryId: 'essen', amountCents: -2000 },
      { categoryId: 'essen', contactId: 'k1', amountCents: -2000 },
    ],
  });
const statement = async () => (await call('GET', '/contacts/k1')).body;
const budget = async () => (await call('GET', '/budget/2026-09')).body.summary;

it('ordinary manual capture returns contact repayments to original categories, with one Undo', async () => {
  expect((await purchase()).status).toBe(201);
  const before = await budget();
  const receipt = await call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date: '2026-09-02',
    amountCents: 3000,
    splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: 3000 }],
  });
  expect(receipt.status).toBe(201);
  expect(receipt.body.bookings[0].splits).toEqual(
    expect.arrayContaining([expect.objectContaining({ categoryId: 'essen', amountCents: 2000 })]),
  );
  expect((await statement()).creditCents).toBe(1000);
  expect((await budget()).toBeAssignedCents).toBe(before.toBeAssignedCents);
  expect((await call('POST', '/undo', { groupId: receipt.body.groupId })).status).toBe(200);
  expect((await statement()).balanceCents).toBe(2000);
});

it.each(['free', 'category', 'gift'])(
  'offers an explicit %s choice for new excess and restores it atomically',
  async (choice) => {
    await purchase();
    const before = await budget();
    const receipt = await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 3000,
      creditChoice: choice,
      ...(choice === 'category' ? { creditCategoryId: 'reise' } : {}),
    });
    expect(receipt.status).toBe(201);
    const current = await statement();
    expect(current.creditCents).toBe(choice === 'gift' ? 0 : 1000);
    if (choice === 'category') expect(current.credits[0].categoryId).toBe('reise');
    if (choice === 'gift')
      expect(current.movements.some((m: any) => m.memo === 'Geschenk erhalten')).toBe(true);
    expect((await budget()).toBeAssignedCents).toBe(
      before.toBeAssignedCents + (choice === 'gift' ? 1000 : 0),
    );
    expect((await call('POST', '/undo', { groupId: receipt.body.groupId })).status).toBe(200);
    expect((await statement()).balanceCents).toBe(2000);
  },
);

it('validates stale existing-credit choices and future decisions at the API boundary', async () => {
  await call('POST', '/contacts/k1/settlements', {
    accountId: 'giro',
    date: '2026-09-02',
    amountCents: 1000,
  });
  const id = (await statement()).credits[0].receiptSplitId;
  expect(
    (
      await call('POST', `/contacts/k1/credits/${id}`, {
        date: '2026-09-02',
        amountCents: 1001,
        choice: 'gift',
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await call('POST', `/contacts/k1/credits/${id}`, {
        date: '2026-09-18',
        amountCents: 1000,
        choice: 'free',
      })
    ).status,
  ).toBe(422);
  const chosen = await call('POST', `/contacts/k1/credits/${id}`, {
    date: '2026-09-03',
    amountCents: 700,
    choice: 'category',
    categoryId: 'reise',
  });
  expect(chosen.status).toBe(201);
  expect((await statement()).credits.map((c: any) => c.remainingCents)).toEqual([300, 700]);
  expect(
    (
      await call('POST', `/contacts/k1/credits/${id}`, {
        date: '2026-09-03',
        amountCents: 700,
        choice: 'gift',
      })
    ).status,
  ).toBe(422);
});
