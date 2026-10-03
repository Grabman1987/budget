import { addMonths, lastDayOfMonth, monthOf } from '../date';

/**
 * Pace of the month (Heute and Plan): cumulative spending of Bedarf and Wunsch against the plan.
 * Domain version of the pace model in `design/prototype/app.js`: fixed costs fall on their due day,
 * the variable rest of the limit is spread linearly; the forecast for the month end is what was
 * spent, plus the fixed costs still open, plus the variable rest at the daily rate so far.
 * Integer cents; curves are indexed by day of the month (index 0 = before the first day).
 */

export interface PaceFixed {
  /** Due day `YYYY-MM-DD` of an expected payment of the month. */
  day: string;
  /** Positive amount of the outflow. */
  cents: number;
  /** Already paid. Default: due on or before today. Set `false` for overdue but unpaid items. */
  settled?: boolean;
  /** Actual fixed spending matched to this payment (may differ from the plan). */
  paidCents?: number;
}

export interface PaceSpending {
  day: string;
  /** Positive = spending, negative = refund. */
  cents: number;
}

export interface PaceInput {
  /** `YYYY-MM` */
  month: string;
  /** `YYYY-MM-DD`; before the month = nothing happened yet, after the month = month complete. */
  today: string;
  /** Planned spending of the month (assigned to the Bedarf and Wunsch categories). */
  limitCents: number;
  /** Known fixed/periodic spending; never extrapolated even without a schedule. */
  fixedSpentCents?: number;
  fixed: ReadonlyArray<PaceFixed>;
  /** All Bedarf and Wunsch outflows of the month, fixed ones included. */
  spending: ReadonlyArray<PaceSpending>;
  /** Spending of the previous month, for the comparison curve. */
  previousSpending?: ReadonlyArray<PaceSpending>;
}

export interface PaceFigures {
  /** Ausgegeben: cumulative spending up to today. */
  spentCents: number;
  /** Plan bis heute. */
  planToDateCents: number;
  /** Spent minus plan; above 0 = over plan. */
  deltaCents: number;
  /** Prognose Monatsende. */
  forecastEndCents: number;
  /** At least seven elapsed days and a positive plan; completed months are actuals. */
  forecastAvailable: boolean;
  limitCents: number;
  /** Variable spending so far (spent minus fixed costs already paid). */
  variableSoFarCents: number;
  /** Fixed costs still open this month. */
  openFixedCents: number;
  over: boolean;
}

export interface PaceModel {
  month: string;
  daysInMonth: number;
  /** Day of the month of today, clamped to 0..daysInMonth. */
  todayDay: number;
  /** Planned cumulative spending, index 0..daysInMonth. */
  plan: number[];
  /** Actual cumulative spending, index 0..todayDay. */
  actual: number[];
  /** Previous month, cumulative, index 0..daysInMonth (holds its last value past its end). */
  previous: number[];
  /** Days of the month on which the plan jumps by a fixed cost. */
  fixedDays: number[];
  figures: PaceFigures;
}

/** Integer division rounding half up, for non-negative values. */
const roundDiv = (a: number, b: number): number => Math.floor((2 * a + b) / (2 * b));

const dayNumber = (day: string): number => Number(day.slice(8));

function cumulative(entries: ReadonlyArray<PaceSpending>, month: string, length: number): number[] {
  const perDay = new Array<number>(length + 1).fill(0);
  for (const e of entries) {
    if (monthOf(e.day) !== month) continue;
    const d = dayNumber(e.day);
    if (d >= 1 && d <= length) perDay[d] = (perDay[d] ?? 0) + e.cents;
  }
  const out: number[] = [0];
  for (let d = 1; d <= length; d++) out.push((out[d - 1] ?? 0) + (perDay[d] ?? 0));
  return out;
}

export function paceModel(input: PaceInput): PaceModel {
  const { month } = input;
  const dim = dayNumber(lastDayOfMonth(month));
  const todayDay =
    input.today < `${month}-01` ? 0 : monthOf(input.today) > month ? dim : dayNumber(input.today);

  const fixed = input.fixed.filter((f) => monthOf(f.day) === month);
  const fixedTotal = fixed.reduce((a, f) => a + f.cents, 0);
  const variablePlan = Math.max(0, input.limitCents - fixedTotal);
  const fixedTo = (d: number) =>
    fixed.reduce((a, f) => (dayNumber(f.day) <= d ? a + f.cents : a), 0);

  const plan: number[] = [];
  for (let d = 0; d <= dim; d++) plan.push(fixedTo(d) + roundDiv(variablePlan * d, dim));

  const actualFull = cumulative(input.spending, month, dim);
  const actual = actualFull.slice(0, todayDay + 1);
  const previousMonth = addMonths(month, -1);
  const previousDim = dayNumber(lastDayOfMonth(previousMonth));
  const previousFull = cumulative(input.previousSpending ?? [], previousMonth, previousDim);
  const previous = Array.from(
    { length: dim + 1 },
    (_, d) => previousFull[Math.min(d, previousDim)] ?? 0,
  );

  const spentCents = actual[todayDay] ?? 0;
  const isSettled = (f: PaceFixed) => f.settled ?? dayNumber(f.day) <= todayDay;
  const openFixedCents = fixed.reduce(
    (a, f) => a + (isSettled(f) ? 0 : Math.max(0, f.cents - (f.paidCents ?? 0))),
    0,
  );
  const variableSoFarCents =
    spentCents -
    (input.fixedSpentCents ??
      fixed.reduce((a, f) => a + (f.paidCents ?? (isSettled(f) ? f.cents : 0)), 0));
  const remainingVariable =
    todayDay === 0
      ? variablePlan
      : Math.round((Math.max(0, variableSoFarCents) * (dim - todayDay)) / todayDay);
  const planToDateCents = plan[todayDay] ?? 0;
  const deltaCents = spentCents - planToDateCents;

  return {
    month,
    daysInMonth: dim,
    todayDay,
    plan,
    actual,
    previous,
    fixedDays: [...new Set(fixed.map((f) => dayNumber(f.day)))].sort((a, b) => a - b),
    figures: {
      spentCents,
      planToDateCents,
      deltaCents,
      forecastEndCents: spentCents + openFixedCents + remainingVariable,
      forecastAvailable: todayDay === dim || (todayDay >= 7 && input.limitCents > 0),
      limitCents: input.limitCents,
      variableSoFarCents,
      openFixedCents,
      over: deltaCents > 0,
    },
  };
}
