import { addDays, addMonths, lastDayOfMonth, monthOf } from '../date';

/**
 * Liquidity forecast of the budget accounts, day by day. Generic port of `forecast()` in
 * `design/prototype/reports-zukunft.js`: nothing about categories or accounts is hardcoded, every
 * dated amount comes in as data. Used by rule R07, the Heute lead chart and later report 3.1.
 *
 * All amounts are integer cents. Inflows are positive, outflows negative. The overdraft never
 * counts as money: the balance may go below zero and is reported as it is, nothing is added.
 */

export type ForecastItemKind = 'income' | 'fixed' | 'event';

/** A dated amount on the budget accounts: an expected occurrence or a planned event. */
export interface ForecastItem {
  /** `YYYY-MM-DD`. Items on or before the start day are already part of the start balance. */
  day: string;
  /** Signed cents on the budget accounts. */
  cents: number;
  kind: ForecastItemKind;
  label?: string;
  /** Class of the category behind a scheduled payment; the report levers pick by it. */
  group?: 'need' | 'want' | 'future';
}

/** Stage "surplus": on one day a month, whatever exceeds the buffer leaves the budget accounts. */
export interface LiquiditySweep {
  /** Day of the month (1-31) on which the sweep runs. */
  dayOfMonth: number;
  /** Stays on the budget accounts in any case. */
  bufferCents: number;
  /** The planned expenses (negative events) of this month and the following months stay as well. */
  horizonMonths: number;
}

export interface LiquidityInput {
  /** Day 0 (today). */
  startDay: string;
  /** Balance of the budget accounts at the start of day 0. */
  startCents: number;
  /** Number of days after the start day to calculate. */
  days: number;
  items: ReadonlyArray<ForecastItem>;
  /** Planned variable spending of a day in cents (positive number). See `evenDaily`. */
  variablePerDay: (day: string) => number;
  sweep?: LiquiditySweep;
}

export interface ForecastDayItem {
  cents: number;
  kind: ForecastItemKind | 'sweep';
  label?: string;
}

export interface ForecastDay {
  day: string;
  /** 0 for the start day. */
  index: number;
  /** Balance at the end of the day. */
  balanceCents: number;
  /** Variable spending of the day (positive number). */
  variableCents: number;
  items: ForecastDayItem[];
}

export interface ForecastMonth {
  month: string;
  startCents: number;
  incomeCents: number;
  fixedCents: number;
  /** Negative. */
  variableCents: number;
  eventCents: number;
  sweepCents: number;
  lowCents: number;
  endCents: number;
}

export interface LiquidityForecast {
  days: ForecastDay[];
  months: ForecastMonth[];
}

export interface LowPoint {
  day: string;
  index: number;
  cents: number;
}

/** Integer division rounding half up, for non-negative values. */
const roundDiv = (a: number, b: number): number => Math.floor((2 * a + b) / (2 * b));

/**
 * Spreads a monthly amount evenly over the days of its month in whole cents; the days of a
 * complete month add up to exactly the monthly amount.
 */
export function evenDaily(monthlyCents: (month: string) => number): (day: string) => number {
  return (day) => {
    const month = monthOf(day);
    const total = Math.max(0, monthlyCents(month));
    const dim = Number(lastDayOfMonth(month).slice(8));
    const n = Number(day.slice(8));
    return roundDiv(total * n, dim) - roundDiv(total * (n - 1), dim);
  };
}

/** Runs the forecast. Items on or before the start day and after the last day are ignored. */
export function liquidityForecast(input: LiquidityInput): LiquidityForecast {
  const byDay = new Map<string, ForecastItem[]>();
  for (const item of input.items) {
    const list = byDay.get(item.day);
    if (list) list.push(item);
    else byDay.set(item.day, [item]);
  }
  const plannedExpenses = input.items.filter((i) => i.kind === 'event' && i.cents < 0);

  const days: ForecastDay[] = [];
  const months = new Map<string, ForecastMonth>();
  let balance = input.startCents;

  for (let index = 0; index <= input.days; index++) {
    const day = addDays(input.startDay, index);
    const month = monthOf(day);
    let row = months.get(month);
    if (!row) {
      row = {
        month,
        startCents: balance,
        incomeCents: 0,
        fixedCents: 0,
        variableCents: 0,
        eventCents: 0,
        sweepCents: 0,
        lowCents: balance,
        endCents: balance,
      };
      months.set(month, row);
    }
    const shown: ForecastDayItem[] = [];
    let variableCents = 0;
    if (index > 0) {
      variableCents = Math.max(0, input.variablePerDay(day));
      balance -= variableCents;
      row.variableCents -= variableCents;
      for (const item of byDay.get(day) ?? []) {
        balance += item.cents;
        if (item.kind === 'income') row.incomeCents += item.cents;
        else if (item.kind === 'fixed') row.fixedCents += item.cents;
        else row.eventCents += item.cents;
        shown.push(
          item.label === undefined
            ? { cents: item.cents, kind: item.kind }
            : { cents: item.cents, kind: item.kind, label: item.label },
        );
      }
      const sweep = input.sweep;
      if (sweep && Number(day.slice(8)) === sweep.dayOfMonth) {
        const until = addMonths(month, sweep.horizonMonths);
        let keep = sweep.bufferCents;
        for (const e of plannedExpenses) {
          const m = monthOf(e.day);
          if (m >= month && m < until) keep -= e.cents;
        }
        if (balance > keep) {
          const moved = -(balance - keep);
          balance += moved;
          row.sweepCents += moved;
          shown.push({ cents: moved, kind: 'sweep' });
        }
      }
    }
    row.lowCents = Math.min(row.lowCents, balance);
    row.endCents = balance;
    days.push({ day, index, balanceCents: balance, variableCents, items: shown });
  }
  return { days, months: [...months.values()] };
}

/** The lowest balance within the first `withinDays` days (day 0 included); the earliest on a tie. */
export function lowPoint(days: ReadonlyArray<ForecastDay>, withinDays: number): LowPoint | null {
  let low: ForecastDay | null = null;
  for (const d of days) {
    if (d.index > withinDays) break;
    if (!low || d.balanceCents < low.balanceCents) low = d;
  }
  return low ? { day: low.day, index: low.index, cents: low.balanceCents } : null;
}
