import { afterEach, expect, it, vi } from 'vitest';
import { createTestDatabase, accounts, categories, createEntity, schema } from '@budget/db';
import { startPlanSnapshotTimer } from './plan-snapshots';

afterEach(() => vi.useRealTimers());
it('captures nightly on the Vienna 15th independently of provider setup and retries a failed transaction', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T00:25:00Z'));
  const opened = createTestDatabase();
  const ctx = { actor: 'tester' };
  accounts.create(
    opened.db,
    {
      id: 'cash',
      name: 'Synthetic cash',
      type: 'cash',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-10-01',
    },
    ctx,
  );
  createEntity(opened.db, schema.categoryGroup, { id: 'group', name: 'Synthetic group' }, ctx);
  categories.create(
    opened.db,
    { id: 'food', name: 'Synthetic food', class: 'need', groupId: 'group' },
    ctx,
  );
  opened.db
    .insert(schema.envelopeMonth)
    .values({ categoryId: 'food', month: '2026-10', assignedCents: 20_000 })
    .run();
  opened.sqlite.exec(
    "CREATE TRIGGER fail_snapshot BEFORE INSERT ON plan_snapshot BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
  );
  const stop = startPlanSnapshotTimer(opened.db, () => {});
  expect(opened.db.select().from(schema.planSnapshot).all()).toHaveLength(0);
  vi.advanceTimersByTime(5 * 60_000);
  expect(opened.db.select().from(schema.planSnapshot).all()).toHaveLength(0);
  opened.sqlite.exec('DROP TRIGGER fail_snapshot');
  vi.advanceTimersByTime(5 * 60_000);
  expect(opened.db.select().from(schema.planSnapshot).all()).toHaveLength(2);
  vi.advanceTimersByTime(30 * 60_000);
  expect(opened.db.select().from(schema.planSnapshot).all()).toHaveLength(2);
  stop();
  opened.close();
});

function seed() {
  const opened = createTestDatabase();
  const ctx = { actor: 'tester' };
  accounts.create(
    opened.db,
    {
      id: 'cash',
      name: 'Synthetic cash',
      type: 'cash',
      role: 'budget',
      onBudget: true,
      openingDate: '2023-10-01',
    },
    ctx,
  );
  return opened;
}

it('only auto-backfills the previous two months', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T00:25:00Z'));
  const opened = seed();
  const stop = startPlanSnapshotTimer(opened.db, () => {});
  vi.advanceTimersByTime(5 * 60_000);
  stop();
  const months = new Set(
    opened.db
      .select()
      .from(schema.planSnapshotGap)
      .all()
      .map((g) => g.month),
  );
  // Inputs are newer than every old 15th, so each visited past month is a gap: only two.
  expect([...months].sort()).toEqual(['2026-08', '2026-09']);
  opened.close();
});

it('reports a repeatedly failing day once to the inbox and keeps other months going', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T00:25:00Z'));
  const opened = seed();
  let reports = 0;
  opened.sqlite.exec(
    "CREATE TRIGGER fail_gap BEFORE INSERT ON plan_snapshot_gap WHEN NEW.month = '2026-08' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
  );
  // 2026-08 and 2026-09 are unreconstructible (inputs changed after their 15th); 2026-08 fails.
  const stop = startPlanSnapshotTimer(opened.db, () => reports++);
  vi.advanceTimersByTime(60 * 60_000);
  expect(
    opened.db
      .select()
      .from(schema.planSnapshotGap)
      .all()
      .map((g) => g.month),
  ).toContain('2026-09');
  expect(reports).toBe(1);
  stop();
  opened.close();
});
