import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { payee, category, bookingSplit, INCOME_TYPES } from '../schema';
import { eq } from 'drizzle-orm';
import { createEntity } from './entities';
import { createBooking, createTransfer } from './bookings';
import { queryBookings } from './ledger-queries';
import { reportTables } from './report-tables';
import { seedBasics, testCtx } from './test-helpers';

const opened = createTestDatabase();
afterEach(() => opened.close());

it('drills into classified category contributions, including split and inferred refunds, across pages', () => {
  const db = opened.db;
  seedBasics(db);
  createEntity(
    db,
    payee,
    { id: 'refund-payee', name: 'Testerstattung', defaultCategoryId: 'essen' },
    testCtx,
  );
  const book = (
    amountCents: number,
    splits: Parameters<typeof createBooking>[1]['splits'],
    extra = {},
  ) =>
    createBooking(
      db,
      { accountId: 'giro', date: '2026-03-10', amountCents, splits, ...extra },
      testCtx,
    );
  const expense = book(-12345, [
    { categoryId: 'essen', amountCents: -10001 },
    { categoryId: 'miete', amountCents: -2344 },
  ]);
  const refund = book(1234, [{ amountCents: 1234, incomeTypeId: INCOME_TYPES.refund.id }], {
    payeeId: 'refund-payee',
  });
  book(-555, [{ categoryId: 'essen', amountCents: -555 }], { accountId: 'usd', currency: 'USD' });
  book(-777, [{ categoryId: 'essen', amountCents: -777 }], { date: '2026-04-01' });
  createTransfer(
    db,
    { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-03-10', amountCents: 999 },
    testCtx,
  );
  createEntity(
    db,
    category,
    { id: 'saving', name: 'Testzukunft', groupId: 'g', class: 'future' },
    testCtx,
  );
  const saving = createTransfer(
    db,
    { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-03-11', amountCents: 2468 },
    testCtx,
  );
  // Stored legacy category on the budget leg: the existing table reports count Zukunft set-aside.
  db.update(bookingSplit)
    .set({ categoryId: 'saving' })
    .where(eq(bookingSplit.bookingId, saving.fromBookingId))
    .run();
  const futureQuery = queryBookings(db, {
    categoryId: 'saving',
    basis: 'category-spending',
    from: '2026-03-01',
    to: '2026-03-31',
  });
  expect(futureQuery.categorySpendingCents).toBe(2468);
  expect(
    reportTables(db, { today: '2026-04-15' }).months.find((m) => m.month === '2026-03')?.spending[
      'saving'
    ],
  ).toBe(2468);
  const query = {
    categoryId: 'essen',
    basis: 'category-spending' as const,
    from: '2026-03-01',
    to: '2026-03-31',
    limit: 1,
  };
  const first = queryBookings(db, query);
  expect(first.total).toBe(2);
  expect(first.categorySpendingCents).toBe(8767);
  const second = queryBookings(db, { ...query, cursor: first.nextCursor! });
  expect(second.categorySpendingCents).toBe(8767);
  expect([...first.items, ...second.items].map((b) => b.id).sort()).toEqual(
    [expense, refund].sort(),
  );
  expect(
    [...first.items, ...second.items].map((b) => b.categorySpendingCents).sort((a, b) => a! - b!),
  ).toEqual([-1234, 10001]);
  expect(
    reportTables(db, { today: '2026-04-15' }).months.find((m) => m.month === '2026-03')?.spending[
      'essen'
    ],
  ).toBe(8767);
  expect(queryBookings(db, { categoryId: 'essen', from: query.from, to: query.to }).total).toBe(2);
  book(-888, [{ categoryId: 'essen', amountCents: -888 }], { date: '2026-03-20' });
  expect(queryBookings(db, query, '2026-03-15').categorySpendingCents).toBe(8767);
});
