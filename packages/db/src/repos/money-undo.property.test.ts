import { canonicalDump, checkProperty, type DumpSource } from '@budget/domain/testing';
import fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { undo } from './audit';
import { createTransfer, deleteBooking, updateBooking } from './bookings';
import {
  ALL_ACCOUNTS,
  bookingInputOf,
  bookingSpecArb,
  createFromSpec,
  dayArb,
  seedWorld,
  worldArb,
  type BookingSpec,
} from './property-world';

type Op =
  | { kind: 'create'; spec: BookingSpec }
  | { kind: 'update'; pick: number; spec: BookingSpec }
  | { kind: 'delete'; pick: number }
  | { kind: 'transfer'; from: number; shift: number; date: string; cents: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant('create' as const), spec: bookingSpecArb }),
  fc.record({
    kind: fc.constant('update' as const),
    pick: fc.nat(1000),
    spec: bookingSpecArb,
  }),
  fc.record({ kind: fc.constant('delete' as const), pick: fc.nat(1000) }),
  fc.record({
    kind: fc.constant('transfer' as const),
    from: fc.nat(2),
    shift: fc.integer({ min: 1, max: 2 }),
    date: dayArb,
    cents: fc.integer({ min: 1, max: 100_000 }),
  }),
);

describe('property: undo', () => {
  it('undoing every group of a random create/update/delete sequence in reverse restores the initial dump', () => {
    checkProperty(
      'undo restores the canonical dump',
      fc.property(
        worldArb,
        fc.array(bookingSpecArb, { maxLength: 4 }),
        fc.array(opArb, { minLength: 1, maxLength: 8 }),
        (world, initial, ops) => {
          const opened = createTestDatabase();
          try {
            const { db, sqlite } = opened;
            seedWorld(db, world);
            const live: string[] = initial.map((spec) => createFromSpec(db, spec));
            const before = liveDump(sqlite);

            const groups: string[] = [];
            const ctx = () => {
              const groupId = randomUUID();
              groups.push(groupId);
              return { actor: 'tester', groupId };
            };
            for (const op of ops) {
              if (op.kind === 'create') {
                live.push(createFromSpec(db, op.spec, ctx()));
              } else if (op.kind === 'transfer') {
                const from = ALL_ACCOUNTS[op.from]!;
                const to = ALL_ACCOUNTS[(op.from + op.shift) % ALL_ACCOUNTS.length]!;
                createTransfer(
                  db,
                  { fromAccountId: from, toAccountId: to, date: op.date, amountCents: op.cents },
                  ctx(),
                );
              } else if (live.length === 0) {
                continue;
              } else if (op.kind === 'update') {
                const id = live[op.pick % live.length]!;
                const input = bookingInputOf(op.spec);
                updateBooking(
                  db,
                  id,
                  {
                    date: input.date,
                    amountCents: input.amountCents,
                    status: input.status,
                    splits: input.splits,
                  },
                  ctx(),
                );
              } else {
                const index = op.pick % live.length;
                deleteBooking(db, live[index]!, ctx());
                live.splice(index, 1);
              }
            }

            for (const groupId of [...groups].reverse()) undo(db, { groupId }, { actor: 'tester' });
            expect(liveDump(sqlite)).toEqual(before);
          } finally {
            opened.close();
          }
        },
      ),
      15,
    );
  });
});

/**
 * The visible data. Undoing a create soft-deletes the booking and, by design, leaves its splits and
 * the structural `transfer` row behind, unreferenced; hidden rows count as absent, the audit log
 * (which only grows) is not data.
 */
function liveDump(sqlite: DumpSource) {
  const live = sqlite
    .prepare('SELECT id, transfer_id FROM booking WHERE deleted_at IS NULL')
    .all() as Array<{ id: string; transfer_id: string | null }>;
  const bookingIds = new Set(live.map((b) => b.id));
  const transferIds = new Set(live.flatMap((b) => (b.transfer_id ? [b.transfer_id] : [])));
  return canonicalDump(sqlite, {
    skipTables: ['audit_log'],
    liveOnly: true,
    keepRow: (table, row) =>
      table === 'booking_split'
        ? bookingIds.has(String(row['booking_id']))
        : table === 'transfer'
          ? transferIds.has(String(row['id']))
          : true,
  });
}
