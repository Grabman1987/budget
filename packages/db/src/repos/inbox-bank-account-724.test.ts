import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  accountReconciliation,
  account,
  auditLog,
  bankSyncCandidate,
  booking,
  bookingSplit,
  inboxItem,
} from '../schema';
import { resolveInboxItem, readInbox } from './inbox';
import { undo } from './audit';
import { createBooking } from './bookings';

const A = '72400000-0000-4000-8000-000000000001';
const B = '72400000-0000-4000-8000-000000000002';
const MISSING = '72400000-0000-4000-8000-000000000099';
const DAY = '2026-10-20';
let opened: OpenedDatabase;
let bookedId: string;
beforeEach(() => {
  opened = createTestDatabase();
  for (const id of [A, B])
    opened.db
      .insert(account)
      .values({
        id,
        name: 'Gleiches Konto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-10-01',
        openingBalanceCents: 100_000,
      })
      .run();
  // Existing account-scoped queue fixtures have recent checks, not extra global due work.
  for (const accountId of [A, B])
    opened.db
      .insert(accountReconciliation)
      .values({
        id: `recent-${accountId}`,
        accountId,
        date: DAY,
        statementBalanceCents: 100000,
        clearedBalanceCents: 100000,
      })
      .run();
  bookedId = createBooking(
    opened.db,
    {
      accountId: A,
      date: DAY,
      amountCents: -777,
      status: 'pending',
      splits: [{ amountCents: -777 }],
    },
    { actor: 'synthetic-724' },
  );
  for (const [id, accountId, amountCents, bankStatus, resolvedAt] of [
    ['a-one', A, -1201, 'booked', null],
    ['a-two', A, -2302, 'pending', null],
    ['b-one', B, -9909, 'booked', null],
    ['a-resolved', A, -8808, 'booked', '2026-10-20T09:00:00Z'],
  ] as const) {
    opened.db
      .insert(bankSyncCandidate)
      .values({
        id,
        accountId,
        dedupeKey: id,
        date: DAY,
        amountCents,
        bankStatus,
        currency: 'EUR',
        memo: id,
      })
      .run();
    opened.db
      .insert(inboxItem)
      .values({
        id,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        refType: 'bank-sync-candidate',
        refId: id,
        resolvedAt,
        createdAt: '2026-10-20T08:00:00Z',
      })
      .run();
  }
  for (const [id, refType, refId] of [
    ['orphan', 'bank-sync-candidate', 'missing-candidate'],
    ['wrong-identity', 'bank-sync-candidate', 'a-one'],
    ['other-warning', 'fx', 'USD'],
  ])
    opened.db
      .insert(inboxItem)
      .values({
        id: id!,
        kind: 'import',
        title: 'Andere Prüfung',
        refType,
        refId,
        createdAt: '2026-10-20T08:00:00Z',
      })
      .run();
});
afterEach(() => opened.close());
const state = () => ({
  accounts: opened.db.select().from(account).all(),
  bookings: opened.db.select().from(booking).all(),
  splits: opened.db.select().from(bookingSplit).all(),
  candidates: opened.db.select().from(bankSyncCandidate).all(),
  inbox: opened.db.select().from(inboxItem).all(),
  audit: opened.db.select().from(auditLog).all(),
});
const scoped = (bankAccountId: string) =>
  readInbox(opened.db, DAY, undefined, undefined, { bankAccountId });

it('filters unresolved candidates by real account identity, with no balance, booking or audit write', () => {
  const before = state();
  const first = scoped(A);
  expect(first.count).toBe(2);
  expect(first.entries.map((entry) => entry.id)).toEqual(['a-one', 'a-two']);
  expect(
    first.entries.map((entry) => (entry.type === 'stored' ? entry.bankCandidate : null)),
  ).toEqual([
    {
      date: DAY,
      amountCents: -1201,
      currency: 'EUR',
      memo: 'a-one',
      payeeName: null,
      accountName: 'Gleiches Konto',
    },
    {
      date: DAY,
      amountCents: -2302,
      currency: 'EUR',
      memo: 'a-two',
      payeeName: null,
      accountName: 'Gleiches Konto',
    },
  ]);
  expect(first.readSourceSummaries).toEqual([]);
  expect(scoped(B).entries.map((entry) => entry.id)).toEqual(['b-one']);
  expect(scoped(B).count).toBe(1);
  expect(scoped(MISSING)).toEqual({
    asOf: DAY,
    count: 0,
    entries: [],
    readSourceSummaries: [],
    accountReminders: [],
    unlinkedReceiptCount: 0,
  });
  const global = readInbox(opened.db, DAY);
  expect(global.entries.map((entry) => entry.id)).toEqual([
    `booking:${bookedId}`,
    'a-one',
    'a-two',
    'b-one',
    'orphan',
    'other-warning',
    'wrong-identity',
  ]);
  expect(readInbox(opened.db, DAY, undefined, undefined, {})).toEqual(global);
  expect(state()).toEqual(before);
  expect(before.accounts.map((row) => row.openingBalanceCents)).toEqual([100_000, 100_000]);
  expect(before.bookings).toHaveLength(1);
  expect(before.bookings[0]).toMatchObject({ accountId: A, amountCents: -777, status: 'pending' });
});

it('keeps the existing explicit dismissal and audited Undo path, without booking a candidate', () => {
  const before = state();
  const resolved = resolveInboxItem(opened.db, 'a-one', { actor: 'synthetic-724' });
  expect(scoped(A).entries.map((entry) => entry.id)).toEqual(['a-two']);
  expect(scoped(A).count).toBe(1);
  expect(scoped(B).entries.map((entry) => entry.id)).toEqual(['b-one']);
  undo(opened.db, { groupId: resolved.groupId }, { actor: 'synthetic-724' });
  expect(scoped(A).entries.map((entry) => entry.id)).toEqual(['a-one', 'a-two']);
  expect(state().bookings).toEqual(before.bookings);
  expect(state().splits).toEqual(before.splits);
  expect(state().accounts).toEqual(before.accounts);
  expect(state().candidates).toEqual(before.candidates);
  expect(state().audit.length).toBeGreaterThan(before.audit.length);
});
