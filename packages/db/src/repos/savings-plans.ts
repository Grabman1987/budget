import {
  addDays,
  cents,
  formatEuro,
  matchExecutions,
  planChanges,
  plannedExecutions,
  rowAppliesOn,
  savingsPlanProposal,
  type ExecutionCheck,
  type PlanChange,
  type PlanRow,
  type SavingsPlan,
  type SavingsPlanProposal,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { account, inboxItem, savingsPlan, security, trade } from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { positionLines, riskOf } from './portfolio-summary';
import { runInTransaction, type Executor } from './types';

export type SavingsPlanRecord = typeof savingsPlan.$inferSelect;

export interface SavingsPlanInput {
  securityId: string;
  /** The investment account that holds the security (the buy settles there). */
  accountId: string;
  /** Where the money comes from (informational; the transfer is booked as it happens). */
  sourceAccountId?: string | null;
  amountCents: number;
  dayOfMonth: number;
  validFrom: string;
  note?: string | null;
}

export type SavingsPlanChange = Partial<
  Pick<SavingsPlanInput, 'amountCents' | 'dayOfMonth' | 'sourceAccountId' | 'note'>
>;

const toRow = (r: SavingsPlanRecord): PlanRow => ({
  id: r.id,
  securityId: r.securityId,
  accountId: r.accountId,
  amountCents: r.amountCents,
  dayOfMonth: r.dayOfMonth,
  validFrom: r.validFrom,
  validTo: r.validTo,
});

function assertShape(v: { amountCents: number; dayOfMonth: number }): void {
  if (!Number.isSafeInteger(v.amountCents) || v.amountCents <= 0)
    throw new RangeError('The rate must be a positive whole number of cents');
  if (!Number.isInteger(v.dayOfMonth) || v.dayOfMonth < 1 || v.dayOfMonth > 31)
    throw new RangeError('The day of the month is 1 to 31');
}

function load(tx: Executor, id: string): SavingsPlanRecord {
  const row = tx
    .select()
    .from(savingsPlan)
    .where(and(eq(savingsPlan.id, id), isNull(savingsPlan.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('savings_plan', id);
  return row;
}

/** Live rows, optionally only those that are not ended; oldest first. */
export function listSavingsPlans(
  db: Executor,
  options: { includeEnded?: boolean } = {},
): SavingsPlanRecord[] {
  const rows = db
    .select()
    .from(savingsPlan)
    .where(isNull(savingsPlan.deletedAt))
    .orderBy(asc(savingsPlan.securityId), asc(savingsPlan.accountId), asc(savingsPlan.validFrom))
    .all();
  return options.includeEnded ? rows : rows.filter((r) => r.validTo === null);
}

/** Rows that run on `day`. */
export const plansOn = (db: Executor, day: string): SavingsPlanRecord[] =>
  listSavingsPlans(db, { includeEnded: true }).filter((r) => rowAppliesOn(toRow(r), day));

function checkRefs(
  tx: Executor,
  v: { securityId: string; accountId: string; sourceAccountId?: string | null },
) {
  const sec = tx
    .select({ id: security.id })
    .from(security)
    .where(and(eq(security.id, v.securityId), isNull(security.deletedAt)))
    .get();
  if (!sec) throw new EntityNotFoundError('security', v.securityId);
  const acct = tx
    .select()
    .from(account)
    .where(and(eq(account.id, v.accountId), isNull(account.deletedAt)))
    .get();
  if (!acct) throw new EntityNotFoundError('account', v.accountId);
  if (acct.role !== 'investment')
    throw new RangeError('A savings plan runs into an investment account');
  if (v.sourceAccountId) {
    const src = tx
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.id, v.sourceAccountId), isNull(account.deletedAt)))
      .get();
    if (!src) throw new EntityNotFoundError('account', v.sourceAccountId);
    if (v.sourceAccountId === v.accountId)
      throw new RangeError('The source account must differ from the investment account');
  }
}

/** Start a savings plan. One security on one account has at most one open plan. */
export function createSavingsPlan(
  db: Executor,
  input: SavingsPlanInput,
  ctx: AuditContext,
): SavingsPlanRecord {
  const grouped = withGroup(ctx);
  assertShape(input);
  return runInTransaction(db, (tx) => {
    checkRefs(tx, input);
    const open = listSavingsPlans(tx).find(
      (r) => r.securityId === input.securityId && r.accountId === input.accountId,
    );
    if (open)
      throw new ConflictError(
        'This security already has an open savings plan on the account; change it',
      );
    return insertTracked(
      tx,
      savingsPlan,
      {
        id: randomUUID(),
        securityId: input.securityId,
        accountId: input.accountId,
        sourceAccountId: input.sourceAccountId ?? null,
        amountCents: input.amountCents,
        dayOfMonth: input.dayOfMonth,
        validFrom: input.validFrom,
        note: input.note ?? null,
      },
      grouped,
    );
  });
}

/**
 * Change an open plan from a day: the current row ends the day before, a new row starts on
 * `from` (history keeps the old rate). A change from the row's own first day or earlier corrects
 * the row in place.
 */
export function changeSavingsPlan(
  db: Executor,
  id: string,
  change: SavingsPlanChange,
  from: string,
  ctx: AuditContext,
): SavingsPlanRecord {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const cur = load(tx, id);
    if (cur.validTo !== null)
      throw new ConflictError('The savings plan has ended; start a new one');
    const merged = {
      amountCents: change.amountCents ?? cur.amountCents,
      dayOfMonth: change.dayOfMonth ?? cur.dayOfMonth,
      sourceAccountId:
        change.sourceAccountId !== undefined ? change.sourceAccountId : cur.sourceAccountId,
      note: change.note !== undefined ? change.note : cur.note,
    };
    assertShape(merged);
    checkRefs(tx, { ...cur, sourceAccountId: merged.sourceAccountId });
    if (from <= cur.validFrom) {
      updateTracked(tx, savingsPlan, [id], merged, grouped);
      return load(tx, id);
    }
    updateTracked(tx, savingsPlan, [id], { validTo: addDays(from, -1) }, grouped);
    return insertTracked(
      tx,
      savingsPlan,
      {
        id: randomUUID(),
        securityId: cur.securityId,
        accountId: cur.accountId,
        ...merged,
        validFrom: from,
      },
      grouped,
    );
  });
}

/** End an open plan: it applies up to and including `to`. */
export function endSavingsPlan(
  db: Executor,
  id: string,
  to: string,
  ctx: AuditContext,
): SavingsPlanRecord {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const cur = load(tx, id);
    if (cur.validTo !== null) throw new ConflictError('The savings plan has ended already');
    if (to < cur.validFrom) throw new RangeError('A plan cannot end before it starts');
    updateTracked(tx, savingsPlan, [id], { validTo: to }, grouped);
    return load(tx, id);
  });
}

/** Soft-delete a row (a mistaken entry); history rows are kept by ending, not deleting. */
export function deleteSavingsPlan(db: Executor, id: string, ctx: AuditContext): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    load(tx, id);
    updateTracked(
      tx,
      savingsPlan,
      [id],
      { deletedAt: new Date().toISOString() },
      grouped,
      'delete',
    );
  });
}

/** Planned executions of a month against the executed buys (ausgeführt, fehlt, steht an). */
export function savingsExecutions(db: Executor, month: string, today: string): ExecutionCheck[] {
  const rows = listSavingsPlans(db, { includeEnded: true }).map(toRow);
  const planned = plannedExecutions(rows, month);
  if (planned.length === 0) return [];
  const buys = db
    .select({
      id: trade.id,
      securityId: trade.securityId,
      accountId: trade.accountId,
      date: trade.date,
      amountCents: trade.amountCents,
      feeCents: trade.feeCents,
    })
    .from(trade)
    .where(and(isNull(trade.deletedAt), eq(trade.kind, 'buy')))
    .all();
  return matchExecutions(planned, buys, today);
}

/** Proposed rates are whole multiples of this (50 €, as in the prototype: 300 and 100). */
export const SAVINGS_PLAN_STEP_CENTS = 5_000;

export interface ProposalView extends SavingsPlanProposal {
  /** The plan rows the proposal is based on (open rows, including ones that start later). */
  basis: SavingsPlanRecord[];
}

/**
 * Proposal for the open plans (P5.3 `savingsPlanProposal`): R15 pauses speculative plans, R13 steers
 * the freed rate to under-weight classes; the monthly total stays. The basis is the latest state
 * of every plan (a pending change counts), so applying twice proposes nothing new.
 */
export function savingsProposal(
  db: Executor,
  today: string,
  options: { stepCents?: number } = {},
): ProposalView {
  const lines = positionLines(db, today);
  const risk = riskOf(db, today, lines);
  const names = new Map(
    db
      .select({
        id: security.id,
        name: security.name,
        kind: security.kind,
        assetClassId: security.assetClassId,
      })
      .from(security)
      .all()
      .map((s) => [s.id, s]),
  );
  const basis = listSavingsPlans(db);
  const plans: SavingsPlan[] = basis.flatMap((r) => {
    const sec = names.get(r.securityId);
    return sec
      ? [
          {
            id: r.id,
            name: sec.name,
            kind: sec.kind,
            assetClass: sec.assetClassId,
            monthlyCents: r.amountCents,
          },
        ]
      : [];
  });
  const proposal = savingsPlanProposal(plans, risk.allocation, {
    speculativeBreached: risk.speculative.breach,
    stepCents: options.stepCents ?? SAVINGS_PLAN_STEP_CENTS,
  });
  return { ...proposal, basis };
}

export interface ApplyResult {
  changes: PlanChange[];
  inboxItemId: string | null;
  groupId: string;
}

const eur = (value: number): string => formatEuro(cents(value));

/**
 * Apply the proposal: every changed plan ends on the day before its next execution and starts at
 * the new rate from that day (a rate of 0 only ends it), and one inbox item "Sparplan bei der Bank
 * ändern" lists the changes, because the bank does not follow by itself. One audit group.
 */
export function applySavingsProposal(
  db: Executor,
  today: string,
  ctx: AuditContext,
  options: { stepCents?: number } = {},
): ApplyResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const view = savingsProposal(tx, today, options);
    const changes = planChanges(view.basis.map(toRow), view.plans, today);
    if (changes.length === 0) return { changes, inboxItemId: null, groupId: grouped.groupId };
    const names = new Map(
      tx
        .select({ id: security.id, name: security.name })
        .from(security)
        .all()
        .map((s) => [s.id, s.name]),
    );
    for (const c of changes) {
      if (c.toCents === 0) endSavingsPlan(tx, c.planId, addDays(c.from, -1), grouped);
      else changeSavingsPlan(tx, c.planId, { amountCents: c.toCents }, c.from, grouped);
    }
    const lines = changes.map(
      (c) =>
        `${names.get(c.securityId) ?? c.securityId}: ${eur(c.fromCents)} → ${eur(c.toCents)} ab ${c.from}`,
    );
    const item = insertTracked(
      tx,
      inboxItem,
      {
        id: randomUUID(),
        kind: 'other',
        title: 'Sparplan bei der Bank ändern',
        detail: lines.join('\n'),
        refType: 'savings_plan',
        refId: grouped.groupId,
      },
      grouped,
    );
    return { changes, inboxItemId: item.id, groupId: grouped.groupId };
  });
}
