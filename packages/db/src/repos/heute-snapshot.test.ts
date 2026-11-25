import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { createBooking } from './bookings';
import { createExpectedPayment } from './expected';
import { heute } from './heute';
import { runInReadSnapshot, snapshotStatementStats } from './request-memo';
import { seedBasics, testCtx } from './test-helpers';
import { runWithValuationNotes } from './valuation-notes';

let opened: OpenedDatabase;
const today = '2026-10-14';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  const db = opened.db;
  for (const [date, cents] of [
    ['2026-08-05', -4500],
    ['2026-09-05', -5200],
    ['2026-09-20', -1300],
    ['2026-10-02', -2500],
    ['2026-10-08', -900],
    ['2026-10-20', -1500],
  ] as const)
    createBooking(
      db,
      {
        accountId: 'giro',
        date,
        amountCents: cents,
        splits: [{ categoryId: 'miete', amountCents: cents }],
      },
      testCtx,
    );
  createExpectedPayment(
    db,
    {
      id: 'rent',
      name: 'Synthetic rent',
      accountId: 'giro',
      categoryId: 'miete',
      kind: 'outflow',
      rhythm: 'monthly',
      startDate: '2026-01-01',
      dueDay: 28,
      dateWindowDays: 3,
    },
    { validFrom: '2026-01-01', amountCents: 60_000 },
    testCtx,
    today,
  );
});
afterEach(() => opened.close());

/** Heute as the read-model worker runs it: one request scope, one read snapshot. */
const inSnapshot = (period: 'payday' | 'month') =>
  runWithValuationNotes(() =>
    runInReadSnapshot(opened.db, async () => heute(opened.db, { today, period })),
  );

it.each(['payday', 'month'] as const)(
  'Heute (%s) reads each ledger input once per snapshot and answers as without it',
  async (period) => {
    const plain = heute(opened.db, { today, period });
    opened.sqlite.pragma('query_only = ON');
    const snapshot = await inSnapshot(period);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(JSON.parse(JSON.stringify(plain)));
    // Ceiling for the statements that reach SQLite in one cold Heute (the snapshot's statement
    // cache and the request memo answer every repeat). A change that loads the ledger again, or
    // reads per account / per day in a loop, goes past it: raise it only with a reason.
    expect(snapshotStatementStats.executed).toBeLessThanOrEqual(CEILING);
    expect(snapshotStatementStats.reused).toBeGreaterThan(0);
  },
);

/** Measured 141 on this fixture (a cold Heute used ~750 statements before the snapshot cache). */
const CEILING = 160;
