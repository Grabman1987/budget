import { accountBalances, addDays, netWorthSeries } from '@budget/domain';
import { checkProperty } from '@budget/domain/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { bookingSplit } from '../schema';
import { createBooking, createTransfer, listBookings, updateBooking } from './bookings';
import { accountSummaries } from './ledger-queries';
import {
  ALL_ACCOUNTS,
  BASE_DAY,
  CATEGORY_IDS,
  WORLD_MONTHS,
  bookingInputOf,
  bookingSpecArb,
  createFromSpec,
  dayArb,
  seedWorld,
  worldArb,
  type AccountId,
  type WorldSpec,
} from './property-world';
import { budget } from './queries';
import { testCtx } from './test-helpers';

type Db = OpenedDatabase['db'];

const PROBE_DAYS = [0, 30, 60, 90, 120, 150].map((n) => addDays(BASE_DAY, n));

/** Net worth of the ledger accounts (no investments in this world) at each probe day. */
function netWorthAt(db: Db): number[] {
  const summaries = accountSummaries(db, BASE_DAY).map((a) => ({
    id: a.id,
    openingBalanceCents: a.openingBalanceCents,
    openingDate: a.openingDate,
  }));
  const live = listBookings(db).map((b) => ({
    accountId: b.accountId,
    date: b.date,
    amountCents: b.amountCents,
  }));
  return netWorthSeries({
    dates: PROBE_DAYS,
    balancesAt: (date) => accountBalances(summaries, live, date),
    investmentValueAt: () => 0,
  }).map((p) => p.netWorthCents);
}

/** Σ of the SQL balances over all accounts at each probe day. */
const balanceSumAt = (db: Db): number[] =>
  PROBE_DAYS.map((day) => accountSummaries(db, day).reduce((sum, a) => sum + a.balanceCents, 0));

/** Activity per category and month of the budget read model. */
function activityByCategory(db: Db): Record<string, number> {
  const out: Record<string, number> = {};
  for (const month of budget(db, WORLD_MONTHS))
    for (const id of CATEGORY_IDS)
      out[`${month.month}/${id}`] = month.envelopes[id]?.activityCents ?? 0;
  return out;
}

const openingDay = (world: WorldSpec, id: AccountId): string =>
  addDays(BASE_DAY, world.openings[id].day);
const laterOf = (...days: string[]): string => days.reduce((a, b) => (a > b ? a : b));

const transferArb = fc
  .record({
    from: fc.constantFrom(...ALL_ACCOUNTS),
    to: fc.constantFrom(...ALL_ACCOUNTS),
    date: dayArb,
    amountCents: fc.integer({ min: 1, max: 100_000 }),
    status: fc.constantFrom('pending', 'confirmed'),
  })
  .filter((t) => t.from !== t.to);

describe('property: internal transfers between own accounts', () => {
  it('never change net worth, the sum of balances or any category activity', () => {
    checkProperty(
      'transfers are neutral',
      fc.property(
        worldArb,
        fc.array(bookingSpecArb, { maxLength: 6 }),
        fc.array(transferArb, { minLength: 1, maxLength: 5 }),
        (world, bookings, transfers) => {
          const opened = createTestDatabase();
          try {
            const { db } = opened;
            seedWorld(db, world);
            for (const spec of bookings) createFromSpec(db, spec);
            const before = {
              netWorth: netWorthAt(db),
              sums: balanceSumAt(db),
              activity: activityByCategory(db),
              cash: budget(db, WORLD_MONTHS).map((m) => [m.cashCents, m.toBeAssignedCents]),
            };
            const budgetOnly = transfers.every((t) => t.from !== 'depot' && t.to !== 'depot');
            for (const t of transfers)
              createTransfer(
                db,
                {
                  fromAccountId: t.from,
                  toAccountId: t.to,
                  // A leg dated before its account's opening date belongs to the opening balance
                  // (C5), so a transfer is neutral from the later opening date on; see the it.fails
                  // case below for the straddling dates.
                  date: laterOf(t.date, openingDay(world, t.from), openingDay(world, t.to)),
                  amountCents: t.amountCents,
                  status: t.status,
                },
                testCtx,
              );
            expect(netWorthAt(db), 'net worth').toEqual(before.netWorth);
            expect(balanceSumAt(db), 'sum of balances').toEqual(before.sums);
            expect(activityByCategory(db), 'category activity').toEqual(before.activity);
            if (budgetOnly) {
              // Between two budget accounts the cash that can be assigned does not move either.
              expect(
                budget(db, WORLD_MONTHS).map((m) => [m.cashCents, m.toBeAssignedCents]),
              ).toEqual(before.cash);
            }
          } finally {
            opened.close();
          }
        },
      ),
      15,
    );
  });
});

describe('known boundary: a transfer straddling an opening date', () => {
  // Shrunk counterexample of the unrestricted property (seed 20261117): giro opens 2026-01-01,
  // spar opens 2025-12-31, a transfer of 1 cent giro -> spar on 2025-12-31. The giro leg predates
  // giro's opening date and is folded into its opening balance (C5), the spar leg is counted, so
  // net worth rises by 1 cent from that day. Whether createTransfer should refuse such dates is an
  // open product question; the invariant "transfers never change net worth" fails here.
  it.fails('keeps net worth unchanged', () => {
    const opened = createTestDatabase();
    try {
      const { db } = opened;
      const zero = { balanceCents: 0 };
      seedWorld(db, {
        openings: {
          giro: { ...zero, day: 12 },
          spar: { ...zero, day: 11 },
          depot: { ...zero, day: 11 },
        },
      });
      const before = netWorthAt(db);
      createTransfer(
        db,
        { fromAccountId: 'giro', toAccountId: 'spar', date: '2025-12-31', amountCents: 1 },
        testCtx,
      );
      expect(netWorthAt(db)).toEqual(before);
    } finally {
      opened.close();
    }
  });
});

describe('property: split bookings', () => {
  it('always store splits that sum to the booking amount; a wrong sum is refused without a trace', () => {
    checkProperty(
      'splits sum to the booking amount',
      fc.property(
        worldArb,
        bookingSpecArb,
        fc.array(bookingSpecArb, { maxLength: 3 }),
        fc.integer({ min: 1, max: 10_000 }),
        (world, spec, others, skew) => {
          const opened = createTestDatabase();
          try {
            const { db } = opened;
            seedWorld(db, world);
            const id = createFromSpec(db, spec);
            const splitSum = (bookingId: string) =>
              db
                .select()
                .from(bookingSplit)
                .all()
                .filter((s) => s.bookingId === bookingId)
                .reduce((sum, s) => sum + s.amountCents, 0);
            const stored = listBookings(db).find((b) => b.id === id)!;
            expect(splitSum(id)).toBe(stored.amountCents);
            expect(stored.amountCents).toBe(bookingInputOf(spec).amountCents);

            // Re-splitting through update keeps the invariant for any other partition of the amount.
            const next = others[0];
            if (next) {
              const input = bookingInputOf({ ...next, account: spec.account, sign: spec.sign });
              updateBooking(
                db,
                id,
                { amountCents: input.amountCents, splits: input.splits },
                testCtx,
              );
              expect(splitSum(id)).toBe(input.amountCents);
            }

            // A partition that does not add up is rejected and leaves nothing behind.
            const rows = db.select().from(bookingSplit).all().length;
            const bad = bookingInputOf(spec);
            const wrong = { ...bad, amountCents: bad.amountCents + skew };
            expect(() => createBooking(db, wrong, testCtx)).toThrow();
            expect(db.select().from(bookingSplit).all()).toHaveLength(rows);
            expect(listBookings(db)).toHaveLength(1);
          } finally {
            opened.close();
          }
        },
      ),
      20,
    );
  });

  it('keeps both legs of a transfer balanced and each leg split equal to its amount', () => {
    checkProperty(
      'transfer legs',
      fc.property(worldArb, transferArb, (world, t) => {
        const opened = createTestDatabase();
        try {
          const { db } = opened;
          seedWorld(db, world);
          const result = createTransfer(
            db,
            {
              fromAccountId: t.from as AccountId,
              toAccountId: t.to as AccountId,
              date: t.date,
              amountCents: t.amountCents,
              status: t.status,
            },
            testCtx,
          );
          const legs = listBookings(db).filter((b) => b.transferId === result.transferId);
          expect(legs).toHaveLength(2);
          expect(legs.reduce((sum, leg) => sum + leg.amountCents, 0)).toBe(0);
          for (const leg of legs)
            expect(leg.splits.reduce((sum, s) => sum + s.amountCents, 0)).toBe(leg.amountCents);
        } finally {
          opened.close();
        }
      }),
      25,
    );
  });
});
