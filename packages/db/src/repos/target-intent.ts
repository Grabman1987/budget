import { randomUUID } from 'node:crypto';
import { targetFor } from '@budget/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { category, categoryTarget, categoryTargetSnooze } from '../schema';
import { insertTracked, nowIso, updateTracked, withGroup, type AuditContext } from './audit';
import { CategoryRuleError } from './errors';
import { runInTransaction, type Executor } from './types';

/** One shared read adapter: all existing target consumers receive the same month-specific intent. */
export function readCategoryTargets(db: Executor) {
  const snoozes = db.select().from(categoryTargetSnooze).where(isNull(categoryTargetSnooze.deletedAt)).all();
  const byCategory = new Map<string, string[]>();
  for (const snooze of snoozes) byCategory.set(snooze.categoryId, [...(byCategory.get(snooze.categoryId) ?? []), snooze.month]);
  return db.select().from(categoryTarget).where(isNull(categoryTarget.deletedAt))
    .orderBy(asc(categoryTarget.validFrom)).all().map((target) => ({
      ...target,
      snoozedMonths: (byCategory.get(target.categoryId) ?? []).sort(),
    }));
}

/** Only target intent changes: balances, bookings, assignments and target versions remain untouched. */
export function setTargetSnooze(db: Executor, month: string, categoryId: string, snoozed: boolean, ctx: AuditContext) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new CategoryRuleError('Bitte einen gültigen Planmonat wählen.');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = tx.select().from(category).where(and(eq(category.id, categoryId), isNull(category.deletedAt))).get();
    if (!row?.class || ['income', 'card_payment', 'advance'].includes(row.kind))
      throw new CategoryRuleError('Bitte eine Ausgabenkategorie mit Ziel auswählen.');
    if (snoozed && !targetFor(readCategoryTargets(tx), categoryId, month))
      throw new CategoryRuleError('Für diesen Monat ist kein Ziel vorhanden.');
    const existing = tx.select().from(categoryTargetSnooze).where(and(
      eq(categoryTargetSnooze.categoryId, categoryId), eq(categoryTargetSnooze.month, month),
    )).get();
    if (Boolean(existing && !existing.deletedAt) === snoozed)
      throw new CategoryRuleError(snoozed ? 'Das Ziel ist für diesen Monat bereits ausgesetzt.' : 'Das Ziel ist für diesen Monat bereits aktiv.');
    if (existing) updateTracked(tx, categoryTargetSnooze, [existing.id], { deletedAt: snoozed ? null : nowIso() }, grouped, snoozed ? 'restore' : 'delete');
    else insertTracked(tx, categoryTargetSnooze, { id: randomUUID(), categoryId, month }, grouped);
    return { groupId: grouped.groupId };
  });
}
