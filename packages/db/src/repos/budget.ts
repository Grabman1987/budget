import { summarizeMonth, type CardRule, type MonthSummary } from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { category, envelopeMonth } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { getEntity } from './entities';
import { categoryTree } from './categories';
import { setAssigned } from './envelopes';
import { CategoryRuleError, EntityNotFoundError } from './errors';
import { budget } from './queries';
import { runInTransaction, type Executor } from './types';

/**
 * Budget writes of Plan › Monat: assign, move money between envelopes and "Zu verteilen", cover
 * overspending. Only the assigned amount of a month is stored (`envelope_month`); everything else
 * is derived by `budgetMonths` (cardRule 'ynab' by default). Each action is one audit group.
 */

function assignedOf(db: Executor, categoryId: string, month: string): number {
  const row = db
    .select({ cents: envelopeMonth.assignedCents })
    .from(envelopeMonth)
    .where(
      and(
        eq(envelopeMonth.categoryId, categoryId),
        eq(envelopeMonth.month, month),
        isNull(envelopeMonth.deletedAt),
      ),
    )
    .get();
  return row?.cents ?? 0;
}

function requireEnvelope(db: Executor, id: string) {
  const row = getEntity(db, category, id);
  if (!row) throw new EntityNotFoundError('category', id);
  return row;
}

/** Set the assigned amount of several envelopes in one month (one undo, e.g. "Ziele füllen"). */
export function assignMany(
  db: Executor,
  month: string,
  items: ReadonlyArray<{ categoryId: string; assignedCents: number }>,
  ctx: AuditContext,
): { groupId: string } {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    for (const item of items) {
      requireEnvelope(tx, item.categoryId);
      setAssigned(tx, item.categoryId, month, item.assignedCents, grouped);
    }
  });
  return { groupId: grouped.groupId };
}

/**
 * Move `amountCents` (> 0) in `month` from one envelope to another; `null` is "Zu verteilen":
 * from `null` assigns, to `null` takes money back.
 */
export function moveMoney(
  db: Executor,
  month: string,
  fromId: string | null,
  toId: string | null,
  amountCents: number,
  ctx: AuditContext,
): { groupId: string } {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
    throw new RangeError('The amount to move is a positive number of cents');
  if (fromId === toId) throw new CategoryRuleError('Quelle und Ziel sind gleich.');
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    for (const [id, sign] of [
      [fromId, -1],
      [toId, 1],
    ] as const) {
      if (id === null) continue;
      requireEnvelope(tx, id);
      setAssigned(tx, id, month, assignedOf(tx, id, month) + sign * amountCents, grouped);
    }
  });
  return { groupId: grouped.groupId };
}

/**
 * Cover the overspending of `categoryId` in `month` from another envelope (at most what it has
 * available) or from "Zu verteilen" (`null`, the full amount). Returns the covered amount.
 */
export function coverOverspending(
  db: Executor,
  month: string,
  categoryId: string,
  fromId: string | null,
  ctx: AuditContext,
  options: { cardRule?: CardRule } = {},
): { groupId: string; coveredCents: number } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const [m] = budget(tx, [month], options);
    const overspent = m?.envelopes[categoryId]?.overspentCents ?? 0;
    if (overspent === 0) throw new CategoryRuleError('Diese Kategorie ist nicht überzogen.');
    const available = fromId === null ? overspent : (m?.envelopes[fromId]?.availableCents ?? 0);
    const coveredCents = Math.min(overspent, Math.max(0, available));
    if (coveredCents === 0) throw new CategoryRuleError('Die Quelle hat kein Geld verfügbar.');
    moveMoney(tx, month, fromId, categoryId, coveredCents, grouped);
    return { groupId: grouped.groupId, coveredCents };
  });
}

/** Plan › Monat in one read: the month summary plus the category list it refers to. */
export function budgetSummary(
  db: Executor,
  month: string,
  options: { cardRule?: CardRule } = {},
): { summary: MonthSummary; tree: ReturnType<typeof categoryTree> } {
  const tree = categoryTree(db);
  const [m] = budget(db, [month], options);
  if (!m) throw new RangeError(`No budget for ${month}`);
  return { summary: summarizeMonth(m, tree.categories, tree.targets), tree };
}
