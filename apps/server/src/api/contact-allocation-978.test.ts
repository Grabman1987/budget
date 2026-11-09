/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect real JSON boundary results. */
import {
  createTestDatabase,
  createBooking,
  getBooking,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { eq } from 'drizzle-orm';
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

it('adopts legacy provenance explicitly and then reopens the settled outlay into credit', async () => {
  await purchase('auslagen', '2026-09-01');
  const paid = await receipt();
  opened.db
    .delete(schema.appSetting)
    .where(eq(schema.appSetting.id, `contacts.credit.${paid.body.bookingId}`))
    .run();
  const before = await statement();
  const url = `/contacts/k1/settlements/${before.receipts[0].receiptSplitId}`;
  const bytes = opened.sqlite.serialize();
  const preview = await call('GET', `${url}/allocations`);
  expect(preview.body.requiresAdoption).toBe(true);
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  expect((await call('POST', `${url}/allocations`, { allocations: [] })).status).toBe(422);
  expect((await call('POST', `${url}/adopt`, {})).status).toBe(200);
  const changed = await call('POST', `${url}/allocations`, { allocations: [] });
  expect(changed.status).toBe(200);
  expect((await statement()).outlays[0].remainingCents).toBe(1001);
  expect((await statement()).creditCents).toBe(701);
  expect((await call('POST', '/undo', { groupId: changed.body.groupId })).status).toBe(200);
  expect((await statement()).outlays[0].remainingCents).toBe(300);
});

it('reallocates an inferred receipt without allocation rows through the owner API', async () => {
  await purchase('auslagen', '2026-09-01');
  const id = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 701,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: 701 }],
    },
    { actor: 'synthetic-test' },
  );
  const original = getBooking(opened.db, id)!;
  expect((await statement()).receipts[0].recorded).toBe(false);
  const result = await call(
    'POST',
    `/contacts/k1/settlements/${original.splits[0]!.id}/allocations`,
    { allocations: [] },
  );
  expect(result.status).toBe(200);
  expect((await statement()).outlays[0].remainingCents).toBe(1001);
  expect((await statement()).creditCents).toBe(701);
  expect(getBooking(opened.db, id)).toEqual(original);
});

it('requires confirmation for locked allocation-only changes and waives exact cents with Undo', async () => {
  const bought = await purchase('essen', '2026-09-01');
  await receipt();
  const before = await statement();
  const outlay = before.outlays[0];
  const receiptId = before.receipts[0].receiptSplitId;
  expect(
    (
      await call('POST', '/accounts/giro/reconciliation', {
        date: '2026-09-01',
        statementBalanceCents: 98999,
      })
    ).status,
  ).toBe(201);
  const original = getBooking(opened.db, bought.body.id)!;
  const url = `/contacts/k1/settlements/${receiptId}/allocations`;
  expect((await call('GET', url)).body.locked).toBe(true);
  expect((await call('POST', url, { allocations: [] })).status).toBe(409);
  expect((await call('POST', url, { allocations: [], unlock: true })).status).toBe(200);
  const waiveUrl = `/contacts/k1/outlays/${outlay.splitId}/waive`;
  expect((await call('POST', waiveUrl, { amountCents: 501 })).status).toBe(409);
  const waived = await call('POST', waiveUrl, { amountCents: 501, unlock: true });
  expect(waived.status).toBe(201);
  expect((await statement()).outlays[0].remainingCents).toBe(500);
  expect(getBooking(opened.db, bought.body.id)).toEqual(original);
  expect((await call('POST', '/undo', { groupId: waived.body.groupId })).status).toBe(200);
  expect((await statement()).outlays[0].remainingCents).toBe(1001);
});

it.each([
  { amountCents: 1.5 },
  { amountCents: -1 },
  { amountCents: 1, unlock: 'yes' },
  { amountCents: 1, accountId: 'another-synthetic-account' },
])('rejects malformed waiver requests before writes: %j', async (body) => {
  await purchase('essen', '2026-09-01');
  const before = await statement();
  const bytes = opened.sqlite.serialize();
  expect(
    (await call('POST', `/contacts/k1/outlays/${before.outlays[0].splitId}/waive`, body)).status,
  ).toBe(400);
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
});
