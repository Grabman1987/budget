import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { category } from './budget';
import { cents, id, isoMonth, nowSql } from './common';

/** Immutable observations, not budget assignments. NULL category is the shared Pace total. */
export const planSnapshot = sqliteTable(
  'plan_snapshot',
  {
    id: id(),
    month: text('month').notNull(),
    day: integer('day').notNull(),
    categoryId: text('category_id').references(() => category.id),
    plannedCents: cents('planned_cents').notNull(),
    spentCents: cents('spent_cents').notNull(),
    projectedCents: cents('projected_cents').notNull(),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [
    isoMonth('plan_snapshot_month_chk', t.month),
    check('plan_snapshot_day_chk', sql`${t.day} = 15`),
    check(
      'plan_snapshot_money_chk',
      sql`typeof(${t.plannedCents}) = 'integer' AND typeof(${t.spentCents}) = 'integer' AND typeof(${t.projectedCents}) = 'integer'`,
    ),
    uniqueIndex('plan_snapshot_category_uq').on(t.month, t.day, t.categoryId),
    uniqueIndex('plan_snapshot_total_uq')
      .on(t.month, t.day)
      .where(sql`${t.categoryId} IS NULL`),
  ],
);

/** Months whose day-15 inputs are provably unrecoverable; never retried by the nightly backfill. */
export const planSnapshotGap = sqliteTable('plan_snapshot_gap', {
  month: text('month').primaryKey(),
  reason: text('reason').notNull(),
  createdAt: text('created_at').notNull().default(nowSql),
});
