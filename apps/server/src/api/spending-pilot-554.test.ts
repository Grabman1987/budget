import { afterEach, expect, it } from 'vitest';
import {
  createTestDatabase,
  createBooking,
  categories,
  createEntity,
  schema,
  INCOME_TYPES,
  type SpendingReport,
  type BookingPage,
} from '@budget/db';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

const opened = createTestDatabase();
afterEach(() => opened.close());
it('serves stable group net contributions across pages without changing source/audit, and validates group IDs', async () => {
  const db = opened.db;
  seedBasics(db);
  categories.create(
    db,
    { id: 'future', name: 'Synthetic future', groupId: 'g', class: 'future' },
    testCtx,
  );
  createEntity(
    db,
    schema.payee,
    { id: 'refund', name: 'Synthetic refund', defaultCategoryId: 'essen' },
    testCtx,
  );
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: -10001,
      splits: [
        { categoryId: 'essen', amountCents: -8888 },
        { categoryId: 'future', amountCents: -1113 },
      ],
    },
    testCtx,
  );
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-09-03',
      amountCents: 1234,
      payeeId: 'refund',
      splits: [{ amountCents: 1234, incomeTypeId: INCOME_TYPES.refund.id }],
    },
    testCtx,
  );
  const app = createLedgerApi({
    db,
    today: () => '2026-10-02',
    stepUp: async (_c, next) => next(),
  });
  const before = {
    bookings: db.select().from(schema.booking).all(),
    splits: db.select().from(schema.bookingSplit).all(),
    audit: db.select().from(schema.auditLog).all(),
  };
  const analysisResponse = await app.request('/reports/spending/analysis?period=2026-09..2026-09');
  expect(analysisResponse.status).toBe(200);
  const analysis = (await analysisResponse.json()) as SpendingReport;
  expect(analysis.consumptionCents).toBe(7654);
  const url =
    '/bookings?categoryGroupId=g&basis=category-spending&from=2026-09-01&to=2026-09-30&limit=1';
  const response = await app.request(url);
  expect(response.status).toBe(200);
  const first = (await response.json()) as BookingPage;
  expect(first.total).toBe(2);
  expect(first.categorySpendingCents).toBe(7654);
  const second = (await (
    await app.request(`${url}&cursor=${encodeURIComponent(first.nextCursor!)}`)
  ).json()) as BookingPage;
  expect(second.categorySpendingCents).toBe(7654);
  expect(
    [...first.items, ...second.items]
      .map((row) => row.categorySpendingCents)
      .sort((a, b) => a! - b!),
  ).toEqual([-1234, 8888]);
  expect((await app.request('/bookings?categoryGroupId=' + 'x'.repeat(65))).status).toBe(400);
  expect({
    bookings: db.select().from(schema.booking).all(),
    splits: db.select().from(schema.bookingSplit).all(),
    audit: db.select().from(schema.auditLog).all(),
  }).toEqual(before);
});
