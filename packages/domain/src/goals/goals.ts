import { addMonths, monthOf, monthsBetween } from '../date';

/**
 * Savings goals (Sparziele, concept §7.2): progress, months left, the monthly rate a goal needs and
 * a forecast from what was really set aside lately. Pure, integer cents, one function per figure.
 * All figures are relative to the viewed month `YYYY-MM`: the saved amount is the state at the end
 * of that month (it already contains that month's assignment), so the months that are still to come
 * are the ones after it.
 */

export type GoalStatus = 'reached' | 'on_track' | 'behind';

/** Months whose average assignment drives the forecast. */
export const GOAL_FORECAST_MONTHS = 3;

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);

/** What is still missing to the target (never negative). */
export const remainingCents = (targetCents: number, savedCents: number): number =>
  Math.max(0, targetCents - savedCents);

/**
 * Months still to save in after `month`, up to and including the month of the target date; at
 * least 1 (a goal that is due or overdue wants the rest at once). `null` without a target date.
 */
export function monthsLeft(month: string, targetDate: string | null): number | null {
  if (targetDate === null) return null;
  const due = monthOf(targetDate);
  return due <= month ? 1 : monthsBetween(month, due).length - 1;
}

/** The monthly rate that reaches the target in time, rounded up to whole cents. */
export function neededMonthlyCents(remaining: number, months: number): number {
  return remaining <= 0 ? 0 : ceilDiv(remaining, Math.max(1, months));
}

/**
 * Average of the last `GOAL_FORECAST_MONTHS` values (what was assigned to the envelope, or how
 * much the account grew), rounded to the nearest cent. Fewer values average over what exists.
 */
export function averageRateCents(monthly: readonly number[]): number {
  const last = monthly.slice(-GOAL_FORECAST_MONTHS);
  if (last.length === 0) return 0;
  return Math.round(last.reduce((a, v) => a + v, 0) / last.length);
}

/**
 * The month the goal is full when saving continues at `rateCents` a month: `month` itself when
 * nothing is missing, `null` when the rate is zero or negative.
 */
export function forecastMonth(month: string, remaining: number, rateCents: number): string | null {
  if (remaining <= 0) return month;
  if (rateCents <= 0) return null;
  return addMonths(month, ceilDiv(remaining, rateCents));
}

/**
 * Reached when the target is met. Otherwise "im Plan" when the forecast is full by the month of
 * the target date (without a date: whenever it fills at all), else "hinter Plan".
 */
export function goalStatus(input: {
  savedCents: number;
  targetCents: number;
  targetDate: string | null;
  forecast: string | null;
}): GoalStatus {
  if (input.savedCents >= input.targetCents) return 'reached';
  if (input.forecast === null) return 'behind';
  if (input.targetDate === null) return 'on_track';
  return input.forecast <= monthOf(input.targetDate) ? 'on_track' : 'behind';
}

export interface GoalInput {
  /** Viewed month `YYYY-MM`. */
  month: string;
  targetCents: number;
  /** `YYYY-MM-DD` */
  targetDate: string | null;
  /** Saved at the end of the viewed month (never negative). */
  savedCents: number;
  /** Monthly savings of the last months, oldest first (see `averageRateCents`). */
  recentMonthlyCents: readonly number[];
}

export interface GoalProgress {
  savedCents: number;
  remainingCents: number;
  /** Months still to save in; `null` without a target date or when reached. */
  monthsLeft: number | null;
  /** Rate that reaches the target in time; `null` without a target date. */
  neededMonthlyCents: number | null;
  /** Average monthly saving of the last three months. */
  averageRateCents: number;
  /** `YYYY-MM` the goal is full at that rate; `null` when it never is or is reached already. */
  forecastMonth: string | null;
  status: GoalStatus;
}

/** All figures of one goal for the viewed month. */
export function goalProgress(input: GoalInput): GoalProgress {
  const saved = Math.max(0, input.savedCents);
  const remaining = remainingCents(input.targetCents, saved);
  const months = monthsLeft(input.month, input.targetDate);
  const rate = averageRateCents(input.recentMonthlyCents);
  const forecast = forecastMonth(input.month, remaining, rate);
  return {
    savedCents: saved,
    remainingCents: remaining,
    monthsLeft: remaining === 0 ? null : months,
    neededMonthlyCents: months === null ? null : neededMonthlyCents(remaining, months),
    averageRateCents: rate,
    forecastMonth: remaining === 0 ? null : forecast,
    status: goalStatus({
      savedCents: saved,
      targetCents: input.targetCents,
      targetDate: input.targetDate,
      forecast,
    }),
  };
}

export interface GoalTotals {
  targetCents: number;
  savedCents: number;
  remainingCents: number;
  neededMonthlyCents: number;
}

/** Sums of a group of goals (Offen, Erreicht). A missing needed rate counts as 0. */
export function goalTotals(
  goals: ReadonlyArray<{
    targetCents: number;
    savedCents: number;
    remainingCents: number;
    neededMonthlyCents: number | null;
  }>,
): GoalTotals {
  return goals.reduce<GoalTotals>(
    (t, g) => ({
      targetCents: t.targetCents + g.targetCents,
      savedCents: t.savedCents + g.savedCents,
      remainingCents: t.remainingCents + g.remainingCents,
      neededMonthlyCents: t.neededMonthlyCents + (g.neededMonthlyCents ?? 0),
    }),
    { targetCents: 0, savedCents: 0, remainingCents: 0, neededMonthlyCents: 0 },
  );
}
