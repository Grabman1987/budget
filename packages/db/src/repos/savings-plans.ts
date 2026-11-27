import { allocationUniverse } from './allocation-inputs';
import { exposuresAsOf, singleAssetClass } from './asset-exposure';
import {
  addDays,
  cents,
  formatEuro,
  matchExecutions,
  planChanges,
  plannedExecutions,
  monthOf,
  addMonths,
  rowAppliesOn,
  parseDaysOfMonth,
  formatDaysOfMonth,
  type PlanCadence,
  savingsPlanProposal,
  type ExecutionCheck,
  type PlanChange,
  type PlanRow,
  type SavingsPlan,
  type SavingsPlanProposal,
  type AllocationQuality,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { account, inboxItem, savingsPlan, security, trade } from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { riskOf } from './portfolio-summary';
import { runInTransaction, type Executor } from './types';
import { memoizedShared } from './request-memo';
import { createTrade, createTradeWithCashTransfer, listTrades, type TradeInput } from './trades';

export type SavingsPlanRecord = typeof savingsPlan.$inferSelect;

export interface SavingsPlanInput {
  securityId: string;
  /** The investment account that holds the security (the buy settles there). */
  accountId: string;
  /** Where the money comes from (informational; the transfer is booked as it happens). */
  sourceAccountId?: string | null;
  amountCents: number;
  /** Monthly: the execution day (1-31). Ignored for the other rhythms (the repo derives it). */
  dayOfMonth?: number;
  /** Default monthly. */
  cadence?: PlanCadence;
  /** `days`: execution days of every month, e.g. [2, 9, 16, 23]. */
  daysOfMonth?: number[] | null;
  /** `weeks`: every N weeks (1-4), counted from `validFrom`. */
  intervalWeeks?: number | null;
  validFrom: string;
  note?: string | null;
}

export type SavingsPlanChange = Partial<
  Pick<
    SavingsPlanInput,
    | 'amountCents'
    | 'dayOfMonth'
    | 'cadence'
    | 'daysOfMonth'
    | 'intervalWeeks'
    | 'sourceAccountId'
    | 'note'
  >
>;

const toRow = (r: SavingsPlanRecord): PlanRow => ({
  id: r.id,
  securityId: r.securityId,
  accountId: r.accountId,
  amountCents: r.amountCents,
  dayOfMonth: r.dayOfMonth,
  cadence: r.cadence,
  daysOfMonth: r.daysOfMonth,
  intervalWeeks: r.intervalWeeks,
  validFrom: r.validFrom,
  validTo: r.validTo,
});

const isMonthly = (r: { cadence?: string | undefined }): boolean =>
  (r.cadence ?? 'monthly') === 'monthly';

interface ScheduleFields {
  cadence: PlanCadence;
  dayOfMonth: number;
  daysOfMonth: string | null;
  intervalWeeks: number | null;
}

/**
 * Validate the rhythm and return the stored columns: exactly the fields of the chosen cadence are
 * set. `day_of_month` stays a valid day for the other rhythms (first listed day / start day).
 */
function scheduleFields(
  v: {
    cadence?: PlanCadence | undefined;
    dayOfMonth?: number | null | undefined;
    daysOfMonth?: number[] | null | undefined;
    intervalWeeks?: number | null | undefined;
  },
  validFrom: string,
): ScheduleFields {
  const cadence = v.cadence ?? 'monthly';
  if (cadence === 'days') {
    if (!v.daysOfMonth?.length) throw new RangeError('Days of the month are required');
    const days = parseDaysOfMonth(v.daysOfMonth.join(','));
    if (v.daysOfMonth.some((d, i) => d !== days[i]))
      throw new RangeError('Days of the month must be ascending and unique');
    return {
      cadence,
      dayOfMonth: days[0]!,
      daysOfMonth: formatDaysOfMonth(days),
      intervalWeeks: null,
    };
  }
  if (cadence === 'weeks') {
    const n = v.intervalWeeks;
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 4)
      throw new RangeError('The interval is 1 to 4 weeks');
    return {
      cadence,
      dayOfMonth: Number(validFrom.slice(8, 10)),
      daysOfMonth: null,
      intervalWeeks: n as number,
    };
  }
  if (cadence !== 'monthly') throw new RangeError('The rhythm is monthly, days or weeks');
  const day = v.dayOfMonth;
  if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 31)
    throw new RangeError('The day of the month is 1 to 31');
  return { cadence, dayOfMonth: day as number, daysOfMonth: null, intervalWeeks: null };
}

function assertAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
    throw new RangeError('The rate must be a positive whole number of cents');
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
  assertAmount(input.amountCents);
  const schedule = scheduleFields(input, input.validFrom);
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
        ...schedule,
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
    const startsOn = from <= cur.validFrom ? cur.validFrom : from;
    const schedule = scheduleFields(
      {
        cadence: change.cadence ?? cur.cadence,
        dayOfMonth: change.dayOfMonth ?? cur.dayOfMonth,
        daysOfMonth:
          change.daysOfMonth !== undefined
            ? change.daysOfMonth
            : cur.daysOfMonth
              ? parseDaysOfMonth(cur.daysOfMonth)
              : null,
        intervalWeeks:
          change.intervalWeeks !== undefined ? change.intervalWeeks : cur.intervalWeeks,
      },
      startsOn,
    );
    const merged = {
      amountCents: change.amountCents ?? cur.amountCents,
      ...schedule,
      sourceAccountId:
        change.sourceAccountId !== undefined ? change.sourceAccountId : cur.sourceAccountId,
      note: change.note !== undefined ? change.note : cur.note,
    };
    assertAmount(merged.amountCents);
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
  const monthlyPlan = new Set(rows.filter(isMonthly).map((r) => r.id));
  const buys = db
    .select({
      id: trade.id,
      securityId: trade.securityId,
      accountId: trade.accountId,
      date: trade.date,
      amountCents: trade.amountCents,
      feeCents: trade.feeCents,
      savingsMonth: trade.savingsMonth,
    })
    .from(trade)
    .where(and(isNull(trade.deletedAt), eq(trade.kind, 'buy')))
    .all();
  return matchExecutions(
    planned,
    buys.filter((b) => !b.savingsMonth),
    today,
  ).map((execution) => {
    // Only a monthly plan has one explicit slot per month; the others are matched automatically.
    const explicit = !monthlyPlan.has(execution.planId)
      ? undefined
      : buys.find(
          (b) =>
            b.savingsMonth === month &&
            b.securityId === execution.securityId &&
            b.accountId === execution.accountId,
        );
    return explicit ? { ...execution, status: 'executed', tradeId: explicit.id } : execution;
  });
}

export interface SavingsExecutionProposal {
  type: 'savings';
  id: string;
  kind: 'revision';
  urgent: false;
  planId: string;
  month: string;
  /** Non-monthly plans have several executions a month and no month slot (matched by `date`). */
  cadence: PlanCadence;
  securityId: string;
  accountId: string;
  securityName: string;
  accountName: string;
  sourceAccountName: string | null;
  currency: string;
  date: string;
  amountCents: number;
}

/** Read-only monthly proposals. Never creates a trade, booking or bank instruction. */
export function savingsExecutionProposals(db: Executor, today: string): SavingsExecutionProposal[] {
  const rows = listSavingsPlans(db, { includeEnded: true });
  const currentMonth = monthOf(today);
  // All live trades, read once per request (only filtered and matched here, never changed).
  const trades = memoizedShared(db, 'allLiveTrades', () => listTrades(db));
  const buys = trades.filter((t) => t.kind === 'buy' && !t.savingsMonth);
  // Trades that already carry a savings month, by (month, security, account).
  const slot = (month: string, securityId: string, accountId: string) =>
    JSON.stringify([month, securityId, accountId]);
  const booked = new Set(
    trades.flatMap((t) =>
      t.savingsMonth ? [slot(t.savingsMonth, t.securityId, t.accountId)] : [],
    ),
  );
  const months = new Set<string>();
  for (const row of rows) {
    for (
      let month = monthOf(row.validFrom);
      month <= currentMonth && month <= monthOf(row.validTo ?? today);
      month = addMonths(month, 1)
    )
      months.add(month);
  }
  const planned = [...months].sort().flatMap((month) => plannedExecutions(rows.map(toRow), month));
  const monthlyPlan = new Set(rows.filter(isMonthly).map((r) => r.id));
  const pending = planned.filter(
    (e) =>
      !monthlyPlan.has(e.planId) || !booked.has(slot(monthOf(e.date), e.securityId, e.accountId)),
  );
  const plannedPerSlot = new Map<string, number>();
  for (const e of planned) {
    if (!monthlyPlan.has(e.planId)) continue;
    const key = slot(monthOf(e.date), e.securityId, e.accountId);
    plannedPerSlot.set(key, (plannedPerSlot.get(key) ?? 0) + 1);
  }
  // Match the complete timeline once so one buy cannot fulfil adjacent monthly windows twice.
  const executions = matchExecutions(pending, buys, today).map((e) => ({
    ...e,
    month: monthOf(e.date),
  }));
  const securities = db.select().from(security).where(isNull(security.deletedAt)).all();
  const accounts = db.select().from(account).where(isNull(account.deletedAt)).all();
  return executions.flatMap((execution) => {
    if (execution.date > today || execution.status === 'executed') return [];
    const plan = rows.find((r) => r.id === execution.planId)!;
    const monthly = isMonthly(plan);
    // Overlapping versions cannot be interpreted as two monthly purchases.
    const key = slot(execution.month, execution.securityId, execution.accountId);
    if (monthly && plannedPerSlot.get(key) !== 1) return [];
    if (monthly && booked.has(key)) return [];
    const sec = securities.find((s) => s.id === execution.securityId);
    const acct = accounts.find((a) => a.id === execution.accountId);
    if (!sec || !acct || acct.closedAt || acct.role !== 'investment') return [];
    return [
      {
        type: 'savings' as const,
        id: `savings:${plan.id}:${monthly ? execution.month : execution.date}`,
        kind: 'revision' as const,
        urgent: false as const,
        planId: plan.id,
        month: execution.month,
        cadence: plan.cadence,
        securityId: sec.id,
        accountId: acct.id,
        securityName: sec.name,
        accountName: acct.name,
        sourceAccountName: accounts.find((a) => a.id === plan.sourceAccountId)?.name ?? null,
        currency: acct.currency,
        date: execution.date,
        amountCents: execution.amountCents,
      },
    ];
  });
}

/** Recheck the current proposal inside the same savepoint as trade/cash/audit creation. */
export function confirmSavingsExecution(
  db: Executor,
  planId: string,
  month: string,
  today: string,
  input: Pick<TradeInput, 'date' | 'unitsE8' | 'amountCents' | 'feeCents' | 'note'> & {
    plannedAmountCents: number;
    plannedDate: string;
    plannedCurrency: string;
    /** Broker confirmation reference (#1099): makes a repeated confirmation a no-op. */
    importKey?: string | null | undefined;
    /** Owner-chosen Verrechnungskonto: the trade then comes with its counter booking. */
    settlementAccountId?: string | null | undefined;
  },
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const proposal = savingsExecutionProposals(tx, today).find(
      (p) =>
        p.planId === planId &&
        p.month === month &&
        // Several executions a month: the planned day tells them apart.
        (p.cadence === 'monthly' || p.date === input.plannedDate),
    );
    if (!proposal)
      throw new ConflictError('Der Sparplanvorschlag ist nicht mehr offen. Bitte neu laden.');
    if (
      proposal.amountCents !== input.plannedAmountCents ||
      proposal.date !== input.plannedDate ||
      proposal.currency !== input.plannedCurrency
    )
      throw new ConflictError('Der Sparplan wurde geändert. Bitte den neuen Vorschlag prüfen.');
    if (
      input.date > today ||
      input.date < addDays(proposal.date, -3) ||
      input.date > addDays(proposal.date, 3)
    )
      throw new RangeError(
        'Ausführungsdatum muss innerhalb von drei Tagen des Vorschlags liegen und darf nicht in der Zukunft liegen.',
      );
    const trade: TradeInput = {
      securityId: proposal.securityId,
      accountId: proposal.accountId,
      kind: 'buy',
      date: input.date,
      unitsE8: input.unitsE8 ?? 0,
      amountCents: input.amountCents,
      feeCents: input.feeCents ?? 0,
      importKey: input.importKey ?? null,
      note: input.note ?? null,
      // One explicit slot per plan and month exists for monthly plans only.
      ...(proposal.cadence === 'monthly' ? { savingsPlanId: planId, savingsMonth: month } : {}),
    };
    const result = input.settlementAccountId
      ? createTradeWithCashTransfer(tx, trade, input.settlementAccountId, grouped)
      : { ...createTrade(tx, trade, grouped), transferId: null };
    return { ...result, groupId: grouped.groupId };
  });
}

/** Proposed rates are whole multiples of this (50 €, as in the prototype: 300 and 100). */
export const SAVINGS_PLAN_STEP_CENTS = 5_000;

export interface ProposalView extends SavingsPlanProposal {
  quality: AllocationQuality;
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
  const risk = riskOf(db, today);
  const names = new Map(
    db
      .select({
        id: security.id,
        name: security.name,
        kind: security.kind,
        leverageFactor: security.leverageFactor,
      })
      .from(security)
      .all()
      .map((s) => [s.id, s]),
  );
  const exposures = exposuresAsOf(db, today);
  const platforms = new Map(
    db
      .select({ id: account.id, institutionId: account.institutionId })
      .from(account)
      .all()
      .map((a) => [a.id, a.institutionId]),
  );
  // Rebalancing works on one monthly rate per plan; weekly and multi-day plans stay as they are.
  const basis = listSavingsPlans(db).filter(isMonthly);
  const universe = allocationUniverse(db);
  const plans: SavingsPlan[] = basis.flatMap((r) => {
    const sec = names.get(r.securityId);
    return sec
      ? [
          {
            id: r.id,
            inScope:
              universe.accounts.some((a) => a.id === r.accountId) &&
              universe.securities.some((s) => s.id === r.securityId),
            securityId: sec.id,
            platform: platforms.get(r.accountId) ?? null,
            name: sec.name,
            kind: sec.kind,
            leverageFactor: sec.leverageFactor,
            assetClass: singleAssetClass(exposures.get(sec.id)?.weights ?? []),
            exposures: exposures.get(sec.id)?.weights ?? [],
            monthlyCents: r.amountCents,
          },
        ]
      : [];
  });
  const proposal = savingsPlanProposal(plans, risk.allocation, {
    quality: risk.quality,
    speculativeBreached: risk.speculative.breach,
    cluster: risk.cluster,
    stepCents: options.stepCents ?? SAVINGS_PLAN_STEP_CENTS,
  });
  return { ...proposal, basis, quality: risk.quality };
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
