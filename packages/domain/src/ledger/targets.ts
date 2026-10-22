import { addMonths, lastDayOfMonth, monthOf, monthsBetween } from '../date';

/**
 * Category targets (Ziel je Kategorie, concept §5.1) and the money-flow waterfall (SPEC §4).
 * Pure: the budget API reports `targetNeed` per envelope, Plan › Monat pours "Zu verteilen" into
 * the needs with `waterfallFill`, stage by stage.
 */

export type TargetKind = 'monthly' | 'by_date' | 'keep_balance';

export interface CategoryTarget {
  kind: TargetKind;
  amountCents: number;
  /** Rhythm of a `monthly` target: the amount is due every n months (1 = every month). */
  everyMonths: number;
  /** `YYYY-MM-DD`: the date of a `by_date` target, or a due date of a rhythm > 1 month. */
  targetDate: string | null;
  /** Optional ISO weekday (Monday=1 through Sunday=7): weekly set-aside, never refill. */
  weeklyDay?: number | null;
  /** Read-only category/month intent supplied from the audited snooze records. */
  snoozedMonths?: ReadonlyArray<string>;
}

export interface TargetEnvelope {
  /** `YYYY-MM` */
  month: string;
  carryCents: number;
  assignedCents: number;
  /**
   * Refill up to the amount (spending envelopes, YNAB "refill up to"): what is carried in counts.
   * Otherwise the amount is set aside every month (fixed costs, savings, investing).
   */
  refill: boolean;
}

export interface TargetNeed {
  /** What the envelope should receive this month in total (0 when nothing is due). */
  goalCents: number;
  /** What is still to assign this month to meet the target (never negative). */
  needCents: number;
  /** Month the target is (next) due, when it has a date. */
  dueMonth: string | null;
}

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);

/** Count an ISO weekday in the actual calendar month, independently of local time zones. */
export function weeklyOccurrences(month: string, weekday: number): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(weekday) || weekday < 1 || weekday > 7)
    throw new RangeError('Invalid weekly target month or ISO weekday');
  const first = new Date(`${month}-01T00:00:00Z`).getUTCDay() || 7;
  const days = Number(lastDayOfMonth(month).slice(8, 10));
  return 1 + Math.floor((days - 1 - (weekday - first + 7) % 7) / 7);
}

/** Months from `month` to `due` including both ends; 1 when `due` has passed. */
function monthsLeft(month: string, due: string): number {
  return due < month ? 1 : monthsBetween(month, due).length;
}

/**
 * What a target asks of one month:
 * - `keep_balance`: carry + assigned should reach the amount;
 * - `by_date`: the rest (amount − carry) spread evenly over the months up to the target month;
 * - `monthly`, every month: the amount (refill: amount − carry);
 * - `monthly`, every n months with a due date: like `by_date` for the next due month (the due
 *   date repeats every n months); without a date: a twelfth-style share `amount / n` per month.
 * Shares are rounded up to whole cents, so the target is always met in time.
 */
export function targetNeed(target: CategoryTarget, envelope: TargetEnvelope): TargetNeed {
  const { month, carryCents, assignedCents } = envelope;
  if (target.snoozedMonths?.includes(month)) return { goalCents: 0, needCents: 0, dueMonth: null };
  const amount = target.amountCents;
  const result = (goal: number, dueMonth: string | null): TargetNeed => {
    const goalCents = Math.max(0, goal);
    return { goalCents, needCents: Math.max(0, goalCents - assignedCents), dueMonth };
  };
  if (target.weeklyDay != null) {
    if (target.kind !== 'monthly' || target.everyMonths !== 1 || target.targetDate !== null ||
      !Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Invalid weekly set-aside target');
    const gross = amount * weeklyOccurrences(month, target.weeklyDay);
    if (!Number.isSafeInteger(gross)) throw new RangeError('Weekly target exceeds safe cents');
    return result(gross, null);
  }
  if (target.kind === 'keep_balance') return result(amount - carryCents, null);
  if (target.kind === 'by_date') {
    const due = monthOf(target.targetDate ?? `${month}-01`);
    const rest = Math.max(0, amount - carryCents);
    return result(ceilDiv(rest, monthsLeft(month, due)), due);
  }
  const every = Math.max(1, target.everyMonths);
  if (every === 1) return result(envelope.refill ? amount - carryCents : amount, null);
  if (target.targetDate === null) return result(ceilDiv(amount, every), null);
  let due = monthOf(target.targetDate);
  while (due < month) due = addMonths(due, every);
  const rest = Math.max(0, amount - carryCents);
  return result(ceilDiv(rest, monthsLeft(month, due)), due);
}

export interface WaterfallRow {
  id: string;
  /** Waterfall stage 1–9; rows without a stage come last. */
  stage: number | null;
  /** Position of the category's group in the list (0 when the rows are one list already). */
  groupOrder?: number;
  /** Position of the category within its group. */
  sortOrder: number;
  needCents: number;
}

/** Rows in waterfall order: stage, then the order of the category list (group, then category). */
export function waterfallOrder<T extends Pick<WaterfallRow, 'stage' | 'groupOrder' | 'sortOrder'>>(
  rows: ReadonlyArray<T>,
): T[] {
  return [...rows].sort(
    (a, b) =>
      (a.stage ?? 10) - (b.stage ?? 10) ||
      (a.groupOrder ?? 0) - (b.groupOrder ?? 0) ||
      a.sortOrder - b.sortOrder,
  );
}

/**
 * Pour `amountCents` top-down through the needs (stage 1 first, then by category order) until it
 * runs out. Returns the amount per row id; rows that get nothing are left out.
 */
export function waterfallFill(
  rows: ReadonlyArray<WaterfallRow>,
  amountCents: number,
): Record<string, number> {
  let left = Math.max(0, amountCents);
  const out: Record<string, number> = {};
  for (const row of waterfallOrder(rows)) {
    const v = Math.min(Math.max(0, row.needCents), left);
    if (v > 0) {
      out[row.id] = v;
      left -= v;
    }
  }
  return out;
}
