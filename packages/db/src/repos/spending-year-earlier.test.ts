import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { account } from '../schema';
import { createBooking } from './bookings';
import { spendingReport } from './spending-report';
import { seedBasics, testCtx } from './test-helpers';
import { eq } from 'drizzle-orm';

const opened = createTestDatabase();
afterEach(() => opened.close());

it('falls back 29 February to 28 February and reports the real previous window length', () => {
  const db = opened.db;
  seedBasics(db);
  db.update(account).set({ openingDate: '2022-01-01' }).where(eq(account.id, 'giro')).run();
  const book = (date: string, amount: number) =>
    createBooking(
      db,
      {
        accountId: 'giro',
        date,
        amountCents: -amount,
        splits: [{ categoryId: 'miete', amountCents: -amount }],
      },
      testCtx,
    );
  book('2023-02-01', 100);
  book('2023-02-28', 200);
  book('2023-03-01', 99999);
  book('2024-02-29', 50);
  const data = spendingReport(db, '2024-02-29', '2024-02..2024-02', 'previous-year');
  const c = data.answerComparison;
  expect(c.from).toBe('2024-02-01');
  expect(c.to).toBe('2024-02-29');
  expect(c.days).toBe(29);
  expect(c.previousFrom).toBe('2023-02-01');
  expect(c.previousTo).toBe('2023-02-28');
  // The previous window is one day shorter; its real length comes from its own bounds.
  const length =
    (Date.parse(c.previousTo as string) - Date.parse(c.previousFrom as string)) / 86_400_000 + 1;
  expect(length).toBe(28);
  expect(c.previousCents).toBe(300);
});
