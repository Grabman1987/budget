import {
  cents,
  coverPlan,
  formatEuro,
  monthOf,
  quickAssignPlan,
  summarizeMonth,
  todayInVienna,
  unclassifiedMonth,
  type CardRule,
  type MonthSummary,
  type QuickAssignMode,
} from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { category, envelopeMonth } from '../schema';
import { coverBudgetMoney, coverCommitments } from './cover-limits';
import { loadFacts } from './rule-inputs';
import { withGroup, type AuditContext } from './audit';
import { getEntity } from './entities';
import { categoryTree } from './categories';
import { setAssigned } from './envelopes';
import { CategoryRuleError, EntityNotFoundError } from './errors';
import { budget, budgetLedger, budgetOfLedger } from './queries';
import { runInTransaction, type Executor } from './types';
import { planMonthViews } from './plan-months';

/** Re-read suggestions inside the transaction; stale clients cannot overwrite filled rows. */
export function quickAssignMany(
  db: Executor,
  month: string,
  mode: QuickAssignMode,
  categoryIds: ReadonlyArray<string>,
  ctx: AuditContext,
  today: string,
) {
  return runInTransaction(db, (tx) => {
    const view = planMonthViews(tx, [month], {}, today)[month]!;
    const byId = new Map(view.summary.envelopes.map((e) => [e.categoryId, e]));
    if (new Set(categoryIds).size !== categoryIds.length)
      throw new CategoryRuleError('Eine Kategorie darf nur einmal ausgewählt sein.');
    const rows = categoryIds.map((id) => {
      const row = byId.get(id);
      if (!row?.quickAssign) throw new CategoryRuleError('Bitte eine Ausgabenkategorie auswählen.');
      return row;
    });
    const { items, ...result } = quickAssignPlan(rows, mode, view.summary.toBeAssignedCents);
    return { ...assignMany(tx, month, items, ctx), ...result };
  });
}

/**
 * Budget writes of Plan › Monat: assign, move money between envelopes and "Zu verteilen", cover
 * overspending. Only the assigned amount of a month is stored (`envelope_month`); everything else
 * is derived by `budgetMonths` (cardRule 'ynab' by default). Each action is one audit group.
 */

/** One rule for single and bulk cover: only a real spending envelope may be a cover source. */
function assertCoverSource(db: Executor, id: string) {
  requireEnvelope(db, id);
  const c = categoryTree(db).categories.find((x) => x.id === id);
  if (!c || c.kind === 'income' || c.kind === 'card_payment')
    throw new CategoryRuleError('Diese Kategorie ist keine Deckungsquelle.');
}

/** Total cover cap (balances plus allowed overdraft); only today's month is bound to it. */
function coverCap(db: Executor, month: string, today: string) {
  return month === monthOf(today)
    ? coverBudgetMoney(db, today, loadFacts(db, today)).coverCapCents
    : Number.POSITIVE_INFINITY;
}

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
 * not part of "Zu verteilen" and so never offered here. Repository-only `allowNegative` supports synthetic reconciliation; the cover API never permits it.
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
  options: { cardRule?: CardRule; allowNegative?: boolean; today?: string } = {},
): { groupId: string; coveredCents: number } {
  const grouped = withGroup(ctx);
  const { allowNegative, today = todayInVienna(), ...read } = options;
  return runInTransaction(db, (tx) => {
    if (fromId !== null) assertCoverSource(tx, fromId);
    const [m] = budget(tx, [month], read);
    const overspent = m?.envelopes[categoryId]?.overspentCents ?? 0;
    if (overspent === 0) throw new CategoryRuleError('Diese Kategorie ist nicht überzogen.');
    const cap = coverCap(tx, month, today);
    const available =
      fromId === null
        ? allowNegative
          ? overspent
          : (m?.toBeAssignedCents ?? 0)
        : (coverCommitments(
            tx,
            month,
            today,
          )([{ categoryId: fromId, availableCents: m?.envelopes[fromId]?.availableCents ?? 0 }])[0]
            ?.freeCents ?? 0);
    // Never more than the budget accounts really hold (balances plus allowed overdraft).
    const coveredCents = Math.min(
      overspent,
      Math.max(0, available),
      allowNegative && fromId === null ? Infinity : cap,
    );
    if (coveredCents === 0)
      throw new CategoryRuleError(
        fromId === null
          ? '„Zu verteilen“ reicht nicht zum Decken.'
          : 'Die Quelle hat kein freies Geld zum Decken.',
      );
    // The API always caps above; the repository override is only for reconciliation tests.
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
  const ledger = budgetLedger(db);
  const [m] = budgetOfLedger(ledger, [month], options);
  if (!m) throw new RangeError(`No budget for ${month}`);
  return {
    summary: {
      ...summarizeMonth(m, tree.categories, tree.targets),
      unclassified: unclassifiedMonth(ledger, month),
    },
    tree,
  };
}

/** All covers reuse moveMoney in one transaction/audit group; never create a source overdraft. */
export function coverAllOverspending(
  db: Executor,
  month: string,
  fromId: string | null | undefined,
  ctx: AuditContext,
  today: string = todayInVienna(),
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const { summary, tree } = budgetSummary(tx, month);
    const limits = coverCommitments(tx, month, today);
    const groupOrder = new Map(tree.groups.map((g, i) => [g.id, i]));
    const envelopes = new Map(summary.envelopes.map((e) => [e.categoryId, e]));
    const categories = tree.categories
      .filter((c) => c.kind !== 'income')
      .sort(
        (a, b) =>
          (a.stage ?? 10) - (b.stage ?? 10) ||
          (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0) ||
          a.sortOrder - b.sortOrder,
      );
    if (fromId) {
      assertCoverSource(tx, fromId);
    }
    const targets = categories.flatMap((c) => {
      const e = envelopes.get(c.id);
      return e && e.overspentCents > 0 ? [{ id: c.id, overspentCents: e.overspentCents }] : [];
    });
    let moved = false;
    let capLeft = coverCap(tx, month, today);
    for (const target of targets) {
      // Covering card spending also funds its payment envelope. Read that effect before the
      // next target, so a later card-payment deficit is never covered twice.
      const current = budgetSummary(tx, month).summary;
      const balances = new Map(current.envelopes.map((e) => [e.categoryId, e]));
      const freeById = new Map(limits(current.envelopes).map((e) => [e.categoryId, e.freeCents]));
      const pool = categories
        .filter((c) => c.kind !== 'card_payment')
        .map((c) => ({ id: c.id, availableCents: freeById.get(c.id) ?? 0 }));
      const free = { id: null, availableCents: current.toBeAssignedCents };
      const sources =
        fromId === undefined
          ? [...pool, free]
          : fromId === null
            ? [free]
            : pool.filter((s) => s.id === fromId);
      const { moves } = coverPlan(
        [
          {
            id: target.id,
            overspentCents: Math.min(balances.get(target.id)?.overspentCents ?? 0, capLeft),
          },
        ],
        sources,
      );
      for (const move of moves) {
        capLeft -= move.amountCents;
        moveMoney(tx, month, move.fromId, move.toId, move.amountCents, grouped);
        moved = true;
      }
    }
    if (!moved) throw new CategoryRuleError('Kein verfügbares Geld zum Decken.');
    const final = new Map(
      budgetSummary(tx, month).summary.envelopes.map((e) => [e.categoryId, e.overspentCents]),
    );
    const open = targets.filter((t) => (final.get(t.id) ?? 0) > 0);
    return {
      groupId: grouped.groupId,
      coveredCount: targets.length - open.length,
      openCount: open.length,
      missingCents: open.reduce((sum, t) => sum + (final.get(t.id) ?? 0), 0),
    };
  });
}
