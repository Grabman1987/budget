import { addDays, addMonths, daysBetween, lastDayOfMonth } from '../date';

/**
 * Savings plans (Sparpläne): planned executions of a month, the check against the executed buys,
 * and the next day a changed rate takes effect. The bank executes a plan; the app only plans and
 * checks. Pure: money in integer cents, days as `YYYY-MM-DD`.
 */

/** One row of `savings_plan`: a rate that applies from `validFrom` to `validTo` (inclusive). */
export interface PlanRow {
  id: string;
  securityId: string;
  accountId: string;
  amountCents: number;
  dayOfMonth: number;
  validFrom: string;
  /** Last day the row applies; `null` = open end. */
  validTo: string | null;
}

export interface PlannedExecution {
  planId: string;
  securityId: string;
  accountId: string;
  date: string;
  amountCents: number;
}

/** Execution day of a plan in `month` (`YYYY-MM`); day 31 in a shorter month is the last day. */
export function executionDate(month: string, dayOfMonth: number): string {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)
    throw new RangeError(`day of month must be 1-31, got ${String(dayOfMonth)}`);
  const last = Number(lastDayOfMonth(month).slice(8, 10));
  return `${month}-${String(Math.min(dayOfMonth, last)).padStart(2, '0')}`;
}

/** Does the row apply on `day`? */
export const rowAppliesOn = (row: PlanRow, day: string): boolean =>
  row.validFrom <= day && (row.validTo === null || day <= row.validTo);

/**
 * Executions planned in `month`: every row that applies on its execution day of that month, in
 * date order (ties by plan id). A rate change starting after the execution day does not touch it.
 */
export function plannedExecutions(
  plans: ReadonlyArray<PlanRow>,
  month: string,
): PlannedExecution[] {
  return plans
    .map((p) => ({ p, date: executionDate(month, p.dayOfMonth) }))
    .filter(({ p, date }) => rowAppliesOn(p, date))
    .map(({ p, date }) => ({
      planId: p.id,
      securityId: p.securityId,
      accountId: p.accountId,
      date,
      amountCents: p.amountCents,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.planId.localeCompare(b.planId));
}

/** First execution day strictly after `today` (a plan that runs today has already run). */
export function nextExecutionAfter(dayOfMonth: number, today: string): string {
  const month = today.slice(0, 7);
  const thisMonth = executionDate(month, dayOfMonth);
  return thisMonth > today ? thisMonth : executionDate(addMonths(month, 1), dayOfMonth);
}

/** An executed buy, as far as matching needs it. */
export interface ExecutedBuy {
  id: string;
  securityId: string;
  accountId: string;
  date: string;
  amountCents: number;
  feeCents: number;
}

export type ExecutionStatus = 'executed' | 'missing' | 'upcoming';

export interface ExecutionCheck extends PlannedExecution {
  status: ExecutionStatus;
  /** The buy that fulfils the plan, `null` unless executed. */
  tradeId: string | null;
}

/** A buy counts for an execution up to this many days before or after the planned day. */
export const MATCH_WINDOW_DAYS = 3;
/** Slack in cents on top of the fee when comparing the planned amount with a buy. */
export const MATCH_TOLERANCE_CENTS = 100;

/**
 * Check planned executions against buys of the same security and account within ±3 days. The
 * bank debits the planned amount, so a buy fits when the plan lies between its gross amount and
 * gross plus fee (fee inside or on top), give or take `toleranceCents`. A buy fulfils one
 * execution; the nearest day wins. Unmatched executions are `upcoming` until the window has
 * passed, then `missing` ("fehlt").
 */
export function matchExecutions(
  planned: ReadonlyArray<PlannedExecution>,
  buys: ReadonlyArray<ExecutedBuy>,
  today: string,
  toleranceCents: number = MATCH_TOLERANCE_CENTS,
): ExecutionCheck[] {
  const ordered = [...planned].sort(
    (a, b) => a.date.localeCompare(b.date) || a.planId.localeCompare(b.planId),
  );
  // Candidate pairs, nearest day first; each execution and each buy is used once.
  const pairs: { index: number; buy: ExecutedBuy; distance: number }[] = [];
  ordered.forEach((e, index) => {
    for (const b of buys) {
      if (b.securityId !== e.securityId || b.accountId !== e.accountId) continue;
      const distance = Math.abs(daysBetween(e.date, b.date));
      if (distance > MATCH_WINDOW_DAYS) continue;
      const fits =
        e.amountCents >= b.amountCents - toleranceCents &&
        e.amountCents <= b.amountCents + b.feeCents + toleranceCents;
      if (fits) pairs.push({ index, buy: b, distance });
    }
  });
  pairs.sort(
    (x, y) => x.distance - y.distance || x.index - y.index || x.buy.date.localeCompare(y.buy.date),
  );
  const matched = new Map<number, string>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (matched.has(p.index) || used.has(p.buy.id)) continue;
    matched.set(p.index, p.buy.id);
    used.add(p.buy.id);
  }
  return ordered.map((e, index) => {
    const tradeId = matched.get(index);
    if (tradeId !== undefined) return { ...e, status: 'executed', tradeId };
    const status = today > addDays(e.date, MATCH_WINDOW_DAYS) ? 'missing' : 'upcoming';
    return { ...e, status, tradeId: null };
  });
}

export interface PlanChange {
  planId: string;
  securityId: string;
  accountId: string;
  fromCents: number;
  /** 0 = the plan stops (the row is ended, no new row starts). */
  toCents: number;
  /** First execution day of the new rate (the bank changes nothing before). */
  from: string;
}

/**
 * Rate changes of a proposal: only plans whose proposed rate differs, each from its next
 * execution day after `today`. Plans missing in `proposed` stay as they are.
 */
export function planChanges(
  rows: ReadonlyArray<PlanRow>,
  proposed: ReadonlyArray<{ id: string; proposedCents: number }>,
  today: string,
): PlanChange[] {
  const out: PlanChange[] = [];
  for (const row of rows) {
    const p = proposed.find((x) => x.id === row.id);
    if (!p || p.proposedCents === row.amountCents) continue;
    if (!Number.isSafeInteger(p.proposedCents) || p.proposedCents < 0)
      throw new RangeError('A proposed rate must be a whole number of cents, 0 or more');
    out.push({
      planId: row.id,
      securityId: row.securityId,
      accountId: row.accountId,
      fromCents: row.amountCents,
      toCents: p.proposedCents,
      from: nextExecutionAfter(row.dayOfMonth, today),
    });
  }
  return out;
}
