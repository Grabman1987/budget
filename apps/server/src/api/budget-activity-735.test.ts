import {
  createBooking,
  createTestDatabase,
  openDatabase,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createLedgerApi } from './index';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
const MONTH = '2026-10';
const ctx = { actor: 'synthetic-735' };
beforeEach(() => {
  opened = createTestDatabase();
  opened.db
    .insert(schema.account)
    .values({
      id: 'activity-account',
      name: 'Synthetic budget',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-10-01',
      openingBalanceCents: 100_000,
    })
    .run();
  opened.db
    .insert(schema.categoryGroup)
    .values({ id: 'activity-group', name: 'Synthetic group' })
    .run();
  for (const id of ['activity-category', 'other-category'])
    opened.db
      .insert(schema.category)
      .values({ id, name: id, groupId: 'activity-group', class: 'need', kind: 'variable' })
      .run();
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-15',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());
type Detail = {
  summary: { envelopes: { categoryId: string; activityCents: number }[] };
  activityBreakdown: {
    totalCents: number;
    count: number;
    pageCents: number;
    nextCursor: string | null;
    items: {
      bookingId: string | null;
      splitId: string | null;
      contributionCents: number;
      source: { memo: string | null; accountName: string; bookingAmountCents: number } | null;
    }[];
  };
};
const detailPath = `/budget/${MONTH}/activity/activity-category`;

it('explains the exact existing signed category activity with real split origins and no writes', async () => {
  const purchase = createBooking(
    opened.db,
    {
      accountId: 'activity-account',
      date: '2026-10-20',
      status: 'pending',
      amountCents: -12_345,
      memo: 'Synthetic shared purchase',
      splits: [
        { categoryId: 'activity-category', amountCents: -10_001 },
        { categoryId: 'other-category', amountCents: -2_344 },
      ],
    },
    ctx,
  );
  const refund = createBooking(
    opened.db,
    {
      accountId: 'activity-account',
      date: '2026-10-21',
      status: 'confirmed',
      amountCents: 1_234,
      splits: [{ categoryId: 'activity-category', amountCents: 1_234 }],
    },
    ctx,
  );
  const ordinary = await app.request(`/budget/${MONTH}`);
  expect(ordinary.status).toBe(200);
  const view = (await ordinary.json()) as {
    summary: { envelopes: { categoryId: string; activityCents: number }[] };
  };
  expect(
    view.summary.envelopes.find((r) => r.categoryId === 'activity-category')?.activityCents,
  ).toBe(-8_767);
  const changes = opened.sqlite.prepare('select total_changes() as n').get();
  const before = opened.sqlite.serialize();
  const response = await app.request(`/budget/${MONTH}/activity/activity-category`);
  expect(response.status).toBe(200);
  const detail = (await response.json()) as Detail;
  expect(detail.activityBreakdown.totalCents).toBe(-8_767);
  expect(detail.activityBreakdown.items.map((r) => [r.bookingId, r.contributionCents])).toEqual([
    [purchase, -10_001],
    [refund, 1_234],
  ]);
  expect(detail.activityBreakdown.items[0]!.source).toMatchObject({
    memo: 'Synthetic shared purchase',
    accountName: 'Synthetic budget',
    bookingAmountCents: -12_345,
  });
  expect(detail.activityBreakdown.items.every((r) => Boolean(r.splitId))).toBe(true);
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
  expect(opened.sqlite.prepare('select total_changes() as n').get()).toEqual(changes);
});

it('pages full exact totals, rejects a real write-stale continuation and bounds cursor input', async () => {
  for (const [index, amountCents] of [-100, 30, -5].entries())
    createBooking(
      opened.db,
      {
        accountId: 'activity-account',
        date: `2026-10-${20 + index}`,
        amountCents,
        splits: [{ categoryId: 'activity-category', amountCents }],
      },
      ctx,
    );
  const changes = opened.sqlite.prepare('select total_changes() as n').get();
  const before = opened.sqlite.serialize();
  const first = (await (await app.request(`${detailPath}?limit=2`)).json()) as Detail;
  expect(first.activityBreakdown.totalCents).toBe(-75);
  expect(first.activityBreakdown.count).toBe(3);
  expect(first.activityBreakdown.pageCents).toBe(-70);
  expect(first.activityBreakdown.nextCursor).toBeTruthy();
  const cursor = encodeURIComponent(first.activityBreakdown.nextCursor!);
  const last = (await (
    await app.request(`${detailPath}?limit=2&cursor=${cursor}`)
  ).json()) as Detail;
  expect(last.activityBreakdown.totalCents).toBe(-75);
  expect(last.activityBreakdown.pageCents).toBe(-5);
  expect(last.activityBreakdown.nextCursor).toBeNull();
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
  expect(opened.sqlite.prepare('select total_changes() as n').get()).toEqual(changes);
  createBooking(
    opened.db,
    {
      accountId: 'activity-account',
      date: '2026-10-23',
      amountCents: -1,
      splits: [{ categoryId: 'activity-category', amountCents: -1 }],
    },
    ctx,
  );
  expect((await app.request(`${detailPath}?cursor=${cursor}`)).status).toBe(409);
  expect((await app.request(`${detailPath}?cursor=${'x'.repeat(1025)}`)).status).toBe(400);
  expect((await app.request(`${detailPath}?limit=51`)).status).toBe(400);
});
it('preserves the ordinary response shape and distinguishes empty from net zero', async () => {
  const ordinaryBefore = await (await app.request(`/budget/${MONTH}`)).json();
  const empty = (await (await app.request(detailPath)).json()) as Detail;
  expect(empty.activityBreakdown.items).toEqual([]);
  expect(empty.activityBreakdown.totalCents).toBe(0);
  expect(await (await app.request(`/budget/${MONTH}`)).json()).toEqual(ordinaryBefore);
  expect(ordinaryBefore).not.toHaveProperty('activityBreakdown');
  for (const amountCents of [-500, 500])
    createBooking(
      opened.db,
      {
        accountId: 'activity-account',
        date: '2026-10-20',
        amountCents,
        memo: '',
        splits: [{ categoryId: 'activity-category', amountCents }],
      },
      ctx,
    );
  const zero = (await (await app.request(detailPath)).json()) as Detail;
  expect(zero.activityBreakdown.totalCents).toBe(0);
  expect(zero.activityBreakdown.items).toHaveLength(2);
  expect(zero.activityBreakdown.items.every((item) => item.source?.memo === '')).toBe(true);
  expect((await app.request(`/budget/${MONTH}/activity/missing`)).status).toBe(404);
});
it('opens a future origin through the existing ID read without a today clamp or writes', async () => {
  const id = createBooking(
    opened.db,
    {
      accountId: 'activity-account',
      date: '2026-10-31',
      amountCents: -123,
      splits: [{ categoryId: 'activity-category', amountCents: -123 }],
    },
    ctx,
  );
  const changes = opened.sqlite.prepare('select total_changes() as n').get();
  const before = opened.sqlite.serialize();
  const response = await app.request(`/bookings/${id}`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { booking: { id: string; date: string } };
  expect(body.booking.id).toBe(id);
  expect(body.booking.date).toBe('2026-10-31');
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
  expect(opened.sqlite.prepare('select total_changes() as n').get()).toEqual(changes);
});

it('refuses an old continuation after closing the connection and an external file-backed write', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'budget-activity-735-'));
  const file = join(directory, 'synthetic.sqlite');
  for (const amountCents of [-100, -200])
    createBooking(
      opened.db,
      {
        accountId: 'activity-account',
        date: '2026-10-20',
        amountCents,
        memo: '',
        splits: [{ categoryId: 'activity-category', amountCents }],
      },
      ctx,
    );
  writeFileSync(file, opened.sqlite.serialize());
  opened.close();
  opened = openDatabase(file);
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-15',
    stepUp: async (_c, next) => next(),
  });
  try {
    const first = (await (await app.request(`${detailPath}?limit=1`)).json()) as Detail;
    expect(first.activityBreakdown.nextCursor).toBeTruthy();
    opened.close();
    const writer = openDatabase(file);
    try {
      createBooking(
        writer.db,
        {
          accountId: 'activity-account',
          date: '2026-10-21',
          amountCents: -300,
          splits: [{ categoryId: 'activity-category', amountCents: -300 }],
        },
        ctx,
      );
    } finally {
      writer.close();
    }
    opened = openDatabase(file);
    app = createLedgerApi({
      db: opened.db,
      today: () => '2026-10-15',
      stepUp: async (_c, next) => next(),
    });
    expect(
      (
        await app.request(
          `${detailPath}?cursor=${encodeURIComponent(first.activityBreakdown.nextCursor!)}`,
        )
      ).status,
    ).toBe(409);
  } finally {
    opened.close();
    opened = createTestDatabase();
    rmSync(directory, { recursive: true, force: true });
  }
});
