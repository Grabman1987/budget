import { addMonths, monthsBetween } from '../date';
import { mulDivRound, ratioBp } from './int';

/** Freedom number = annual spend times 25 (4 % withdrawal rule). */
export const FREEDOM_MULTIPLE = 25;
/** Owner defaults (01.10.2026): 5 % real return; annual spend from the last 12 months of consumption without Zukunft. */
export const DEFAULT_REAL_RETURN_BP = 500;
/** Projection horizon: 60 years. */
export const MAX_FREEDOM_MONTHS = 720;

/** Target value: annual spend times `multiple` (default 25). */
export function freedomTargetCents(
  annualSpendCents: number,
  multiple: number = FREEDOM_MULTIPLE,
): number {
  return annualSpendCents * multiple;
}

/**
 * Annual spend from monthly consumption (without Zukunft): the sum of the last 12 months; with
 * fewer months the average is scaled to 12 (rounded half up). 0 without data.
 */
export function freedomAnnualSpendCents(monthlyConsumptionCents: ReadonlyArray<number>): number {
  const last = monthlyConsumptionCents.slice(-12);
  if (last.length === 0) return 0;
  const sum = last.reduce((a, b) => a + b, 0);
  return last.length === 12 ? sum : mulDivRound(sum, 12, last.length);
}

/** Mean of monthly amounts in cents, rounded half up (e.g. the average Zukunft contribution). 0 without data. */
export function averageCents(values: ReadonlyArray<number>): number {
  return values.length === 0
    ? 0
    : mulDivRound(
        values.reduce((a, b) => a + b, 0),
        1,
        values.length,
      );
}

/** R16 progress in bp (10 000 = 100 %, not capped): invested wealth over the freedom number. */
export function freedomProgressBp(investedCents: number, targetCents: number): number {
  return ratioBp(investedCents, targetCents);
}

/**
 * One month of compounding. The monthly interest `value * rateBp / 120 000` is rounded half up to
 * whole cents exactly once per step, then the saving is added (saving at month end).
 */
export function compoundStep(
  valueCents: number,
  realReturnBp: number,
  savingCents: number,
): number {
  return valueCents + mulDivRound(valueCents, realReturnBp, 120_000) + savingCents;
}

/** Value after `months` steps of `compoundStep`. */
export function valueAfterMonths(
  startCents: number,
  months: number,
  realReturnBp: number,
  savingCents: number,
): number {
  let v = startCents;
  for (let k = 0; k < months; k++) v = compoundStep(v, realReturnBp, savingCents);
  return v;
}

interface Reach {
  months: number | null;
  /** Value at month 0, 12, 24 ... and at the final month. */
  yearlyPath: number[];
}

function monthsToTarget(
  investedCents: number,
  savingCents: number,
  realReturnBp: number,
  targetCents: number,
  maxMonths: number,
): Reach {
  let v = investedCents;
  const yearlyPath = [v];
  let m = 0;
  while (v < targetCents && m < maxMonths) {
    v = compoundStep(v, realReturnBp, savingCents);
    m += 1;
    if (m % 12 === 0) yearlyPath.push(v);
  }
  if (m % 12 !== 0) yearlyPath.push(v);
  return { months: v >= targetCents ? m : null, yearlyPath };
}

export interface FreedomProjection {
  /** Months until the target is reached (0 when already there); `null` when not within the horizon. */
  months: number | null;
  /** Month `YYYY-MM` the target is reached in (`startMonth` + months), when `startMonth` is given. */
  doneMonth: string | null;
  doneYear: number | null;
  /** Value at each full year and at the end (for the chart). */
  yearlyPath: number[];
  /** Months with the extra saving (default +100 €). */
  monthsWithExtra: number | null;
  /** Months saved by the extra saving; `null` when either case does not reach the target. */
  monthsEarlier: number | null;
  extraSavingCents: number;
}

/**
 * Months and year until invested wealth reaches the freedom number, saving at each month end and
 * compounding monthly (`compoundStep`, one rounding per step), plus the effect of saving
 * `extraSavingCents` more per month (default 100 €).
 */
export function projectFreedom(input: {
  investedCents: number;
  monthlySavingCents: number;
  realReturnBp: number;
  targetCents: number;
  startMonth?: string;
  extraSavingCents?: number;
  maxMonths?: number;
}): FreedomProjection {
  const extraSavingCents = input.extraSavingCents ?? 10_000;
  const maxMonths = input.maxMonths ?? MAX_FREEDOM_MONTHS;
  const base = monthsToTarget(
    input.investedCents,
    input.monthlySavingCents,
    input.realReturnBp,
    input.targetCents,
    maxMonths,
  );
  const extra = monthsToTarget(
    input.investedCents,
    input.monthlySavingCents + extraSavingCents,
    input.realReturnBp,
    input.targetCents,
    maxMonths,
  );
  const doneMonth =
    base.months !== null && input.startMonth ? addMonths(input.startMonth, base.months) : null;
  return {
    months: base.months,
    doneMonth,
    doneYear: doneMonth ? Number(doneMonth.slice(0, 4)) : null,
    yearlyPath: base.yearlyPath,
    monthsWithExtra: extra.months,
    monthsEarlier:
      base.months !== null && extra.months !== null ? base.months - extra.months : null,
    extraSavingCents,
  };
}

/**
 * Smallest constant monthly saving (whole cents) that takes `startCents` to at least `targetCents`
 * within `months` steps of `compoundStep`. 0 when the start compounds there alone; `null` when
 * `months` is 0 and the target is not yet reached.
 */
export function requiredMonthlySavingCents(input: {
  startCents: number;
  months: number;
  realReturnBp: number;
  targetCents: number;
}): number | null {
  const { startCents, months, realReturnBp, targetCents } = input;
  if (valueAfterMonths(startCents, months, realReturnBp, 0) >= targetCents) return 0;
  if (months <= 0) return null;
  // Saving `target - start` reaches the target in the first step, so it is an upper bound.
  let lo = 0;
  let hi = Math.max(1, targetCents - startCents);
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (valueAfterMonths(startCents, months, realReturnBp, mid) >= targetCents) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface SollPfad {
  /** Months from `startMonth` to the goal month. */
  months: number;
  goalMonth: string;
  /** Constant monthly saving of the plan (required rate from the start). */
  monthlySavingCents: number | null;
  /** Soll value per month, index 0 = start month ... index `months` = goal month (empty when the rate is `null`). */
  path: number[];
  /** Index of today's month in the path (clamped to 0 ... months). */
  todayIndex: number;
  /** Where the plan says we should be today. */
  sollTodayCents: number;
  /** Actual minus Soll today: positive = ahead of the plan. */
  gapCents: number;
  /** Months left from today to the goal month. */
  monthsLeft: number;
  /** Constant monthly saving needed from today on; `null` when no month is left and the target is missed. */
  neededMonthlySavingCents: number | null;
}

/**
 * Soll-Pfad (R16): the plan that starts at `startCents` in `startMonth` and reaches the freedom
 * number in January of `goalYear` with one constant monthly saving (prototype: Oct 2023 to the
 * goal year; pass `goalMonth` to override the January). Reports the Soll value today, the gap to
 * the actual value and the saving needed from today on. All compounding uses `compoundStep`.
 */
export function sollPfad(input: {
  startCents: number;
  startMonth: string;
  goalYear: number;
  goalMonth?: string;
  targetCents: number;
  realReturnBp: number;
  todayMonth: string;
  investedCents: number;
}): SollPfad {
  const goalMonth = input.goalMonth ?? `${String(input.goalYear).padStart(4, '0')}-01`;
  const months = Math.max(0, monthsBetween(input.startMonth, goalMonth).length - 1);
  const monthlySavingCents = requiredMonthlySavingCents({
    startCents: input.startCents,
    months,
    realReturnBp: input.realReturnBp,
    targetCents: input.targetCents,
  });
  const path: number[] = [];
  if (monthlySavingCents !== null) {
    let v = input.startCents;
    path.push(v);
    for (let k = 1; k <= months; k++) {
      v = compoundStep(v, input.realReturnBp, monthlySavingCents);
      path.push(v);
    }
  }
  const raw = monthsBetween(input.startMonth, input.todayMonth).length - 1;
  const todayIndex = Math.min(months, Math.max(0, raw));
  const sollTodayCents = path[todayIndex] ?? input.startCents;
  const monthsLeft = months - todayIndex;
  return {
    months,
    goalMonth,
    monthlySavingCents,
    path,
    todayIndex,
    sollTodayCents,
    gapCents: input.investedCents - sollTodayCents,
    monthsLeft,
    neededMonthlySavingCents: requiredMonthlySavingCents({
      startCents: input.investedCents,
      months: monthsLeft,
      realReturnBp: input.realReturnBp,
      targetCents: input.targetCents,
    }),
  };
}
