import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  auditLog,
  planSnapshotGap,
  category,
  categoryTarget,
  envelopeMonth,
  expectedPayment,
  expectedPaymentVersion,
  planSnapshot,
} from '../schema';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking } from './bookings';
import { loadFacts } from './rule-inputs';
import { occurrencesBetween, paceOfMonth } from './heute';
import { capturePlanSnapshot, planningAccuracyReport } from './planning-accuracy';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  opened.db.update(category).set({ kind: 'fixed' }).where(eq(category.id, 'miete')).run();
  opened.db
    .insert(categoryTarget)
    .values({
      id: 'rent-target',
      categoryId: 'miete',
      kind: 'monthly',
      amountCents: 10_000,
      validFrom: '2026-01',
      dueDay: 20,
    })
    .run();
  opened.db
    .insert(envelopeMonth)
    .values({ categoryId: 'essen', month: '2026-09', assignedCents: 30_000 })
    .run();
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-10',
      amountCents: -15_000,
      splits: [{ categoryId: 'essen', amountCents: -15_000 }],
    },
    testCtx,
  );
});
afterEach(() => opened.close());

it('captures the existing Pace to the cent, per category and total, once; later edits cannot rewrite it', () => {
  expect(capturePlanSnapshot(opened.db, '2026-09', '2026-09-15').status).toBe('captured');
  const facts = loadFacts(opened.db, '2026-09-30');
  const source = paceOfMonth(
    facts,
    '2026-09',
    '2026-09-15',
    occurrencesBetween(
      opened.db,
      facts,
      '2026-09-01',
      '2026-09-30',
      '2026-09-15',
      facts.budgetByMonth.get('2026-09'),
    ),
  );
  const rows = opened.db.select().from(planSnapshot).all();
  expect(rows.find((r) => r.categoryId === null)).toMatchObject({
    plannedCents: 40_000,
    spentCents: 15_000,
    projectedCents: 40_000,
  });
  expect(rows.find((r) => r.categoryId === null)?.projectedCents).toBe(
    source.figures.forecastEndCents,
  );
  expect(rows.find((r) => r.categoryId === 'essen')).toMatchObject({
    plannedCents: 30_000,
    spentCents: 15_000,
    projectedCents: 30_000,
  });
  expect(rows.find((r) => r.categoryId === 'miete')?.projectedCents).toBe(10_000);
  opened.db.update(envelopeMonth).set({ assignedCents: 99_999 }).run();
  expect(capturePlanSnapshot(opened.db, '2026-09', '2026-10-06').status).toBe('exists');
  expect(opened.db.select().from(planSnapshot).all()).toEqual(rows);
});

it('refuses speculative historical reconstruction, but backfills unchanged dated inputs', () => {
  expect(capturePlanSnapshot(opened.db, '2026-09', '2026-09-14').status).toBe('not_due');
  expect(capturePlanSnapshot(opened.db, '2026-09', '2026-10-06').status).toBe(
    'unavailable_history',
  );
  // The dead month is persisted and not re-evaluated until an operator clears the marker.
  expect(
    opened.db
      .select()
      .from(planSnapshotGap)
      .all()
      .map((g) => g.month),
  ).toEqual(['2026-09']);
  opened.db.delete(planSnapshotGap).run();
  for (const table of [
    'account',
    'category',
    'category_target',
    'envelope_month',
    'booking',
    'payee',
    'income_type',
  ])
    opened.db.run(
      sql.raw(
        `UPDATE ${table} SET created_at = '2026-09-01T00:00:00.000Z', updated_at = '2026-09-01T00:00:00.000Z'`,
      ),
    );
  opened.db.run(sql`UPDATE audit_log SET ts = '2026-09-01T00:00:00.000Z'`);
  opened.db
    .insert(auditLog)
    .values({
      id: 'later-undo',
      entityType: 'envelope_month',
      entityId: 'essen:2026-09',
      action: 'undo',
      ts: '2026-09-20T00:00:00.000Z',
    })
    .run();
  expect(capturePlanSnapshot(opened.db, '2026-09', '2026-10-06').status).toBe(
    'unavailable_history',
  );
  opened.db.delete(planSnapshotGap).run();
  opened.db
    .update(auditLog)
    .set({ ts: '2026-09-01T00:00:00.000Z' })
    .where(eq(auditLog.id, 'later-undo'))
    .run();
  expect(capturePlanSnapshot(opened.db, '2026-09', '2026-10-06').status).toBe('captured');
  // With ordinary sources stable, non-versioned FX still prevents a reconstruction.
  opened.db
    .insert(expectedPayment)
    .values({
      id: 'foreign',
      name: 'Synthetic foreign contract',
      startDate: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    .run();
  opened.db
    .insert(expectedPaymentVersion)
    .values({
      id: 'foreign-version',
      expectedPaymentId: 'foreign',
      validFrom: '2026-01-01',
      amountCents: 1000,
      currency: 'USD',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    .run();
  expect(capturePlanSnapshot(opened.db, '2026-10', '2026-11-06').status).toBe(
    'unavailable_history',
  );
});

it('compares only closed months and retains category identity after archival', () => {
  capturePlanSnapshot(opened.db, '2026-09', '2026-09-15');
  expect(planningAccuracyReport(opened.db, '2026-09', '2026-09-30').months).toHaveLength(0);
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-20',
      amountCents: -10_000,
      splits: [{ categoryId: 'miete', amountCents: -10_000 }],
    },
    testCtx,
  );
  opened.db
    .update(category)
    .set({ hiddenAt: '2026-10-01T00:00:00.000Z' })
    .where(eq(category.id, 'essen'))
    .run();
  const r = planningAccuracyReport(opened.db, '2026-09', '2026-10-01');
  expect(r.months[0]).toMatchObject({
    projectedCents: 40_000,
    actualCents: 25_000,
    deviationCents: 15_000,
    deviationBp: 6000,
    hit: false,
  });
  expect(r.categories[0]).toMatchObject({
    categoryId: 'essen',
    actualCents: 15_000,
    deviationCents: 15_000,
  });
});

it('enforces one NULL total in SQLite and rolls back the whole snapshot on failure', () => {
  opened.sqlite.exec(
    "CREATE TRIGGER reject_snapshot BEFORE INSERT ON plan_snapshot WHEN NEW.category_id = 'essen' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
  );
  expect(() => capturePlanSnapshot(opened.db, '2026-09', '2026-09-15')).toThrow(
    'synthetic failure',
  );
  expect(opened.db.select().from(planSnapshot).all()).toHaveLength(0);
  opened.sqlite.exec('DROP TRIGGER reject_snapshot');
  capturePlanSnapshot(opened.db, '2026-09', '2026-09-15');
  expect(() =>
    opened.db
      .insert(planSnapshot)
      .values({
        id: 'duplicate',
        month: '2026-09',
        day: 15,
        categoryId: null,
        plannedCents: 0,
        spentCents: 0,
        projectedCents: 0,
      })
      .run(),
  ).toThrow();
});
