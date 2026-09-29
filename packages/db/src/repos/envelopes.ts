import { and, asc, eq, isNull } from 'drizzle-orm';
import { envelopeMonth } from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { runInTransaction, type Executor } from './types';

/** Assigned amount of one category in one month. Activity and available are derived elsewhere. */
export interface AssignedRow {
  categoryId: string;
  month: string;
  assignedCents: number;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Upsert the assigned amount of `categoryId` in `month` (`YYYY-MM`), audited (create or
 * update with before/after). Setting 0 where no row exists writes nothing; an unchanged value
 * writes nothing. A row hidden by `undo` (soft-deleted) is revived by the update.
 */
export function setAssigned(
  db: Executor,
  categoryId: string,
  month: string,
  assignedCents: number,
  ctx: AuditContext,
): void {
  if (!MONTH.test(month)) throw new Error(`Invalid month "${month}", expected YYYY-MM`);
  if (!Number.isSafeInteger(assignedCents)) {
    throw new Error(`Assigned amount ${assignedCents} is not an integer number of cents`);
  }
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const existing = tx
      .select()
      .from(envelopeMonth)
      .where(and(eq(envelopeMonth.categoryId, categoryId), eq(envelopeMonth.month, month)))
      .get();
    if (!existing) {
      if (assignedCents === 0) return;
      insertTracked(tx, envelopeMonth, { categoryId, month, assignedCents }, grouped);
    } else {
      updateTracked(
        tx,
        envelopeMonth,
        [categoryId, month],
        { assignedCents, deletedAt: null },
        grouped,
      );
    }
  });
}

/** Assigned amounts (all months, or one), ordered by month then category id. */
export function getAssigned(db: Executor, month?: string): AssignedRow[] {
  return db
    .select({
      categoryId: envelopeMonth.categoryId,
      month: envelopeMonth.month,
      assignedCents: envelopeMonth.assignedCents,
    })
    .from(envelopeMonth)
    .where(
      and(
        isNull(envelopeMonth.deletedAt),
        month === undefined ? undefined : eq(envelopeMonth.month, month),
      ),
    )
    .orderBy(asc(envelopeMonth.month), asc(envelopeMonth.categoryId))
    .all();
}

/** `{ [month]: { [categoryId]: assignedCents } }` for the domain layer. */
export function assignedByMonth(db: Executor): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of getAssigned(db)) (out[r.month] ??= {})[r.categoryId] = r.assignedCents;
  return out;
}
