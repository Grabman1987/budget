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
  /** Absent = monthly (rows from before the cadence column). */
  cadence?: PlanCadence;
  /** `days`: comma list "2,9,16,23" of days of the month, ascending. */
  daysOfMonth?: string | null;
  /** `weeks`: every N weeks (1-4), counted from `validFrom`. */
  intervalWeeks?: number | null;
  validFrom: string;
  /** Last day the row applies; `null` = open end. */
  validTo: string | null;
}

/** monthly = one day per month; days = several fixed days per month; weeks = every N weeks. */
export type PlanCadence = 'monthly' | 'days' | 'weeks';

/** The schedule part of a row (the anchor of `weeks` is `validFrom`). */
export type PlanSchedule = Pick<
  PlanRow,
  'dayOfMonth' | 'cadence' | 'daysOfMonth' | 'intervalWeeks' | 'validFrom'
>;

/** Parse "2, 9,16" into ascending unique days 1-31; throws on anything else. */
export function parseDaysOfMonth(value: string | null | undefined): number[] {
  const parts = (value ?? '').split(',').map((x) => x.trim());
  const days = parts.map((x) => (/^\d{1,2}$/.test(x) ? Number(x) : NaN));
  if (days.length === 0 || days.some((d) => !(d >= 1 && d <= 31)))
    throw new RangeError('Days of the month are a comma list of numbers from 1 to 31');
  const unique = [...new Set(days)].sort((a, b) => a - b);
  if (unique.length !== days.length) throw new RangeError('Days of the month must not repeat');
  return unique;
}

/** Normalised stored form of a day list ("2,9,16,23"). */
export const formatDaysOfMonth = (days: ReadonlyArray<number>): string => days.join(',');

/** All execution days of one schedule inside `month`, ascending (validity not applied). */
export function scheduleDatesIn(row: PlanSchedule, month: string): string[] {
  const cadence = row.cadence ?? 'monthly';
  if (cadence === 'days') {
    const dates = parseDaysOfMonth(row.daysOfMonth).map((d) => executionDate(month, d));
    return [...new Set(dates)].sort();
  }
  if (cadence === 'weeks') {
    const step = 7 * weeksOf(row);
    const first = `${month}-01`;
    const last = lastDayOfMonth(month);
    if (row.validFrom > last) return [];
    const skip = Math.max(0, Math.ceil(daysBetween(row.validFrom, first) / step));
    const out: string[] = [];
    for (let d = addDays(row.validFrom, skip * step); d <= last; d = addDays(d, step)) out.push(d);
    return out;
  }
  return [executionDate(month, row.dayOfMonth)];
}

function weeksOf(row: Pick<PlanRow, 'intervalWeeks'>): number {
  const n = row.intervalWeeks;
  if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 4)
    throw new RangeError('The interval is 1 to 4 weeks');
  return n as number;
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
    .flatMap((p) => scheduleDatesIn(p, month).map((date) => ({ p, date })))
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

/**
 * First execution day strictly after `today` (a plan that runs today has already run). A plain
 * number is the monthly day; a schedule may also be `days` or `weeks`.
 */
export function nextExecutionAfter(schedule: number | PlanSchedule, today: string): string {
  const row: PlanSchedule =
    typeof schedule === 'number' ? { dayOfMonth: schedule, validFrom: today } : schedule;
  const month = today.slice(0, 7);
  // Two months ahead always hold a day for days/monthly; weeks (<= 28 days) need at most one more.
  for (let m = month, i = 0; i < 3; m = addMonths(m, 1), i++) {
    const next = scheduleDatesIn(row, m).find((d) => d > today);
    if (next) return next;
  }
  throw new RangeError('No execution day found');
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
  // Buys per position, in their original order, so an execution only looks at its own position.
  const buysOf = new Map<string, Map<string, ExecutedBuy[]>>();
  for (const b of buys) {
    const bySecurity = buysOf.get(b.accountId) ?? new Map<string, ExecutedBuy[]>();
    buysOf.set(b.accountId, bySecurity);
    const list = bySecurity.get(b.securityId);
    if (list) list.push(b);
    else bySecurity.set(b.securityId, [b]);
  }
  ordered.forEach((e, index) => {
    for (const b of buysOf.get(e.accountId)?.get(e.securityId) ?? []) {
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
      from: nextExecutionAfter(row, today),
    });
  }
  return out;
}
