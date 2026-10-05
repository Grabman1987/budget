import {
  addMonths,
  monthsBetween,
  emergencyCoverage,
  monthClassSpending,
  goalProgress,
  lastDayOfMonth,
  type GoalProgress,
} from '@budget/domain';
import { asc, isNull } from 'drizzle-orm';
import { account, category, savingsGoal } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { setCategoryTarget } from './categories';
import { createEntity, getEntity, restoreEntity, softDeleteEntity, updateEntity } from './entities';
import { CategoryRuleError, EntityNotFoundError } from './errors';
import { accountBalances, budget } from './queries';
import { reportTables } from './report-tables';
import { goalSollCents } from '@budget/domain';
import { runInTransaction, type Executor } from './types';

/**
 * Savings goals (Sparziele, concept §7.2). A goal is linked to an envelope (its available money at
 * the end of the viewed month is the saved amount) or to an account (its balance then). Progress,
 * the needed rate and the forecast come from `goalProgress` in `@budget/domain`; this file reads
 * the inputs and stores the goals. Writes are audited and `undo`-able.
 */

type Goal = typeof savingsGoal.$inferSelect;

export interface GoalInput {
  name: string;
  /** Positive cents. */
  targetCents: number;
  /** `YYYY-MM-DD` */
  targetDate?: string | null;
  /** Exactly one of `categoryId` and `accountId` links the goal. */
  categoryId?: string | null;
  accountId?: string | null;
  note?: string | null;
}
export type GoalPatch = Partial<GoalInput>;

export interface GoalRow extends Goal, GoalProgress {}

const cleanName = (name: string): string => {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean === '') throw new CategoryRuleError('Das Sparziel braucht einen Namen.');
  return clean;
};

function checkLinks(
  db: Executor,
  goal: Pick<Goal, 'targetCents' | 'categoryId' | 'accountId'>,
): void {
  if (goal.targetCents <= 0) throw new CategoryRuleError('Das Ziel muss über 0 liegen.');
  if (goal.categoryId !== null && goal.accountId !== null)
    throw new CategoryRuleError('Ein Sparziel hängt an einer Kategorie oder an einem Konto.');
  if (goal.categoryId !== null && !getEntity(db, category, goal.categoryId))
    throw new EntityNotFoundError('category', goal.categoryId);
  if (goal.accountId !== null && !getEntity(db, account, goal.accountId))
    throw new EntityNotFoundError('account', goal.accountId);
}

/** The goal with the link rules applied on top of the stored row. */
const merged = (goal: Goal, patch: GoalPatch): Goal => ({
  ...goal,
  ...patch,
  targetDate: patch.targetDate === undefined ? goal.targetDate : patch.targetDate,
  categoryId: patch.categoryId === undefined ? goal.categoryId : patch.categoryId,
  accountId: patch.accountId === undefined ? goal.accountId : patch.accountId,
  note: patch.note === undefined ? goal.note : patch.note,
});

/**
 * All goals with their figures for the viewed `month` (`YYYY-MM`): soonest target date first,
 * goals without a date last. The saved amount is the available money of the linked envelope (or
 * the balance of the linked account) at the end of the month; the forecast uses the average of the
 * month and the two before (assigned to the envelope, or growth of the account).
 */
export function listGoals(
  db: Executor,
  month: string,
  options: { includeDeleted?: boolean } = {},
): GoalRow[] {
  const goals = db
    .select()
    .from(savingsGoal)
    .where(options.includeDeleted ? undefined : isNull(savingsGoal.deletedAt))
    .orderBy(asc(savingsGoal.targetDate), asc(savingsGoal.name), asc(savingsGoal.id))
    .all();
  if (goals.length === 0) return [];

  const envelopes = goals.some((g) => g.categoryId !== null)
    ? budget(db, [addMonths(month, -2), addMonths(month, -1), month])
    : [];
  const balanceAt = new Map<string, Map<string, number>>();
  if (goals.some((g) => g.categoryId === null && g.accountId !== null))
    for (const m of [addMonths(month, -3), addMonths(month, -2), addMonths(month, -1), month])
      balanceAt.set(
        m,
        new Map(accountBalances(db, lastDayOfMonth(m)).map((b) => [b.accountId, b.balanceCents])),
      );

  // Nulls sort first in SQLite: move goals without a date behind the dated ones.
  const ordered = [...goals.filter((g) => g.targetDate), ...goals.filter((g) => !g.targetDate)];
  return ordered.map((g) => {
    let savedCents = 0;
    let recentMonthlyCents: number[] = [];
    if (g.categoryId !== null) {
      const id = g.categoryId;
      savedCents = envelopes.at(-1)?.envelopes[id]?.availableCents ?? 0;
      recentMonthlyCents = envelopes.map((m) => m.envelopes[id]?.assignedCents ?? 0);
    } else if (g.accountId !== null) {
      const id = g.accountId;
      const at = (m: string) => balanceAt.get(m)?.get(id) ?? 0;
      savedCents = at(month);
      recentMonthlyCents = [-2, -1, 0].map((n) => {
        const m = addMonths(month, n);
        return at(m) - at(addMonths(m, -1));
      });
    }
    return {
      ...g,
      ...goalProgress({
        month,
        targetCents: g.targetCents,
        targetDate: g.targetDate,
        savedCents,
        recentMonthlyCents,
      }),
    };
  });
}

/** One goal with its figures for `month`. */
export function getGoal(db: Executor, id: string, month: string): GoalRow {
  const row = listGoals(db, month, { includeDeleted: true }).find((g) => g.id === id);
  if (!row) throw new EntityNotFoundError('savings_goal', id);
  return row;
}

export function createGoal(
  db: Executor,
  input: GoalInput,
  ctx: AuditContext,
): { goal: Goal; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const values = {
      name: cleanName(input.name),
      targetCents: input.targetCents,
      targetDate: input.targetDate ?? null,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
      note: input.note ?? null,
    };
    checkLinks(tx, values);
    return { goal: createEntity(tx, savingsGoal, values, grouped), groupId: grouped.groupId };
  });
}

export function updateGoal(
  db: Executor,
  id: string,
  patch: GoalPatch,
  ctx: AuditContext,
): { goal: Goal; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = getEntity(tx, savingsGoal, id);
    if (!current) throw new EntityNotFoundError('savings_goal', id);
    const next = merged(current, patch);
    // Switching the link clears the other side, so a patch with one of them is enough.
    if (patch.categoryId != null && patch.accountId === undefined) next.accountId = null;
    if (patch.accountId != null && patch.categoryId === undefined) next.categoryId = null;
    checkLinks(tx, next);
    const clean = {
      ...(patch.name !== undefined && { name: cleanName(patch.name) }),
      ...(patch.targetCents !== undefined && { targetCents: patch.targetCents }),
      ...(patch.targetDate !== undefined && { targetDate: patch.targetDate }),
      ...(patch.note !== undefined && { note: patch.note }),
      categoryId: next.categoryId,
      accountId: next.accountId,
    };
    return { goal: updateEntity(tx, savingsGoal, id, clean, grouped), groupId: grouped.groupId };
  });
}

export function deleteGoal(db: Executor, id: string, ctx: AuditContext): { groupId: string } {
  const grouped = withGroup(ctx);
  softDeleteEntity(db, savingsGoal, id, grouped);
  return { groupId: grouped.groupId };
}

export function restoreGoal(
  db: Executor,
  id: string,
  ctx: AuditContext,
): { goal: Goal; groupId: string } {
  const grouped = withGroup(ctx);
  return { goal: restoreEntity(db, savingsGoal, id, grouped), groupId: grouped.groupId };
}

/**
 * "Als Ziel der Kategorie übernehmen": the goal becomes the target of its envelope, a versioned
 * `by_date` target of the goal's amount and date, applying from `validFrom` (`YYYY-MM`, default
 * the month of today). One audit group, so one undo reverts it.
 */
export function adoptGoalAsCategoryTarget(
  db: Executor,
  id: string,
  validFrom: string,
  ctx: AuditContext,
): { groupId: string; categoryId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const goal = getEntity(tx, savingsGoal, id);
    if (!goal) throw new EntityNotFoundError('savings_goal', id);
    if (goal.categoryId === null)
      throw new CategoryRuleError('Nur ein Sparziel mit Kategorie kann deren Ziel werden.');
    if (goal.targetDate === null)
      throw new CategoryRuleError('Ein Ziel bis zu einem Datum braucht das Datum.');
    setCategoryTarget(
      tx,
      goal.categoryId,
      { kind: 'by_date', amountCents: goal.targetCents, targetDate: goal.targetDate },
      validFrom,
      grouped,
    );
    return { groupId: grouped.groupId, categoryId: goal.categoryId };
  });
}

/** Read-only additions to report 3.5; no invented attribution from envelopes to bank accounts. */
export function goalsReport(db: Executor, today: string) {
  const month = today.slice(0, 7);
  const goals = listGoals(db, month);
  const tables = reportTables(db, { today });
  const balances = new Map(accountBalances(db, today).map((r) => [r.accountId, r.balanceCents]));
  const accounts = db.select().from(account).where(isNull(account.deletedAt)).all();
  const reserveCents = accounts
    .filter((a) => a.role === 'reserve' && a.currency === 'EUR')
    .reduce((a, c) => a + Math.max(0, balances.get(c.id) ?? 0), 0);
  const coverage = emergencyCoverage({
    reserveCents,
    currentMonth: month,
    ...(tables.firstMonth ? { firstMonth: tables.firstMonth } : {}),
    needSpending: tables.months.map((m) => ({
      month: m.month,
      cents: monthClassSpending(m, tables, 'need'),
    })),
  });
  const cash = accounts
    .filter((a) => a.type === 'savings' && a.currency === 'EUR')
    .map((a) => {
      const linked = goals.filter((g) => g.accountId === a.id && g.categoryId === null);
      return {
        id: a.id,
        name: a.name,
        balanceCents: balances.get(a.id) ?? 0,
        goal: linked.length === 1 ? linked[0]!.name : null,
        ambiguous: linked.length > 1,
      };
    });
  const counts = new Map<string, number>();
  for (const g of goals) {
    const key = g.categoryId ? `category:${g.categoryId}` : `account:${g.accountId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const history = goals.map((g) => {
    const start = g.createdAt.slice(0, 7) > month ? month : g.createdAt.slice(0, 7);
    const target = g.targetDate?.slice(0, 7) ?? month;
    const end = target > month ? target : month;
    const keys = monthsBetween(start, end).slice(0, 1201);
    const key = g.categoryId ? `category:${g.categoryId}` : `account:${g.accountId}`;
    const source = g.categoryId
      ? db
          .select()
          .from(category)
          .where(isNull(category.deletedAt))
          .all()
          .find((c) => c.id === g.categoryId)
      : accounts.find((a) => a.id === g.accountId && a.currency === 'EUR');
    if (!source || (counts.get(key) ?? 0) !== 1 || (g.categoryId !== null && g.accountId !== null))
      return { id: g.id, points: [] };
    const past = keys.filter((m) => m <= month);
    const envelopes = g.categoryId && past.length ? budget(db, past) : [];
    return {
      id: g.id,
      points: keys.map((m, i) => ({
        month: m,
        actualCents:
          m > month
            ? null
            : g.categoryId
              ? Math.max(0, envelopes[i]?.envelopes[g.categoryId]?.availableCents ?? 0)
              : Math.max(
                  0,
                  accountBalances(db, m === month ? today : lastDayOfMonth(m)).find(
                    (a) => a.accountId === g.accountId,
                  )?.balanceCents ?? 0,
                ),
        sollCents: g.targetDate ? goalSollCents(g.targetCents, start, target, m) : null,
      })),
    };
  });
  return {
    month,
    reserveCents,
    coverage,
    cash,
    history,
    reserveComplete: !accounts.some((a) => a.role === 'reserve' && a.currency !== 'EUR'),
  };
}
