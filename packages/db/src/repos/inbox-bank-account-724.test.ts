import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  accountReconciliation,
  account,
  auditLog,
  bankSyncCandidate,
  booking,
  bookingSplit,
  category,
  categoryGroup,
  inboxItem,
} from '../schema';
import { prepareInboxBankSuggestions, resolveInboxItem, readInbox } from './inbox';
import { undo } from './audit';
import { createBooking } from './bookings';
import { saveAssignmentRule } from './assignment-rules';
import { mergeBankCandidate } from './bank-followups';

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
        resolution: resolvedAt ? 'Vom Nutzer als erledigt markiert' : null,
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
const globalProgress = () => readInbox(opened.db, DAY).bankProgress;

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
  expect(globalProgress()).toEqual({ reviewed: 2, total: 4 });
  expect(scoped(A).entries.map((entry) => entry.id)).toEqual(['a-two']);
  expect(scoped(A).count).toBe(1);
  expect(scoped(B).entries.map((entry) => entry.id)).toEqual(['b-one']);
  undo(opened.db, { groupId: resolved.groupId }, { actor: 'synthetic-724' });
  expect(globalProgress()).toEqual({ reviewed: 1, total: 4 });
  expect(scoped(A).entries.map((entry) => entry.id)).toEqual(['a-one', 'a-two']);
  expect(state().bookings).toEqual(before.bookings);
  expect(state().splits).toEqual(before.splits);
  expect(state().accounts).toEqual(before.accounts);
  expect(state().candidates).toEqual(before.candidates);
  expect(state().audit.length).toBeGreaterThan(before.audit.length);
});

it('returns a prepared merge in the list and marks competing matches for review without writing', () => {
  const first = createBooking(
    opened.db,
    {
      accountId: A,
      date: DAY,
      amountCents: -1201,
      status: 'confirmed',
      splits: [{ amountCents: -1201 }],
    },
    { actor: 'synthetic-562' },
  );
  const before = state();
  const suggested = prepareInboxBankSuggestions(opened.db, scoped(A).entries).find(
    (entry) => entry.id === 'a-one',
  );
  expect(suggested?.type === 'stored' && suggested.bankCandidate?.suggestion).toEqual({
    label: `Mit Buchung ${DAY} zusammenführen`,
    needsReview: false,
  });
  expect(state()).toEqual(before);

  const second = createBooking(
    opened.db,
    {
      accountId: A,
      date: DAY,
      amountCents: -1201,
      status: 'confirmed',
      splits: [{ amountCents: -1201 }],
    },
    { actor: 'synthetic-562' },
  );
  expect(second).not.toBe(first);
  const withCompetingMatch = state();
  const ambiguous = prepareInboxBankSuggestions(opened.db, scoped(A).entries).find(
    (entry) => entry.id === 'a-one',
  );
  expect(ambiguous?.type === 'stored' && ambiguous.bankCandidate?.suggestion).toEqual({
    label: 'Vorschlag prüfen · mehrere mögliche Buchungen',
    needsReview: true,
  });
  expect(state()).toEqual(withCompetingMatch);
});

it('counts the canonical booking task regardless of status and excludes foreign-currency tasks', () => {
  opened.db.insert(categoryGroup).values({ id: 'group-562', name: 'Synthetic group' }).run();
  opened.db
    .insert(category)
    .values({ id: 'category-562', name: 'Synthetic category', groupId: 'group-562', class: 'need' })
    .run();
  const posted = createBooking(
    opened.db,
    {
      accountId: A,
      date: DAY,
      amountCents: -4404,
      source: 'bank',
      importKey: 'bank-sync:auto-posted',
      status: 'pending',
      splits: [{ amountCents: -4404 }],
    },
    { actor: 'synthetic-562' },
  );
  const confirmedUnclassified = createBooking(
    opened.db,
    {
      accountId: A,
      date: DAY,
      amountCents: -5505,
      source: 'bank',
      importKey: 'bank-sync:confirmed-unclassified',
      status: 'confirmed',
      splits: [{ amountCents: -5505 }],
    },
    { actor: 'synthetic-562' },
  );
  const pendingCategorized = createBooking(
    opened.db,
    {
      accountId: A,
      date: DAY,
      amountCents: -6606,
      source: 'bank',
      importKey: 'bank-sync:pending-categorized',
      status: 'pending',
      splits: [{ amountCents: -6606, categoryId: 'category-562' }],
    },
    { actor: 'synthetic-562' },
  );
  for (const [id, currency, refType, resolution] of [
    [
      'auto-posted',
      'EUR',
      'bank-sync-candidate',
      `Als ungeprüfte Buchung angelegt, bitte prüfen: ${posted}`,
    ],
    [
      'confirmed-unclassified',
      'EUR',
      'bank-sync-candidate',
      `Als ungeprüfte Buchung angelegt, bitte prüfen: ${confirmedUnclassified}`,
    ],
    [
      'pending-categorized',
      'EUR',
      'bank-sync-candidate',
      `Als ungeprüfte Buchung angelegt, bitte prüfen: ${pendingCategorized}`,
    ],
    ['foreign', 'USD', 'bank-sync', null],
  ] as const) {
    opened.db
      .insert(bankSyncCandidate)
      .values({
        id,
        accountId: A,
        dedupeKey: id,
        date: DAY,
        amountCents: -4404,
        currency,
        memo: id,
      })
      .run();
    opened.db
      .insert(inboxItem)
      .values({
        id,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        refType,
        refId: refType === 'bank-sync' ? A : id,
        resolvedAt: resolution ? '2026-10-20T10:00:00Z' : null,
        resolution,
      })
      .run();
  }
  const before = state();
  expect(globalProgress()).toEqual({ reviewed: 2, total: 7 });
  expect(state()).toEqual(before);
});

it('counts a direct link to a classified existing booking, then restores progress on Undo', () => {
  opened.db.insert(categoryGroup).values({ id: 'group-562', name: 'Synthetic group' }).run();
  opened.db
    .insert(category)
    .values({ id: 'category-562', name: 'Synthetic category', groupId: 'group-562', class: 'need' })
    .run();
  const target = createBooking(
    opened.db,
    {
      accountId: A,
      date: DAY,
      amountCents: -1201,
      status: 'confirmed',
      splits: [{ amountCents: -1201, categoryId: 'category-562' }],
    },
    { actor: 'synthetic-562' },
  );
  opened.db
    .update(booking)
    .set({ source: 'migration', importKey: 'ynab:synthetic-562' })
    .where(eq(booking.id, target))
    .run();
  expect(globalProgress()).toEqual({ reviewed: 1, total: 4 });
  const linked = mergeBankCandidate(
    opened.db,
    'a-one',
    target,
    { actor: 'synthetic-562' },
    DAY + 'T10:00:00Z',
  );
  expect(globalProgress()).toEqual({ reviewed: 2, total: 4 });
  undo(opened.db, { groupId: linked.groupId }, { actor: 'synthetic-562' });
  expect(globalProgress()).toEqual({ reviewed: 1, total: 4 });
});

it('labels one transfer distinctly and a manual rule as requiring selection in the dialog', () => {
  createBooking(
    opened.db,
    {
      accountId: B,
      date: DAY,
      amountCents: 1201,
      status: 'confirmed',
      splits: [{ amountCents: 1201 }],
    },
    { actor: 'synthetic-562' },
  );
  saveAssignmentRule(
    opened.db,
    null,
    {
      name: 'Manuelle Regel',
      enabled: true,
      automatic: false,
      match: { mode: 'all', conditions: [{ type: 'contains', text: 'a-two' }] },
      actions: { memo: 'Manuell zu prüfen' },
    },
    { actor: 'synthetic-562' },
  );
  const before = state();
  const entries = prepareInboxBankSuggestions(opened.db, scoped(A).entries);
  const one = entries.find((entry) => entry.id === 'a-one');
  const two = entries.find((entry) => entry.id === 'a-two');
  expect(one?.type === 'stored' && one.bankCandidate?.suggestion).toEqual({
    label: `Gegenbuchung ${DAY} · Umbuchung prüfen`,
    needsReview: true,
  });
  expect(two?.type === 'stored' && two.bankCandidate?.suggestion).toEqual({
    label: 'Regelvorschlag prüfen: Manuelle Regel',
    needsReview: true,
  });
  expect(state()).toEqual(before);
});
