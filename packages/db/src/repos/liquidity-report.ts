import {
  addDays,
  horizonDays,
  liquidityReport,
  PriceUnavailableError,
  plannedEventOccurrences,
  type EventRecurrence,
  type LiquidityHorizon,
  type LiquidityLeverId,
  type LiquidityReport,
} from '@budget/domain';
import { asc, isNull } from 'drizzle-orm';
import { account, category, plannedEvent } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { createEntity, getEntity, restoreEntity, softDeleteEntity, updateEntity } from './entities';
import { CategoryRuleError, EntityNotFoundError, MissingFxRateError } from './errors';
import { netWorthValuationAsOf } from './portfolio';
import { forecastInputs, loadFacts } from './rule-inputs';
import { runInTransaction, type Executor } from './types';

/**
 * Report 3.1 Liquiditätsprognose: reads what the forecast needs from the ledger (the same
 * `forecastInputs` as rule R07 and the Heute chart: start balance of the budget accounts, expected
 * payments, planned events, planned variable spending) and hands it to `liquidityReport`. The
 * planned events live in the `planned_event` table; their writes are audited and undoable.
 */

type EventRow = typeof plannedEvent.$inferSelect;

export type PlannedEventStatus =
  'in_horizon' | 'later' | 'past' | 'off_budget' | 'disabled' | 'unknown_account';

export interface PlannedEventView {
  id: string;
  name: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** Signed cents: expense negative, income positive. */
  amountCents: number;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  recurrence: EventRecurrence;
  recurrenceMonths: number[];
  recurrenceUntil: string | null;
  enabled: boolean;
  note: string | null;
  status: PlannedEventStatus;
}

export interface LiquidityReportView {
  asOf: string;
  /** False without a budget account: there is nothing to forecast. */
  available: boolean;
  report: LiquidityReport | null;
  events: PlannedEventView[];
  overdraftLimitCents: number;
  budgetAccounts: { id: string; name: string }[];
}

export interface LiquidityReportOptions {
  horizon: LiquidityHorizon;
  levers: ReadonlyArray<LiquidityLeverId>;
}

/** Calendar plans can be read even when unrelated holdings cannot be valued. */
export function plannedEventsView(db: Executor, asOf: string, horizon = 365): PlannedEventView[] {
  const accounts = db.select().from(account).where(isNull(account.deletedAt)).all();
  const categories = db.select().from(category).where(isNull(category.deletedAt)).all();
  return db
    .select()
    .from(plannedEvent)
    .where(isNull(plannedEvent.deletedAt))
    .orderBy(asc(plannedEvent.date), asc(plannedEvent.name), asc(plannedEvent.id))
    .all()
    .map((e) => {
      const a = accounts.find((a) => a.id === e.accountId);
      const next = plannedEventOccurrences(e, addDays(asOf, 1), addDays(asOf, horizon));
      const nextStart = e.date > asOf ? e.date : addDays(asOf, 1);
      const nextEnd = nextStart >= '9998-12-31' ? '9999-12-31' : addDays(nextStart, 366);
      const hasFuture = plannedEventOccurrences(e, nextStart, nextEnd).length > 0;
      const status: PlannedEventStatus = !e.enabled
        ? 'disabled'
        : e.accountId !== null && !a
          ? 'unknown_account'
          : a &&
              (!a.onBudget || a.role !== 'budget' || a.openingDate > asOf || a.currency !== 'EUR')
            ? 'off_budget'
            : next.length
              ? 'in_horizon'
              : hasFuture
                ? 'later'
                : 'past';
      return {
        id: e.id,
        name: e.name,
        date: e.date,
        amountCents: e.amountCents,
        accountId: e.accountId,
        accountName: a?.name ?? null,
        categoryId: e.categoryId,
        categoryName: categories.find((c) => c.id === e.categoryId)?.name ?? null,
        enabled: e.enabled,
        note: e.note,
        recurrence: e.recurrence,
        recurrenceMonths: e.recurrenceMonths,
        recurrenceUntil: e.recurrenceUntil,
        status,
      };
    });
}

export function plannedEventAccounts(db: Executor, asOf: string) {
  return db
    .select()
    .from(account)
    .where(isNull(account.deletedAt))
    .all()
    .filter(
      (a) => a.onBudget && a.role === 'budget' && a.currency === 'EUR' && a.openingDate <= asOf,
    )
    .map(({ id, name, type, onBudget, sortOrder, closedAt }) => ({
      id,
      name,
      type,
      onBudget,
      sortOrder,
      closedAt,
    }));
}

export function liquidityReportView(
  db: Executor,
  asOf: string,
  options: LiquidityReportOptions,
): LiquidityReportView {
  const facts = loadFacts(db, asOf);
  const live = facts.accounts.filter((a) => a.openingDate <= asOf);
  const budgetAccounts = live.filter((a) => a.onBudget && a.role === 'budget');
  const hDays = horizonDays(options.horizon, asOf);
  const events = plannedEventsView(db, asOf, hDays);
  const accounts = budgetAccounts.map((a) => ({ id: a.id, name: a.name }));
  if (budgetAccounts.length === 0)
    return {
      asOf,
      available: false,
      report: null,
      events,
      overdraftLimitCents: 0,
      budgetAccounts: accounts,
    };

  // Only the budget accounts feed the forecast: an unknown depot price cannot block it.
  const valuation = netWorthValuationAsOf(db, asOf);
  const byAccount = Object.fromEntries(
    budgetAccounts.map((a) => {
      const value =
        valuation.byAccount[a.id] ?? (Object.hasOwn(valuation.byAccount, a.id) ? null : 0);
      if (value === null) {
        const currency = valuation.missingFxByAccount[a.id]?.[0];
        if (currency) throw new MissingFxRateError(currency, asOf);
        throw new PriceUnavailableError(a.id, valuation.missingPriceByAccount[a.id]![0]!, asOf);
      }
      return [a.id, value];
    }),
  );
  const inputs = forecastInputs(facts, asOf, { byAccount });
  const report = liquidityReport({
    startDay: inputs.startDay,
    startCents: inputs.startCents,
    items: inputs.items.filter((i) => i.kind !== 'event'),
    events: inputs.items.filter((i) => i.kind === 'event'),
    variableMonthlyCents: inputs.variableMonthlyCents,
    horizon: options.horizon,
    levers: options.levers,
  });
  return {
    asOf,
    available: true,
    report,
    events,
    overdraftLimitCents: inputs.overdraftLimitCents,
    budgetAccounts: accounts,
  };
}

// ---- planned events (Geplantes Ereignis) ----

export interface PlannedEventInput {
  name: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** Signed cents, not zero. */
  amountCents: number;
  accountId?: string | null;
  enabled?: boolean;
  note?: string | null;
  categoryId?: string | null;
  recurrence?: EventRecurrence;
  recurrenceMonths?: number[];
  recurrenceUntil?: string | null;
}
export type PlannedEventPatch = Partial<PlannedEventInput>;

const cleanName = (name: string): string => {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean === '') throw new CategoryRuleError('Das Ereignis braucht einen Namen.');
  return clean;
};

function checkEvent(
  db: Executor,
  e: Pick<
    EventRow,
    | 'amountCents'
    | 'accountId'
    | 'categoryId'
    | 'date'
    | 'recurrence'
    | 'recurrenceMonths'
    | 'recurrenceUntil'
  >,
): void {
  if (e.amountCents === 0) throw new CategoryRuleError('Der Betrag muss ungleich 0 sein.');
  if (e.accountId !== null) {
    const a = getEntity(db, account, e.accountId);
    if (!a) throw new EntityNotFoundError('account', e.accountId);
    if (!a.onBudget || a.role !== 'budget' || a.currency !== 'EUR')
      throw new CategoryRuleError('Ein Ereignis gehört zu einem EUR-Budget-Konto.');
  }
  if (e.categoryId !== null && !getEntity(db, category, e.categoryId))
    throw new EntityNotFoundError('category', e.categoryId);
  if (e.recurrenceUntil !== null && e.recurrenceUntil < e.date)
    throw new CategoryRuleError('Das Ende darf nicht vor dem Beginn liegen.');
  if (e.recurrence === 'months' && e.recurrenceMonths.length === 0)
    throw new CategoryRuleError('Bitte mindestens einen Monat auswählen.');
  if (e.recurrence !== 'months' && e.recurrenceMonths.length !== 0)
    throw new CategoryRuleError('Monate gehören nur zur Wiederholung in bestimmten Monaten.');
}

export function createPlannedEvent(
  db: Executor,
  input: PlannedEventInput,
  ctx: AuditContext,
): { event: EventRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const values = {
      name: cleanName(input.name),
      date: input.date,
      amountCents: input.amountCents,
      accountId: input.accountId ?? null,
      enabled: input.enabled ?? true,
      note: input.note ?? null,
      categoryId: input.categoryId ?? null,
      recurrence: input.recurrence ?? 'once',
      recurrenceMonths: input.recurrenceMonths ?? [],
      recurrenceUntil: input.recurrenceUntil ?? null,
    };
    checkEvent(tx, values);
    return {
      event: createEntity(tx, plannedEvent, values, grouped),
      groupId: grouped.groupId,
    };
  });
}

export function updatePlannedEvent(
  db: Executor,
  id: string,
  patch: PlannedEventPatch,
  ctx: AuditContext,
): { event: EventRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = getEntity(tx, plannedEvent, id);
    if (!current) throw new EntityNotFoundError('planned_event', id);
    checkEvent(tx, { ...current, ...patch });
    const clean = {
      ...(patch.name !== undefined && { name: cleanName(patch.name) }),
      ...(patch.date !== undefined && { date: patch.date }),
      ...(patch.amountCents !== undefined && { amountCents: patch.amountCents }),
      ...(patch.accountId !== undefined && { accountId: patch.accountId }),
      ...(patch.enabled !== undefined && { enabled: patch.enabled }),
      ...(patch.note !== undefined && { note: patch.note }),
      ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
      ...(patch.recurrence !== undefined && { recurrence: patch.recurrence }),
      ...(patch.recurrenceMonths !== undefined && { recurrenceMonths: patch.recurrenceMonths }),
      ...(patch.recurrenceUntil !== undefined && { recurrenceUntil: patch.recurrenceUntil }),
    };
    return {
      event: updateEntity(tx, plannedEvent, id, clean, grouped),
      groupId: grouped.groupId,
    };
  });
}

export function deletePlannedEvent(
  db: Executor,
  id: string,
  ctx: AuditContext,
): { groupId: string } {
  const grouped = withGroup(ctx);
  softDeleteEntity(db, plannedEvent, id, grouped);
  return { groupId: grouped.groupId };
}

export function restorePlannedEvent(
  db: Executor,
  id: string,
  ctx: AuditContext,
): { event: EventRow; groupId: string } {
  const grouped = withGroup(ctx);
  return { event: restoreEntity(db, plannedEvent, id, grouped), groupId: grouped.groupId };
}

/** Kept for the type of rows the API sends back after a write. */
export type PlannedEventRow = EventRow;
