import { afterEach, beforeEach, expect, it } from 'vitest';
import { fxRate } from '../schema';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { createBooking, createTransfer } from './bookings';
import { queryBookings } from './ledger-queries';
import { seedBasics, testCtx } from './test-helpers';

const TODAY = '2026-11-08';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const book = (date: string, amountCents: number, categoryId = 'essen') =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents,
      status: 'confirmed',
      splits: [{ categoryId, amountCents }],
    },
    testCtx,
  );

it('transfer-in month: net change including the transfer equals the balance delta', () => {
  book('2026-09-02', -700);
  createTransfer(
    opened.db,
    { fromAccountId: 'spar', toAccountId: 'giro', date: '2026-10-04', amountCents: 5000 },
    testCtx,
  );
  book('2026-10-09', -250);
  const page = queryBookings(opened.db, { accountId: 'giro' }, TODAY);
  const [oct, sep] = page.monthlyTotals ?? [];
  expect(page.monthlyKind).toBe('balance');
  expect(oct).toMatchObject({ month: '2026-10', count: 2, cents: 4750 });
  expect(sep).toMatchObject({ month: '2026-09', cents: -700 });
  expect((oct?.cumulativeCents ?? 0) - (sep?.cumulativeCents ?? 0)).toBe(oct?.cents);
  // Month-end balance is the running balance of the last booking in that month.
  const last = page.items.find((b) => b.date === '2026-10-09');
  expect(oct?.cumulativeCents).toBe(last?.balanceAfterCents);
});

it('category filter: outflow negative, no balance, labelled filtered', () => {
  book('2026-10-02', -300);
  book('2026-10-03', 120);
  book('2026-10-04', -999, 'reise');
  const page = queryBookings(opened.db, { categoryId: 'essen' }, TODAY);
  expect(page.monthlyKind).toBe('filtered');
  expect(page.monthlyTotals).toEqual([
    { month: '2026-10', count: 2, cents: -180, cumulativeCents: null },
  ]);
});

it('hidden upcoming bookings are excluded and the cutoff is today, not the newest booking', () => {
  book('2026-11-08', -100);
  book('2026-11-09', -5000);
  book('2027-01-01', -7000);
  const page = queryBookings(opened.db, { accountId: 'giro' }, TODAY);
  expect(page.monthlyTotals).toEqual([
    { month: '2026-11', count: 1, cents: -100, cumulativeCents: 99_900 },
  ]);
  expect(queryBookings(opened.db, {}, TODAY).monthlyKind).toBe('rows');
});

it('non-EUR: converts each booking on its own so the month equals sumEurCents', () => {
  opened.db
    .insert(fxRate)
    .values([{ date: '2026-10-05', currency: 'USD', rateMicro: 500_000 }])
    .run();
  for (const amountCents of [3, 3, 3]) {
    createBooking(
      opened.db,
      {
        accountId: 'usd',
        date: '2026-10-05',
        amountCents,
        status: 'confirmed',
        splits: [{ categoryId: 'essen', amountCents }],
      },
      testCtx,
    );
  }
  const page = queryBookings(opened.db, { accountId: 'usd' }, TODAY);
  const [oct] = page.monthlyTotals ?? [];
  expect(page.sumEurCents).not.toBeNull();
  expect(oct?.cents).toBe(page.sumEurCents);
  expect(oct?.count).toBe(3);
});

it('bookings before the opening month are flagged "vor Start", not counted as a zero month', () => {
  book('2023-08-15', -100);
  book('2023-10-02', -250);
  const page = queryBookings(opened.db, { accountId: 'giro' }, TODAY);
  const months = page.monthlyTotals ?? [];
  expect(months.find((m) => m.month === '2023-08')).toMatchObject({
    count: 1,
    beforeStart: true,
    cumulativeCents: null,
  });
  expect(months.find((m) => m.month === '2023-10')).toMatchObject({ count: 1, cents: -250 });
  expect(months.find((m) => m.month === '2023-10')?.beforeStart).toBeUndefined();
});
