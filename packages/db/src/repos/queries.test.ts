import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { accounts } from './entities';
import { createBooking, createTransfer, deleteBooking } from './bookings';
import { accountBalances, activityByCategoryMonth, bookingCountByAccount } from './queries';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db); // giro opens with 1.000,00 on 2023-10-01, spar and usd with 0
});
afterEach(() => opened.close());

const book = (
  accountId: string,
  date: string,
  amountCents: number,
  categoryId: string | null = 'essen',
) =>
  createBooking(db, { accountId, date, amountCents, splits: [{ categoryId, amountCents }] }, ctx);

describe('accountBalances', () => {
  it('is opening balance plus bookings up to the as-of date, per account in sort order', () => {
    book('giro', '2026-01-05', -1_200);
    book('giro', '2026-02-05', 50_000, null);
    book('spar', '2026-01-06', 700);
    expect(accountBalances(db)).toEqual([
      { accountId: 'giro', balanceCents: 100_000 - 1_200 + 50_000 },
      { accountId: 'spar', balanceCents: 700 },
      { accountId: 'usd', balanceCents: 0 },
    ]);
    expect(
      accountBalances(db, '2026-01-31').find((a) => a.accountId === 'giro')?.balanceCents,
    ).toBe(98_800);
    expect(
      accountBalances(db, '2026-01-05').find((a) => a.accountId === 'giro')?.balanceCents,
    ).toBe(98_800);
    expect(
      accountBalances(db, '2026-01-04').find((a) => a.accountId === 'giro')?.balanceCents,
    ).toBe(100_000);
  });

  it('ignores deleted bookings and deleted accounts, includes both transfer legs', () => {
    const b = book('giro', '2026-01-05', -1_200);
    deleteBooking(db, b, ctx);
    createTransfer(
      db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-01-10', amountCents: 5_000 },
      ctx,
    );
    accounts.softDelete(db, 'usd', ctx);
    expect(accountBalances(db)).toEqual([
      { accountId: 'giro', balanceCents: 95_000 },
      { accountId: 'spar', balanceCents: 5_000 },
    ]);
  });

  it('counts the opening balance only from its opening date on', () => {
    expect(
      accountBalances(db, '2023-09-30').find((a) => a.accountId === 'giro')?.balanceCents,
    ).toBe(0);
    expect(
      accountBalances(db, '2023-10-01').find((a) => a.accountId === 'giro')?.balanceCents,
    ).toBe(100_000);
  });
});

describe('activityByCategoryMonth', () => {
  it('sums split amounts by category and booking month (signed), split-aware', () => {
    book('giro', '2026-01-05', -1_000);
    book('giro', '2026-01-25', -500);
    book('giro', '2026-02-01', -300, 'reise');
    book('giro', '2026-01-31', 200_000, null);
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-02-10',
        amountCents: -1_000,
        splits: [
          { categoryId: 'essen', amountCents: -600 },
          { categoryId: 'reise', amountCents: -400 },
        ],
      },
      ctx,
    );
    expect(activityByCategoryMonth(db)).toEqual([
      { categoryId: null, month: '2026-01', cents: 200_000 },
      { categoryId: 'essen', month: '2026-01', cents: -1_500 },
      { categoryId: 'essen', month: '2026-02', cents: -600 },
      { categoryId: 'reise', month: '2026-02', cents: -700 },
    ]);
  });

  it('skips deleted bookings and counts transfer legs only with a category (outflow leg)', () => {
    const b = book('giro', '2026-01-05', -1_000);
    deleteBooking(db, b, ctx);
    createTransfer(
      db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-01-10', amountCents: 5_000 },
      ctx,
    );
    expect(activityByCategoryMonth(db)).toEqual([]); // an uncategorized transfer is neutral
    createTransfer(
      db,
      {
        fromAccountId: 'giro',
        toAccountId: 'spar',
        date: '2026-01-11',
        amountCents: 2_000,
        categoryId: 'reise',
      },
      ctx,
    );
    expect(activityByCategoryMonth(db)).toEqual([
      { categoryId: 'reise', month: '2026-01', cents: -2_000 },
    ]);
  });
});

describe('bookingCountByAccount', () => {
  it('counts live bookings per account', () => {
    book('giro', '2026-01-05', -1);
    const gone = book('giro', '2026-01-06', -1);
    book('spar', '2026-01-06', -1);
    deleteBooking(db, gone, ctx);
    expect(bookingCountByAccount(db)).toEqual([
      { accountId: 'giro', count: 1 },
      { accountId: 'spar', count: 1 },
    ]);
  });
});
