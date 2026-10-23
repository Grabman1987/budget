import { createBooking, createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createLedgerApi } from './index';

const A = '72400000-0000-4000-8000-000000000001';
const B = '72400000-0000-4000-8000-000000000002';
const MISSING = '72400000-0000-4000-8000-000000000099';
const DAY = '2026-10-20';
let opened: OpenedDatabase;
let bookedId: string;
let app: ReturnType<typeof createLedgerApi>;
beforeEach(() => {
  opened = createTestDatabase();
  app = createLedgerApi({ db: opened.db, today: () => DAY, stepUp: async (_c, next) => next() });
  for (const id of [A, B])
    opened.db
      .insert(schema.account)
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
      .insert(schema.accountReconciliation)
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
  for (const [id, accountId, date, amountCents, resolvedAt] of [
    ['a-one', A, '2026-10-18', -1201, null],
    ['a-two', A, '2026-10-20', -2302, null],
    ['b-one', B, '2026-10-19', -9909, null],
    ['a-resolved', A, '2026-10-20', -8808, '2026-10-20T09:00:00Z'],
  ] as const) {
    opened.db
      .insert(schema.bankSyncCandidate)
      .values({
        id,
        accountId,
        dedupeKey: id,
        date,
        amountCents,
        currency: 'EUR',
        memo: id,
      })
      .run();
    opened.db
      .insert(schema.inboxItem)
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
  opened.db
    .insert(schema.inboxItem)
    .values({
      id: 'orphan',
      kind: 'import',
      title: 'Bankumsatz prüfen',
      refType: 'bank-sync-candidate',
      refId: 'missing-candidate',
      createdAt: '2026-10-20T08:00:00Z',
    })
    .run();
});
afterEach(() => opened.close());
type Page = {
  count: number;
  totalEntries: number;
  next: number | null;
  countsByKind: Record<string, number>;
  segments: { umsaetze: number; aufgaben: number };
  readSourceSummaries: unknown[];
  entries: { id: string }[];
};
const get = async (query: string) => {
  const response = await app.request('/inbox' + query);
  expect(response.status).toBe(200);
  return (await response.json()) as Page;
};

it('counts and paginates only the chosen account before slicing, even with equal account names', async () => {
  const before = opened.sqlite.serialize();
  const query = `?bankAccountId=${A}&segment=umsaetze&dateSort=newest&limit=1`;
  const first = await get(query);
  expect(first).toMatchObject({
    count: 2,
    totalEntries: 2,
    next: 1,
    countsByKind: { import: 2 },
    segments: { umsaetze: 2, aufgaben: 0 },
    readSourceSummaries: [],
  });
  expect(first.entries.map((entry) => entry.id)).toEqual(['a-two']);
  const second = await get(query + '&offset=1');
  expect(second.entries.map((entry) => entry.id)).toEqual(['a-one']);
  expect(second.next).toBeNull();
  expect((await get(`?bankAccountId=${B}&limit=1`)).entries.map((entry) => entry.id)).toEqual([
    'b-one',
  ]);
  expect(await get(`?bankAccountId=${MISSING}&limit=1`)).toMatchObject({
    count: 0,
    totalEntries: 0,
    entries: [],
    next: null,
  });
  expect(
    (await get(`?bankAccountId=${A}&fromDate=2026-10-20&limit=1`)).entries.map((entry) => entry.id),
  ).toEqual(['a-two']);
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});

it('rejects malformed account UUIDs and leaves the absent-filter response and database unchanged', async () => {
  const before = opened.sqlite.serialize();
  for (const value of [
    'Gleiches Konto',
    'not-a-uuid',
    '',
    '72400000-0000-4000-8000-00000000000z',
  ]) {
    const response = await app.request('/inbox?bankAccountId=' + encodeURIComponent(value));
    expect(response.status).toBe(400);
  }
  const first = await get('?limit=100');
  expect(first.count).toBe(5);
  expect(first.entries.map((entry) => entry.id)).toEqual([
    `booking:${bookedId}`,
    'a-one',
    'a-two',
    'b-one',
    'orphan',
  ]);
  expect(await get('?limit=100')).toEqual(first);
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});
