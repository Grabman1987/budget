import {
  addMonths,
  monthsBetween,
  emergencyCoverage,
  monthClassSpending,
  goalProgress,
  lastDayOfMonth,
  type GoalProgress,
  type GoalLifecycle,
  todayInVienna,
  summarizeMonth,
} from '@budget/domain';
import { createHash } from 'node:crypto';
import { asc, eq, isNull, sql } from 'drizzle-orm';
import { account, category, categoryTarget, savingsGoal } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { categoryTree, setCategoryTarget } from './categories';
import { createEntity, getEntity, restoreEntity, softDeleteEntity, updateEntity } from './entities';
import { CategoryRuleError, EntityNotFoundError } from './errors';
import { accountBalances, budget } from './queries';
import { reportTables } from './report-tables';
import { goalSollCents } from '@budget/domain';
import { runInTransaction, type Executor } from './types';
import {
  captureGoalAnchor,
  goalAnchorGroupStart,
  goalAnchorIntentDigest,
  readGoalLifecycles,
  type GoalAnchorIntent,
} from './goal-lifecycle';
import { assignMany } from './budget';

/**
 * Savings goals (Sparziele, concept §7.2). A goal is linked to an envelope (its available money at
 * the end of the viewed month is the saved amount) or to an account (its balance then). Progress,
 * the needed rate and the forecast come from `goalProgress` in `@budget/domain`; this file reads
 * the inputs and stores the goals. Writes are audited and `undo`-able.
 */

type Goal = typeof savingsGoal.$inferSelect;
/** Internal provenance never crosses any public goal response path. */
export type PublicGoal = Omit<Goal, 'lifecycleAnchorJson'>;
const publicGoal = (goal: Goal): PublicGoal => {
  const { lifecycleAnchorJson, ...publicRow } = goal;
  void lifecycleAnchorJson;
  return publicRow;
};
const anchorIntent = (goal: Goal): GoalAnchorIntent => ({
  id: goal.id,
  categoryId: goal.categoryId,
  accountId: goal.accountId,
  targetCents: goal.targetCents,
  targetDate: goal.targetDate,
  startMonth: goal.startMonth ?? goal.createdAt.slice(0, 7),
});

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
  startMonth?: string | null;
}
export type GoalPatch = Partial<GoalInput>;

export interface GoalRow extends PublicGoal, GoalProgress {
  effectiveStartMonth: string;
  lifecycle: GoalLifecycle;
  funding: {
    monthlyCents: number;
    remainingCents: number;
    conflict: string | null;
    reviewToken: string;
  } | null;
}

const cleanName = (name: string): string => {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean === '') throw new CategoryRuleError('Das Sparziel braucht einen Namen.');
  return clean;
};

function checkLinks(
  db: Executor,
  goal: Pick<Goal, 'targetCents' | 'categoryId' | 'accountId'> & { startMonth?: string | null },
): void {
  if (goal.startMonth != null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(goal.startMonth))
    throw new CategoryRuleError('Der Zielbeginn braucht einen gültigen Monat.');
  if (!Number.isSafeInteger(goal.targetCents) || goal.targetCents <= 0)
    throw new CategoryRuleError('Das Ziel muss über 0 liegen.');
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

/** Ownership is the last authoritative audited target state, never a name/amount coincidence. */
function goalTargetOwner(db: Executor, target: typeof categoryTarget.$inferSelect): string | null {
  const last = db.get<{
    groupId: string | null;
    after: string | null;
  }>(sql`SELECT group_id AS groupId, after_json AS "after" FROM audit_log
    WHERE entity_type='category_target' AND entity_id=${target.id} ORDER BY rowid DESC LIMIT 1`);
  if (!last?.groupId || !last.after) return null;
  let snapshot: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(last.after);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    snapshot = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const expected: Record<string, unknown> = {
    id: target.id,
    category_id: target.categoryId,
    kind: target.kind,
    amount_cents: target.amountCents,
    every_months: target.everyMonths,
    target_date: target.targetDate,
    due_day: target.dueDay,
    valid_from: target.validFrom,
    deleted_at: target.deletedAt,
  };
  if (Object.entries(expected).some(([key, value]) => snapshot[key] !== value)) return null;
  const owners = db.all<{ id: string }>(sql`SELECT DISTINCT entity_id AS id FROM audit_log
    WHERE group_id=${last.groupId} AND entity_type='savings_goal'`);
  return owners.length === 1 ? owners[0]!.id : null;
}

/**
 * All goals with their figures for the viewed `month` (`YYYY-MM`): soonest target date first,
 * goals without a date last. The saved amount is the available money of the linked envelope (or
 * the balance of the linked account) at the end of the month; the forecast uses the average of the
 * month and the two before (assigned to the envelope, or growth of the account).
 */
export function listGoals(
  db: Executor,
  month: string,
  options: { includeDeleted?: boolean; today?: string } = {},
): GoalRow[] {
  // One SQLite read snapshot binds the goal, current amounts and retained audit evidence.
  return runInTransaction(db, (tx) => listGoalsInSnapshot(tx, month, options));
}

function listGoalsInSnapshot(
  db: Executor,
  month: string,
  options: { includeDeleted?: boolean; today?: string },
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
  const today = options.today ?? todayInVienna();
  const asOf = lastDayOfMonth(month) < today ? lastDayOfMonth(month) : today;
  const tree = categoryTree(db);
  const current = envelopes.at(-1);
  const actualBudget = goals.some((g) => g.categoryId !== null)
    ? budget(db, [asOf.slice(0, 7)], { asOf })[0]
    : undefined;
  const actualBalances = goals.some((g) => g.accountId !== null)
    ? new Map(accountBalances(db, asOf).map((b) => [b.accountId, b.balanceCents]))
    : new Map<string, number>();
  const summary = current ? summarizeMonth(current, tree.categories, tree.targets) : null;
  const rows = ordered.map((g) => {
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
      ...publicGoal(g),
      effectiveStartMonth: g.startMonth ?? g.createdAt.slice(0, 7),
      ...goalProgress({
        month,
        targetCents: g.targetCents,
        targetDate: g.targetDate,
        savedCents,
        recentMonthlyCents,
      }),
    };
  });
  const lifecycle = readGoalLifecycles(
    db,
    rows.map((g) => ({
      id: g.id,
      categoryId: g.categoryId,
      accountId: g.accountId,
      startMonth: g.effectiveStartMonth,
      targetCents: g.targetCents,
      targetDate: g.targetDate,
      lifecycleAnchorJson: goals.find((stored) => stored.id === g.id)?.lifecycleAnchorJson ?? null,
      currentAvailableCents: g.categoryId
        ? (actualBudget?.envelopes[g.categoryId]?.availableCents ?? 0)
        : (actualBalances.get(g.accountId ?? '') ?? 0),
      manualCompletedOn: g.manualCompletedOn,
    })),
    asOf,
  );
  return rows.map((g) => {
    const state = lifecycle.get(g.id)!;
    const env = summary?.envelopes.find((e) => e.categoryId === g.categoryId);
    const competing = rows.some(
      (other) =>
        other.id !== g.id &&
        other.deletedAt === null &&
        other.categoryId === g.categoryId &&
        lifecycle.get(other.id)?.state !== 'completed',
    );
    const targetRow = tree.targets.find(
      (target) => target.categoryId === g.categoryId && target.validFrom === env?.target?.validFrom,
    );
    const owned = targetRow ? goalTargetOwner(db, targetRow) === g.id : false;
    const matches =
      owned &&
      env?.target?.kind === 'by_date' &&
      env.target.amountCents === g.targetCents &&
      env.target.targetDate === g.targetDate;
    const conflict =
      g.categoryId === null
        ? null
        : competing
          ? 'Mehrere Sparziele verwenden diese Kategorie. Bitte die Zuordnung zuerst auflösen.'
          : !g.targetDate
            ? 'Für die Monatsrate fehlt das Zieldatum.'
            : !matches
              ? 'Das Kategorie-Ziel weicht ab. Bitte das Sparziel oder das Ziel im Plan abstimmen.'
              : month < g.effectiveStartMonth
                ? 'Das Sparziel beginnt erst später.'
                : null;
    return {
      ...g,
      lifecycle: state,
      funding:
        g.categoryId === null
          ? null
          : {
              monthlyCents: matches ? env!.goalCents : 0,
              remainingCents: matches && state.state !== 'completed' ? env!.needCents : 0,
              conflict,
              reviewToken: createHash('sha256')
                .update(
                  JSON.stringify({
                    id: g.id,
                    updatedAt: g.updatedAt,
                    categoryId: g.categoryId,
                    accountId: g.accountId,
                    targetCents: g.targetCents,
                    targetDate: g.targetDate,
                    startMonth: g.effectiveStartMonth,
                    manualCompletedOn: g.manualCompletedOn,
                    month,
                    lifecycle: state,
                    conflict,
                    target: env?.target ?? null,
                    assigned: env?.assignedCents ?? null,
                    carry: env?.carryCents ?? null,
                    available: env?.availableCents ?? null,
                    monthly: env?.goalCents ?? null,
                    remaining: env?.needCents ?? null,
                  }),
                )
                .digest('hex'),
            },
    };
  });
}

/** One goal with its figures for `month`. */
export function getGoal(db: Executor, id: string, month: string, today = todayInVienna()): GoalRow {
  const row = listGoals(db, month, { includeDeleted: true, today }).find((g) => g.id === id);
  if (!row) throw new EntityNotFoundError('savings_goal', id);
  return row;
}

export function createGoal(
  db: Executor,
  input: GoalInput,
  ctx: AuditContext,
  validFrom = todayInVienna().slice(0, 7),
  today = todayInVienna(),
): { goal: PublicGoal; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const groupStartWatermark = goalAnchorGroupStart(tx, grouped.groupId);
    const values = {
      name: cleanName(input.name),
      targetCents: input.targetCents,
      targetDate: input.targetDate ?? null,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
      note: input.note ?? null,
      startMonth: input.startMonth ?? validFrom,
    };
    checkLinks(tx, values);
    let goal = createEntity(tx, savingsGoal, values, grouped);
    synchronizeGoalTarget(tx, goal, validFrom, grouped, today);
    const lifecycleAnchorJson = captureGoalAnchor(
      tx,
      anchorIntent(goal),
      today,
      grouped.groupId,
      groupStartWatermark,
    );
    if (lifecycleAnchorJson !== null)
      goal = updateEntity(tx, savingsGoal, goal.id, { lifecycleAnchorJson }, grouped);
    return { goal: publicGoal(goal), groupId: grouped.groupId };
  });
}

export function updateGoal(
  db: Executor,
  id: string,
  patch: GoalPatch,
  ctx: AuditContext,
  validFrom = todayInVienna().slice(0, 7),
  today = todayInVienna(),
): { goal: PublicGoal; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const groupStartWatermark = goalAnchorGroupStart(tx, grouped.groupId);
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
      ...(patch.startMonth !== undefined && {
        startMonth: patch.startMonth ?? current.startMonth ?? current.createdAt.slice(0, 7),
      }),
      categoryId: next.categoryId,
      accountId: next.accountId,
    };
    let goal = updateEntity(tx, savingsGoal, id, clean, grouped);
    const changedIntent =
      goalAnchorIntentDigest(anchorIntent(current)) !== goalAnchorIntentDigest(anchorIntent(goal));
    if (changedIntent) {
      synchronizeGoalTarget(tx, goal, validFrom, grouped, today);
      const lifecycleAnchorJson = captureGoalAnchor(
        tx,
        anchorIntent(goal),
        today,
        grouped.groupId,
        groupStartWatermark,
      );
      goal = updateEntity(tx, savingsGoal, id, { lifecycleAnchorJson }, grouped);
    }
    return { goal: publicGoal(goal), groupId: grouped.groupId };
  });
}

/** Only an unclaimed target or one last written with this goal may be synchronized. */
function synchronizeGoalTarget(
  db: Executor,
  goal: Goal,
  validFrom: string,
  ctx: AuditContext,
  today: string,
): void {
  if (!goal.categoryId || !goal.targetDate || goal.manualCompletedOn !== null) return;
  const peers = listGoals(db, validFrom, { today });
  if (
    peers.some(
      (other) =>
        other.id !== goal.id &&
        other.categoryId === goal.categoryId &&
        other.lifecycle.state !== 'completed',
    )
  )
    return;
  const effectiveFrom =
    validFrom < (goal.startMonth ?? goal.createdAt.slice(0, 7))
      ? (goal.startMonth ?? goal.createdAt.slice(0, 7))
      : validFrom;
  const versions = db
    .select()
    .from(categoryTarget)
    .where(eq(categoryTarget.categoryId, goal.categoryId))
    .all();
  const effective = versions
    .filter((v) => v.deletedAt === null && v.validFrom <= effectiveFrom)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
  const overwritten = versions.find((v) => v.validFrom === effectiveFrom) ?? effective;
  if (overwritten) {
    const ownerId = goalTargetOwner(db, overwritten);
    const previous = peers.find(
      (peer) => peer.id === ownerId && peer.categoryId === goal.categoryId,
    );
    if (ownerId !== goal.id && previous?.lifecycle.state !== 'completed') return;
    if (
      ownerId === goal.id &&
      overwritten.deletedAt === null &&
      overwritten.kind === 'by_date' &&
      overwritten.amountCents === goal.targetCents &&
      overwritten.targetDate === goal.targetDate
    )
      return;
  }
  setCategoryTarget(
    db,
    goal.categoryId,
    { kind: 'by_date', amountCents: goal.targetCents, targetDate: goal.targetDate },
    effectiveFrom,
    ctx,
  );
}

/** Same current-month Plan amount; only remaining need is assigned, never the whole rate again. */
export function fundGoalRate(
  db: Executor,
  id: string,
  month: string,
  reviewToken: string,
  ctx: AuditContext,
  today = todayInVienna(),
): { groupId: string; changedCount: number; assignedCents: number } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const goal = getGoal(tx, id, month, today);
    if (!goal.funding || goal.funding.reviewToken !== reviewToken)
      throw new CategoryRuleError(
        'Das Sparziel oder die Monatsrate hat sich geändert. Bitte den aktuellen Stand prüfen.',
      );
    if (
      goal.deletedAt !== null ||
      !goal.categoryId ||
      goal.lifecycle.state === 'completed' ||
      !goal.funding ||
      goal.funding.conflict
    )
      throw new CategoryRuleError(
        goal.funding?.conflict ?? 'Für dieses Sparziel ist keine Rate zuzuweisen.',
      );
    const amount = goal.funding.remainingCents;
    if (amount === 0) return { groupId: grouped.groupId, changedCount: 0, assignedCents: 0 };
    const assigned = budget(tx, [month])[0]?.envelopes[goal.categoryId]?.assignedCents ?? 0;
    assignMany(
      tx,
      month,
      [{ categoryId: goal.categoryId, assignedCents: assigned + amount }],
      grouped,
    );
    return { groupId: grouped.groupId, changedCount: 1, assignedCents: amount };
  });
}

/** Manual intent only: no booking, assignment or goal is deleted. Generic Undo restores this row. */
export function completeGoal(
  db: Executor,
  id: string,
  day: string,
  ctx: AuditContext,
): { groupId: string; changedCount: number } {
  const grouped = withGroup(ctx);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(`${day}T12:00:00Z`)) ||
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day
  )
    throw new CategoryRuleError('Der Abschluss braucht einen gültigen Tag.');
  return runInTransaction(db, (tx) => {
    const goal = getEntity(tx, savingsGoal, id);
    if (!goal) throw new EntityNotFoundError('savings_goal', id);
    if (goal.manualCompletedOn !== null) return { groupId: grouped.groupId, changedCount: 0 };
    updateEntity(tx, savingsGoal, id, { manualCompletedOn: day }, grouped);
    return { groupId: grouped.groupId, changedCount: 1 };
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
): { goal: PublicGoal; groupId: string } {
  const grouped = withGroup(ctx);
  return {
    goal: publicGoal(restoreEntity(db, savingsGoal, id, grouped)),
    groupId: grouped.groupId,
  };
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
export function goalsReport(db: Executor, today: string, month = today.slice(0, 7)) {
  const goals = listGoals(db, month, { today });
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
    const start = g.effectiveStartMonth;
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
    const past = keys.filter((m) => m <= month && m <= today.slice(0, 7));
    const envelopes = g.categoryId && past.length ? budget(db, past) : [];
    return {
      id: g.id,
      points: keys.map((m, i) => ({
        month: m,
        actualCents:
          m > month || m > today.slice(0, 7)
            ? null
            : g.categoryId
              ? (envelopes[i]?.envelopes[g.categoryId]?.availableCents ?? 0)
              : (accountBalances(db, m === today.slice(0, 7) ? today : lastDayOfMonth(m)).find(
                  (a) => a.accountId === g.accountId,
                )?.balanceCents ?? 0),
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
