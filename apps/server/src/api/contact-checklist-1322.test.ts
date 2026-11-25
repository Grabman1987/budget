/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect real JSON boundary results. */
import { createTestDatabase, createExpectedPayment, schema, type OpenedDatabase } from '@budget/db';
import { eq, isNull } from 'drizzle-orm';
import type { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened: OpenedDatabase;
let app: Hono;
const today = '2026-09-17';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  app = createLedgerApi({ db: opened.db, today: () => today, stepUp: async (_c, next) => next() });
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
const cash = () =>
  opened.db
    .select()
    .from(schema.booking)
    .where(isNull(schema.booking.deletedAt))
    .all()
    .reduce((sum, b) => sum + b.amountCents, 0);

function seed() {
  createExpectedPayment(
    opened.db,
    {
      name: 'Share',
      kind: 'inflow',
      accountId: 'giro',
      contactId: 'k1',
      categoryId: 'miete',
      dueDay: 3,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    },
    { validFrom: '2026-09-01', amountCents: 80000 },
    testCtx,
    today,
  );
}

it('lists the open items and books one receipt that Undo reverts', async () => {
  seed();
  const list = await call('GET', '/contacts/k1/checklist?asOf=2026-09-10');
  expect(list.status).toBe(200);
  expect(list.body.contributions.map((c: any) => c.amountCents)).toEqual([80000]);
  expect(list.body.outlays).toEqual([]);
  const before = cash();
  const saved = await call('POST', '/contacts/k1/checklist-receipts', {
    accountId: 'giro',
    date: '2026-09-10',
    amountCents: 81500,
    outlaySplitIds: [],
    occurrenceIds: [list.body.contributions[0].occurrenceId],
    surplus: 'credit',
  });
  expect(saved.status).toBe(201);
  expect(saved.body.restCents).toBe(1500);
  expect(cash()).toBe(before + 81500);
  expect((await call('GET', '/contacts/k1')).body.creditCents).toBe(1500);
  expect((await call('POST', '/undo', { groupId: saved.body.groupId })).status).toBe(200);
  expect(cash()).toBe(before);
  expect((await call('GET', '/contacts/k1')).body.creditCents).toBe(0);
});

it('rejects a future date and unknown fields', async () => {
  const base = {
    accountId: 'giro',
    amountCents: 100,
    outlaySplitIds: [],
    occurrenceIds: [],
  };
  expect(
    (await call('POST', '/contacts/k1/checklist-receipts', { ...base, date: '2026-09-18' })).status,
  ).toBe(422);
  expect(
    (await call('POST', '/contacts/k1/checklist-receipts', { ...base, date: today, extra: 1 }))
      .status,
  ).toBe(400);
});

it('refuses unknown ids, a closed account and several contributions', async () => {
  seed();
  const list = (await call('GET', '/contacts/k1/checklist?asOf=2026-09-10')).body;
  const id = list.contributions[0].occurrenceId;
  const base = { accountId: 'giro', date: '2026-09-10', amountCents: 80000 };
  const post = (body: object) => call('POST', '/contacts/k1/checklist-receipts', body);
  const before = cash();
  expect((await post({ ...base, outlaySplitIds: ['foreign'], occurrenceIds: [] })).status).toBe(
    422,
  );
  expect((await post({ ...base, outlaySplitIds: [], occurrenceIds: ['foreign'] })).status).toBe(
    422,
  );
  expect((await post({ ...base, outlaySplitIds: [], occurrenceIds: [id, id] })).status).toBe(422);
  expect(
    (await post({ ...base, accountId: 'unknown', outlaySplitIds: [], occurrenceIds: [id] })).status,
  ).toBe(422);
  opened.db
    .update(schema.account)
    .set({ closedAt: '2026-09-01T00:00:00.000Z' })
    .where(eq(schema.account.id, 'giro'))
    .run();
  expect((await post({ ...base, outlaySplitIds: [], occurrenceIds: [id] })).status).toBe(422);
  expect(cash()).toBe(before);
});
