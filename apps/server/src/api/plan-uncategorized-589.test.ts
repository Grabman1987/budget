import {
  createBooking,
  createTestDatabase,
  createTransfer,
  ensureAdvanceCategory,
  schema,
} from '@budget/db';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createLedgerApi } from './index';

interface Page {
  total: number;
  nextCursor: string | null;
  items: Array<{ id: string; amountCents: number; date: string; status: string; currency: string }>;
}
let opened: ReturnType<typeof createTestDatabase>;
let api: ReturnType<typeof createLedgerApi>;
const expectedIds = Array.from(
  { length: 51 },
  (_, i) => `eligible-${String(50 - i).padStart(3, '0')}`,
);

beforeEach(() => {
  opened = createTestDatabase();
  const { db } = opened;
  db.insert(schema.account)
    .values([
      {
        id: 'budget',
        name: 'Synthetic budget',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-10-01',
        openingBalanceCents: 100000,
      },
      {
        id: 'budget-two',
        name: 'Synthetic second',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-10-01',
      },
      {
        id: 'tracking',
        name: 'Synthetic tracking',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-10-01',
      },
      {
        id: 'later',
        name: 'Synthetic later opening',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-10-20',
      },
      {
        id: 'deleted-account',
        name: 'Synthetic deleted',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-10-01',
        deletedAt: '2026-10-14',
      },
    ])
    .run();
  db.insert(schema.categoryGroup).values({ id: 'group', name: 'Synthetic group' }).run();
  db.insert(schema.category)
    .values({
      id: 'classified',
      name: 'Synthetic expense',
      groupId: 'group',
      class: 'need',
      kind: 'variable',
      stage: 2,
    })
    .run();
  db.insert(schema.contact).values({ id: 'contact', name: 'Synthetic contact' }).run();
  db.insert(schema.incomeType).values({ id: 'income', name: 'Synthetic income' }).run();
  for (let index = 0; index < 51; index += 1) {
    const id = `eligible-${String(index).padStart(3, '0')}`;
    db.insert(schema.booking)
      .values({
        id,
        accountId: 'budget',
        date: index === 50 ? '2026-10-25' : '2026-10-10',
        amountCents: index === 25 ? -150 : -100,
        status: index % 2 ? 'confirmed' : 'pending',
        memo: `Synthetic ${id}`,
      })
      .run();
    db.insert(schema.bookingSplit)
      .values(
        index === 25
          ? [
              { id: `${id}-known`, bookingId: id, categoryId: 'classified', amountCents: -50 },
              { id: `${id}-unknown`, bookingId: id, amountCents: -100 },
            ]
          : index === 24
            ? [
                { id: `${id}-one`, bookingId: id, amountCents: -50 },
                { id: `${id}-two`, bookingId: id, amountCents: -50 },
              ]
            : [{ id: `${id}-unknown`, bookingId: id, amountCents: -100 }],
      )
      .run();
  }
  const noise = [
    {
      id: 'classified-pending',
      accountId: 'budget',
      date: '2026-10-10',
      amountCents: -100,
      categoryId: 'classified',
    },
    {
      id: 'income',
      accountId: 'budget',
      date: '2026-10-10',
      amountCents: 100,
      incomeTypeId: 'income',
    },
    { id: 'zero', accountId: 'budget', date: '2026-10-10', amountCents: 0 },
    {
      id: 'deleted',
      accountId: 'budget',
      date: '2026-10-10',
      amountCents: -100,
      deletedAt: '2026-10-14',
    },
    { id: 'tracking', accountId: 'tracking', date: '2026-10-10', amountCents: -100 },
    { id: 'old-month', accountId: 'budget', date: '2026-09-30', amountCents: -100 },
    { id: 'pre-opening', accountId: 'later', date: '2026-10-10', amountCents: -100 },
    { id: 'deleted-account', accountId: 'deleted-account', date: '2026-10-10', amountCents: -100 },
  ];
  for (const row of noise) {
    db.insert(schema.booking)
      .values({
        id: `noise-${row.id}`,
        accountId: row.accountId,
        date: row.date,
        amountCents: row.amountCents,
        status: 'pending',
        deletedAt: row.deletedAt ?? null,
      })
      .run();
    db.insert(schema.bookingSplit)
      .values({
        id: `noise-${row.id}-split`,
        bookingId: `noise-${row.id}`,
        amountCents: row.amountCents,
        categoryId: row.categoryId ?? null,
        incomeTypeId: row.incomeTypeId ?? null,
      })
      .run();
  }
  createBooking(
    db,
    {
      accountId: 'budget',
      date: '2026-10-10',
      amountCents: -100,
      status: 'pending',
      splits: [
        {
          categoryId: ensureAdvanceCategory(db, { actor: 'test' }),
          contactId: 'contact',
          amountCents: -100,
        },
      ],
    },
    { actor: 'test' },
  );
  createTransfer(
    db,
    {
      fromAccountId: 'budget',
      toAccountId: 'budget-two',
      date: '2026-10-10',
      amountCents: 100,
      status: 'pending',
    },
    { actor: 'test' },
  );
  createBooking(
    db,
    {
      accountId: 'budget',
      date: '2026-10-10',
      amountCents: -150,
      status: 'pending',
      splits: [
        { categoryId: 'classified', amountCents: -50 },
        { transferAccountId: 'budget-two', amountCents: -100 },
      ],
    },
    { actor: 'test' },
  );
  api = createLedgerApi({ db, today: () => '2026-10-15', stepUp: async (_c, next) => next() });
});
afterEach(() => opened.close());

const state = () => ({
  accounts: opened.db.select().from(schema.account).all(),
  bookings: opened.db.select().from(schema.booking).all(),
  splits: opened.db.select().from(schema.bookingSplit).all(),
  audit: opened.db.select().from(schema.auditLog).all(),
});
async function page(path = '/budget/2026-10/uncategorized'): Promise<Page> {
  const response = await api.request(path);
  const body: unknown = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return body as Page;
}

it('shares exact51 distinct booking IDs with the summary and pages50+1 in stable order without any write', async () => {
  const before = state();
  const summary = await api.request('/budget/2026-10');
  expect(summary.status).toBe(200);
  expect(await summary.json()).toMatchObject({ summary: { uncategorizedCount: 51 } });
  const first = await page();
  expect(first.total).toBe(51);
  expect(first.items).toHaveLength(50);
  expect(first.items[0]).toMatchObject({
    id: 'eligible-050',
    date: '2026-10-25',
    status: 'pending',
    amountCents: -100,
  });
  expect(first.items.find((row) => row.id === 'eligible-025')).toMatchObject({
    amountCents: -150,
    currency: 'EUR',
  });
  expect(first.items.filter((row) => row.id === 'eligible-024')).toHaveLength(1);
  expect(typeof first.nextCursor).toBe('string');
  const second = await page(
    `/budget/2026-10/uncategorized?cursor=${encodeURIComponent(first.nextCursor!)}`,
  );
  expect(second.total).toBe(51);
  expect(second.items.map((row) => row.id)).toEqual(['eligible-000']);
  expect(second.nextCursor).toBeNull();
  const ids = [...first.items, ...second.items].map((row) => row.id);
  expect(ids).toEqual(expectedIds);
  expect(new Set(ids).size).toBe(51);
  expect(ids.some((id) => id.startsWith('noise-'))).toBe(false);
  expect(state()).toEqual(before);
});

it('refuses malformed, cross-month and changed-database cursors without mutating financial or audit state', async () => {
  const first = await page();
  const before = state();
  for (const suffix of [
    '?cursor=not-json',
    '?cursor=',
    '?limit=0',
    '?limit=51',
    '?limit=not-a-number',
  ]) {
    const response = await api.request(`/budget/2026-10/uncategorized${suffix}`);
    expect(response.status, suffix).toBe(suffix === '?cursor=not-json' ? 422 : 400);
  }
  const crossMonth = await api.request(
    `/budget/2026-11/uncategorized?cursor=${encodeURIComponent(first.nextCursor!)}`,
  );
  expect(crossMonth.status).toBe(409);
  expect(await crossMonth.json()).toMatchObject({ error: 'uncategorized_changed' });
  expect(state()).toEqual(before);
  createBooking(
    opened.db,
    {
      accountId: 'budget',
      date: '2026-10-11',
      amountCents: -1,
      status: 'pending',
      splits: [{ amountCents: -1 }],
    },
    { actor: 'test' },
  );
  const afterFixtureWrite = state();
  const stale = await api.request(
    `/budget/2026-10/uncategorized?cursor=${encodeURIComponent(first.nextCursor!)}`,
  );
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ error: 'uncategorized_changed' });
  expect(state()).toEqual(afterFixtureWrite);
});

it('returns an honest empty selected month and validates the bounded smaller page size', async () => {
  const before = state();
  expect(await page('/budget/2026-11/uncategorized')).toEqual({
    items: [],
    total: 0,
    nextCursor: null,
  });
  const small = await page('/budget/2026-10/uncategorized?limit=1');
  expect(small.total).toBe(51);
  expect(small.items.map((row) => row.id)).toEqual(['eligible-050']);
  expect(typeof small.nextCursor).toBe('string');
  expect(state()).toEqual(before);
});
