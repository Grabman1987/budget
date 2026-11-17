import { lastDayOfMonth } from '@budget/domain';
import { checkProperty } from '@budget/domain/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { assignMany, coverOverspending, moveMoney } from './budget';
import { CategoryRuleError } from './errors';
import {
  BUDGET_ACCOUNTS,
  CATEGORY_IDS,
  WORLD_MONTHS,
  bookingSpecArb,
  createFromSpec,
  seedWorld,
  worldArb,
  type CategoryId,
} from './property-world';
import { budget } from './queries';
import { accountSummaries } from './ledger-queries';
import { testCtx } from './test-helpers';

type Db = OpenedDatabase['db'];
const TODAY = '2026-06-30';

type Op =
  | { kind: 'assign'; month: string; category: CategoryId; cents: number }
  | { kind: 'move'; month: string; from: CategoryId | null; to: CategoryId | null; cents: number }
  | { kind: 'cover'; month: string; category: CategoryId; from: CategoryId | null };

const monthArb = fc.constantFrom(...WORLD_MONTHS);
const envelopeArb = fc.constantFrom<CategoryId | null>(...CATEGORY_IDS, null);
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('assign' as const),
    month: monthArb,
    category: fc.constantFrom(...CATEGORY_IDS),
    cents: fc.integer({ min: 0, max: 150_000 }),
  }),
  fc
    .record({
      kind: fc.constant('move' as const),
      month: monthArb,
      from: envelopeArb,
      to: envelopeArb,
      cents: fc.integer({ min: 1, max: 100_000 }),
    })
    .filter((m) => m.from !== m.to),
  fc.record({
    kind: fc.constant('cover' as const),
    month: monthArb,
    category: fc.constantFrom(...CATEGORY_IDS),
    from: envelopeArb,
  }),
);

const figures = (db: Db, month: string) => {
  const m = budget(db, [month])[0]!;
  return {
    cash: m.cashCents,
    toBeAssigned: m.toBeAssignedCents,
    available: m.availableCents,
    month: m,
  };
};

const assignedOf = (db: Db, month: string, id: CategoryId): number =>
  budget(db, [month])[0]!.envelopes[id]?.assignedCents ?? 0;

/** The SPEC identity of "Zu verteilen" and its independent cash read, for every month. */
function expectIdentity(db: Db): void {
  for (const m of budget(db, WORLD_MONTHS)) {
    expect(m.toBeAssignedCents, `${m.month}: Zu verteilen = cash - available - held - credit`).toBe(
      m.cashCents - m.availableCents - m.heldCents - m.creditOverspentCents,
    );
    const cashFromSql = accountSummaries(db, lastDayOfMonth(m.month))
      .filter((a) => (BUDGET_ACCOUNTS as ReadonlyArray<string>).includes(a.id))
      .reduce((sum, a) => sum + a.balanceCents, 0);
    expect(m.cashCents, `${m.month}: cash equals the SQL balances of the budget accounts`).toBe(
      cashFromSql,
    );
    const envelopes = CATEGORY_IDS.reduce(
      (sum, id) => sum + (m.envelopes[id]?.availableCents ?? 0),
      0,
    );
    expect(m.availableCents, `${m.month}: available = sum of the envelopes`).toBe(envelopes);
  }
}

describe('property: envelope conservation', () => {
  it('keeps cash = assigned/available + to-be-assigned and makes envelope-to-envelope moves neutral', () => {
    checkProperty(
      'envelope conservation',
      fc.property(
        worldArb,
        fc.array(bookingSpecArb, { maxLength: 6 }),
        fc.array(opArb, { minLength: 1, maxLength: 8 }),
        (world, bookings, ops) => {
          const opened = createTestDatabase();
          try {
            const { db } = opened;
            seedWorld(db, world);
            for (const spec of bookings) createFromSpec(db, spec);
            expectIdentity(db);
            for (const op of ops) {
              const before = figures(db, op.month);
              // `delta` is the money that leaves "Zu verteilen" and enters the envelopes.
              let delta = 0;
              if (op.kind === 'assign') {
                const old = assignedOf(db, op.month, op.category);
                assignMany(
                  db,
                  op.month,
                  [{ categoryId: op.category, assignedCents: op.cents }],
                  testCtx,
                );
                delta = op.cents - old;
              } else if (op.kind === 'move') {
                moveMoney(db, op.month, op.from, op.to, op.cents, testCtx);
                delta = (op.from === null ? op.cents : 0) - (op.to === null ? op.cents : 0);
              } else {
                try {
                  const result = coverOverspending(db, op.month, op.category, op.from, testCtx, {
                    today: TODAY,
                  });
                  delta = op.from === null ? result.coveredCents : 0;
                } catch (error) {
                  if (!(error instanceof CategoryRuleError)) throw error;
                  continue; // nothing to cover or nothing to cover it with: the ledger is unchanged
                }
              }
              const after = figures(db, op.month);
              // Moving money between envelopes (delta 0) changes nothing of the month's figures;
              // otherwise exactly `delta` moves between "Zu verteilen" and the envelopes.
              expect(after.cash, 'cash is not touched').toBe(before.cash);
              expect(after.toBeAssigned, 'Zu verteilen').toBe(before.toBeAssigned - delta);
              expect(after.available, 'sum of available').toBe(before.available + delta);
              expectIdentity(db);
            }
          } finally {
            opened.close();
          }
        },
      ),
      30,
    );
  });
});
