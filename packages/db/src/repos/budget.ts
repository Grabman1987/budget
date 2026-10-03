import {
  cents,
  formatEuro,
  summarizeMonth,
  unclassifiedMonth,
  type CardRule,
  type MonthSummary,
} from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { category, envelopeMonth } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { getEntity } from './entities';
import { categoryTree } from './categories';
import { setAssigned } from './envelopes';
import { CategoryRuleError, EntityNotFoundError } from './errors';
import { budget, budgetLedger } from './queries';
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

/**
 * The assignment guard ("Schranken"): money that is not there cannot be assigned. A write that
 * raises the month's assigned total (`addedCents` > 0) must leave "Zu verteilen" at 0 or more;
 * writes that only reduce or reshuffle (net 0) always pass, also while "Zu verteilen" is already
 * negative. The overdraft of an account is a floor of the account, not money to assign: it is
 * not part of "Zu verteilen" and so never offered here. The only override is the explicit
 * `allowNegative` of "Trotzdem ganz decken" in `coverOverspending`.
 */
function guardAssignable(db: Executor, month: string, addedCents: number): void {
  if (addedCents <= 0) return;
  const [m] = budget(db, [month]);
  const free = m?.toBeAssignedCents ?? 0;
  if (addedCents <= Math.max(0, free)) return;
  const max = Math.max(0, free);
  const euro = (value: number) => formatEuro(cents(value));
  throw new CategoryRuleError(
    max > 0
      ? `So viel ist nicht frei: „Zu verteilen“ hat ${euro(free)}, zugewiesen würden ${euro(addedCents)} mehr. Höchstens ${euro(max)} mehr zuweisen.`
      : `Es ist nichts frei: „Zu verteilen“ steht bei ${euro(free)}. Erst Geld zurücknehmen oder Einnahmen erfassen.`,
  );
}

/**
 * Set the assigned amount of several envelopes in one month (one undo, e.g. "Ziele füllen").
 * Refused (`CategoryRuleError`) when it would take "Zu verteilen" below 0 (see `guardAssignable`);
 * `options.allowNegative` is for repository-level callers and tests, the API never passes it.
 */
export function assignMany(
  db: Executor,
  month: string,
  items: ReadonlyArray<{ categoryId: string; assignedCents: number }>,
  ctx: AuditContext,
  options: { allowNegative?: boolean } = {},
): { groupId: string } {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    // Later items of the same envelope win, as they do when applied one after the other.
    const target = new Map<string, number>();
    for (const item of items) {
      requireEnvelope(tx, item.categoryId);
      target.set(item.categoryId, item.assignedCents);
    }
    let added = 0;
    for (const [id, value] of target) added += value - assignedOf(tx, id, month);
    if (!options.allowNegative) guardAssignable(tx, month, added);
    for (const item of items) setAssigned(tx, item.categoryId, month, item.assignedCents, grouped);
  });
  return { groupId: grouped.groupId };
}

/**
 * Move `amountCents` (> 0) in `month` from one envelope to another; `null` is "Zu verteilen":
 * from `null` assigns, to `null` takes money back. Assigning from `null` is guarded like
 * `assignMany`; `options.allowNegative` lifts that (only `coverOverspending` passes it).
 */
export function moveMoney(
  db: Executor,
  month: string,
  fromId: string | null,
  toId: string | null,
  amountCents: number,
  ctx: AuditContext,
  options: { allowNegative?: boolean } = {},
): { groupId: string } {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
    throw new RangeError('The amount to move is a positive number of cents');
  if (fromId === toId) throw new CategoryRuleError('Quelle und Ziel sind gleich.');
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    if (!options.allowNegative)
      guardAssignable(
        tx,
        month,
        (fromId === null ? amountCents : 0) - (toId === null ? amountCents : 0),
      );
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
 * available) or from "Zu verteilen" (`null`): at most what "Zu verteilen" holds, unless
 * `allowNegative` confirms taking it below 0. Returns the covered amount.
 */
export function coverOverspending(
  db: Executor,
  month: string,
  categoryId: string,
  fromId: string | null,
  ctx: AuditContext,
  options: { cardRule?: CardRule; allowNegative?: boolean } = {},
): { groupId: string; coveredCents: number } {
  const grouped = withGroup(ctx);
  const { allowNegative, ...read } = options;
  return runInTransaction(db, (tx) => {
    const [m] = budget(tx, [month], read);
    const overspent = m?.envelopes[categoryId]?.overspentCents ?? 0;
    if (overspent === 0) throw new CategoryRuleError('Diese Kategorie ist nicht überzogen.');
    const available =
      fromId === null
        ? allowNegative
          ? overspent
          : (m?.toBeAssignedCents ?? 0)
        : (m?.envelopes[fromId]?.availableCents ?? 0);
    const coveredCents = Math.min(overspent, Math.max(0, available));
    if (coveredCents === 0)
      throw new CategoryRuleError(
        fromId === null
          ? '„Zu verteilen“ reicht nicht zum Decken.'
          : 'Die Quelle hat kein Geld verfügbar.',
      );
    // The cover amount was capped above; with `allowNegative` the owner confirmed going below 0.
    moveMoney(tx, month, fromId, categoryId, coveredCents, grouped, { allowNegative: true });
    return { groupId: grouped.groupId, coveredCents };
  });
}

/** Plan › Monat in one read: the month summary plus the category list it refers to. */
export function budgetSummary(
  db: Executor,
  month: string,
  options: { cardRule?: CardRule } = {},
): {
  summary: MonthSummary & { unclassified: ReturnType<typeof unclassifiedMonth> };
  tree: ReturnType<typeof categoryTree>;
} {
  const tree = categoryTree(db);
  const [m] = budget(db, [month], options);
  if (!m) throw new RangeError(`No budget for ${month}`);
  return {
    summary: {
      ...summarizeMonth(m, tree.categories, tree.targets),
      unclassified: unclassifiedMonth(budgetLedger(db), month),
    },
    tree,
  };
}
