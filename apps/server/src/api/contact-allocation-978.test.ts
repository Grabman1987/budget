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
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  return { status: response.status, body: (await response.json()) as any };
}
const statement = async () => (await call('GET', '/contacts/k1')).body;
const purchase = (categoryId: string, date: string) =>
  call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date,
    amountCents: -1001,
    splits: [{ categoryId, contactId: 'k1', amountCents: -1001 }],
  });
const receipt = () =>
  call('POST', '/contacts/k1/settlements', {
    accountId: 'giro',
    date: '2026-09-02',
    amountCents: 701,
  });

it('previews and reallocates a saved repayment to a later outlay with one Undo group', async () => {
  await purchase('essen', '2026-09-01');
  await receipt();
  await purchase('reise', '2026-09-03');
  const before = await statement();
  const url = `/contacts/k1/settlements/${before.receipts[0].receiptSplitId}/allocations`;
  const preview = await call('GET', url);
  expect(preview.status).toBe(200);
  expect(preview.body.outlays.map((o: any) => o.remainingCents)).toEqual([1001, 1001]);
  const changed = await call('POST', url, {
    allocations: [{ outlaySplitId: before.outlays[1].splitId, amountCents: 701 }],
  });
  expect(changed.status).toBe(200);
  expect((await statement()).outlays.map((o: any) => o.remainingCents)).toEqual([1001, 300]);
  expect((await call('POST', '/undo', { groupId: changed.body.groupId })).status).toBe(200);
  expect((await statement()).receipts).toEqual(before.receipts);
});

it('exposes consumed credit and accepts an exact partial choice', async () => {
  await receipt();
  await purchase('essen', '2026-09-03');
  const before = await statement();
  expect(before.creditChoices).toMatchObject([
    { remainingCents: 0, availableCents: 701, automaticallyUsedCents: 701 },
  ]);
  const chosen = await call('POST', `/contacts/k1/credits/${before.receipts[0].receiptSplitId}`, {
    date: '2026-09-17',
    amountCents: 101,
    choice: 'category',
    categoryId: 'reise',
  });
  expect(chosen.status).toBe(201);
  expect((await statement()).outlays[0].remainingCents).toBe(401);
  expect((await statement()).creditCents).toBe(101);
});

it.each([1.5, -1, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid allocation cents %s without a write',
  async (amountCents) => {
    await purchase('essen', '2026-09-01');
    await receipt();
    const before = await statement();
    const bytes = opened.sqlite.serialize();
    const result = await call(
      'POST',
      `/contacts/k1/settlements/${before.receipts[0].receiptSplitId}/allocations`,
      {
        allocations: [{ outlaySplitId: before.outlays[0].splitId, amountCents }],
      },
    );
    expect(result.status).toBe(400);
    expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  },
);

it('rejects foreign contact and missing targets without changing any allocation', async () => {
  await purchase('essen', '2026-09-01');
  await receipt();
  const before = await statement();
  const bytes = opened.sqlite.serialize();
  const result = await call(
    'POST',
    `/contacts/k1/settlements/${before.receipts[0].receiptSplitId}/allocations`,
    {
      allocations: [{ outlaySplitId: 'missing-synthetic-outlay', amountCents: 701 }],
    },
  );
  expect(result.status).toBe(422);
  expect(
    (
      await call(
        'GET',
        `/contacts/other-contact/settlements/${before.receipts[0].receiptSplitId}/allocations`,
      )
    ).status,
  ).toBe(404);
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
});
