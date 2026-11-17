import { accountBalances, addDays, balanceSeries as domainBalanceSeries } from '@budget/domain';
import { checkProperty } from '@budget/domain/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { deleteBooking, listBookings } from './bookings';
import { accountSummaries, balanceSeries as sqlBalanceSeries } from './ledger-queries';
import {
  ALL_ACCOUNTS,
  BASE_DAY,
  bookingSpecArb,
  createFromSpec,
  seedWorld,
  worldArb,
} from './property-world';
import { testCtx } from './test-helpers';

describe('property: in-memory balances equal the SQL balances', () => {
  it('agree for random booking sets incl. pending, deleted, future-dated and the opening boundary', () => {
    checkProperty(
      'balance equivalence',
      fc.property(
        worldArb,
        fc.array(fc.record({ spec: bookingSpecArb, deleted: fc.boolean() }), { maxLength: 14 }),
        fc.integer({ min: 0, max: 150 }),
        (world, bookings, asOfDay) => {
          const opened = createTestDatabase();
          try {
            const { db } = opened;
            seedWorld(db, world);
            for (const { spec, deleted } of bookings) {
              const id = createFromSpec(db, spec);
              if (deleted) deleteBooking(db, id, testCtx);
            }
            const accounts = accountSummaries(db, BASE_DAY).map((a) => ({
              id: a.id,
              openingBalanceCents: a.openingBalanceCents,
              openingDate: a.openingDate,
            }));
            const live = listBookings(db).map((b) => ({
              accountId: b.accountId,
              date: b.date,
              amountCents: b.amountCents,
            }));
            const days = [0, 7, asOfDay, 150]
              .sort((a, b) => a - b)
              .map((n) => addDays(BASE_DAY, n));
            // The summary balance at every probed day equals the pure function.
            for (const day of days) {
              const pure = accountBalances(accounts, live, day);
              for (const summary of accountSummaries(db, day)) {
                expect(summary.balanceCents, `${summary.id} on ${day}`).toBe(pure.get(summary.id));
                expect(summary.clearedCents + summary.unclearedCents).toBe(summary.balanceCents);
              }
            }
            // The SQL day-by-day series equals the pure series for each account.
            const series = domainBalanceSeries(accounts, live, days);
            for (const id of ALL_ACCOUNTS) {
              const sql = sqlBalanceSeries(db, id, { from: days[0]!, to: days[days.length - 1]! });
              for (const point of series) {
                const row = sql.find((r) => r.date === point.date);
                expect(row?.balanceCents, `${id} series on ${point.date}`).toBe(
                  point.balances.get(id),
                );
              }
            }
          } finally {
            opened.close();
          }
        },
      ),
      40,
    );
  });
});
