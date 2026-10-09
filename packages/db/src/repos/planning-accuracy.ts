import { randomUUID } from 'node:crypto';
import {
  addMonths,
  forecastAccuracy,
  forecastAccuracySummary,
  lastDayOfMonth,
  monthOf,
  todayInVienna,
} from '@budget/domain';
import { and, eq, getTableColumns, getTableName, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  account,
  auditLog,
  booking,
  bookingSplit,
  budgetMonth,
  category,
  categoryTarget,
  envelopeMonth,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentVersion,
  incomeType,
  payee,
  planSnapshot,
  planSnapshotGap,
} from '../schema';
import { insertTracked } from './audit';
import { occurrencesBetween, paceOfMonth } from './heute';
import { loadFacts, type RuleFacts } from './rule-inputs';
import { runInTransaction, type Executor } from './types';

// Conservative backfill: there is no complete historical version of all Pace inputs. Refuse a
// reconstruction if any input (including removed rows or restored timestamps) changed later.
// Only one aggregate query per table and column; no row is loaded.
const sources = [
  account,
  category,
  categoryTarget,
  envelopeMonth,
  budgetMonth,
  expectedPayment,
  expectedPaymentVersion,
  expectedOccurrence,
  booking,
  bookingSplit,
  payee,
  incomeType,
];
function unchangedSince(db: Executor, day: string) {
  // FX observations have no complete edit history; never invent an old converted contract.
  if (
    db
      .select({ one: sql<number>`1` })
      .from(expectedPaymentVersion)
      .where(ne(expectedPaymentVersion.currency, 'EUR'))
      .limit(1)
      .get()
  )
    return false;
  let latest = '';
  const note = (v: unknown) => {
    if (typeof v === 'string' && v > latest) latest = v;
  };
  for (const table of sources) {
    const cols = getTableColumns(table) as Record<string, SQLiteColumn>;
    for (const field of ['createdAt', 'updatedAt', 'deletedAt']) {
      const col = cols[field];
      if (col)
        note(
          db
            .select({ v: sql<string | null>`max(${col})` })
            .from(table)
            .get()?.v,
        );
    }
  }
  note(
    db
      .select({ v: sql<string | null>`max(${auditLog.ts})` })
      .from(auditLog)
      .where(inArray(auditLog.entityType, sources.map(getTableName)))
      .get()?.v,
  );
  // Vienna day is monotonic in time, so the newest timestamp decides for all rows.
  return !latest || todayInVienna(new Date(latest)) <= day;
}

function pace(db: Executor, facts: RuleFacts, month: string, day: string, categoryId?: string) {
  return paceOfMonth(
    categoryId
      ? { ...facts, categories: facts.categories.filter((c) => c.id === categoryId) }
      : facts,
    month,
    day,
    occurrencesBetween(
      db,
      facts,
      `${month}-01`,
      lastDayOfMonth(month),
      day,
      facts.budgetByMonth.get(month),
    ),
  ).figures;
}

export function capturePlanSnapshot(db: Executor, month: string, today: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid snapshot month');
  const day = `${month}-15`;
  if (today < day) return { status: 'not_due' as const };
  return runInTransaction(db, (tx) => {
    if (
      tx
        .select()
        .from(planSnapshot)
        .where(and(eq(planSnapshot.month, month), isNull(planSnapshot.categoryId)))
        .get()
    )
      return { status: 'exists' as const };
    if (tx.select().from(planSnapshotGap).where(eq(planSnapshotGap.month, month)).get())
      return { status: 'unavailable_history' as const };
    if (today !== day && !unchangedSince(tx, day)) {
      tx.insert(planSnapshotGap)
        .values({ month, reason: 'inputs changed after day 15' })
        .onConflictDoNothing()
        .run();
      return { status: 'unavailable_history' as const };
    }
    const facts = loadFacts(tx, lastDayOfMonth(month));
    const total = pace(tx, facts, month, day);
    if (!total.forecastAvailable) return { status: 'no_plan' as const };
    const groupId = randomUUID();
    for (const categoryId of [
      null,
      ...facts.categories.filter((c) => c.class === 'need' || c.class === 'want').map((c) => c.id),
    ]) {
      const figures = categoryId === null ? total : pace(tx, facts, month, day, categoryId);
      insertTracked(
        tx,
        planSnapshot,
        {
          id: randomUUID(),
          month,
          day: 15,
          categoryId,
          plannedCents: figures.limitCents,
          spentCents: figures.spentCents,
          projectedCents: figures.forecastEndCents,
        },
        { actor: 'system', groupId },
      );
    }
    return { status: 'captured' as const };
  });
}

export function planningAccuracyReport(db: Executor, month: string, today: string) {
  const currentMonth = monthOf(today);
  const snapshots = db.select().from(planSnapshot).all();
  const totals = snapshots
    .filter((s) => s.categoryId === null && s.month < currentMonth)
    .sort((a, b) => a.month.localeCompare(b.month));
  const loadedFacts = loadFacts(db, today);
  // Retain deleted category identity for historical spending; no live forecast is reconstructed.
  const facts = { ...loadedFacts, categories: db.select().from(category).all() };
  const months = totals.map((s) => {
    const actualCents = pace(db, facts, s.month, lastDayOfMonth(s.month)).spentCents;
    return {
      month: s.month,
      projectedCents: s.projectedCents,
      actualCents,
      ...forecastAccuracy(s.projectedCents, actualCents),
    };
  });
  const categories = snapshots
    .filter((s) => s.month === month && s.categoryId !== null && month < currentMonth)
    .map((s) => {
      const actualCents = pace(db, facts, month, lastDayOfMonth(month), s.categoryId!).spentCents;
      return {
        categoryId: s.categoryId!,
        name: facts.categories.find((c) => c.id === s.categoryId)?.name ?? 'Archivierte Kategorie',
        plannedCents: s.plannedCents,
        spentCents: s.spentCents,
        projectedCents: s.projectedCents,
        actualCents,
        ...forecastAccuracy(s.projectedCents, actualCents),
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.deviationBp ?? 0) - Math.abs(a.deviationBp ?? 0) ||
        Math.abs(b.deviationCents) - Math.abs(a.deviationCents),
    );
  const firstSnapshot = snapshots
    .filter((s) => s.categoryId === null)
    .map((s) => s.month)
    .sort()[0];
  return {
    month,
    months,
    categories,
    summary: forecastAccuracySummary(months, currentMonth),
    reliableFrom: addMonths(
      firstSnapshot ?? (Number(today.slice(8)) > 15 ? addMonths(currentMonth, 1) : currentMonth),
      2,
    ),
  };
}

export type PlanningAccuracyReport = ReturnType<typeof planningAccuracyReport>;
