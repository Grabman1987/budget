import { addDays, addMonths, daysBetween, lastDayOfMonth, monthOf } from '../date';
import { roundDivCents } from '../wealth/int';

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
  /**
   * The expected payment occurrence behind an income or fixed item, so a view can offer
   * "skip this one" (gestrichen) without searching for it. Absent for planned events.
   */
  ref?: ForecastItemRef;
}

/** Identity of one occurrence of an expected payment (payment and due date). */
export interface ForecastItemRef {
  paymentId: string;
  dueDate: string;
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
  ref?: ForecastItemRef;
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

/** Cash provenance is explicit: null never means the main payment account. */
export interface ForecastAccountItem extends ForecastItem {
  accountId: string | null;
  expected: boolean;
}

export interface AccountLiquidityInput {
  startDay: string;
  /** Inclusive account horizon (next payday plus 30 days), independent of legacy chart windows. */
  through?: string;
  accounts: ReadonlyArray<{
    id: string;
    name: string;
    /** False for legacy household paths such as cards; never an alert or transfer source. */
    paymentAccount?: boolean;
    /** Actual balance, before open day-zero obligations. No credit limit. */
    balanceCents: number;
    bufferCents?: number | null;
    /** Proven external cash only; expected income is never a safe inflow. */
    nextSafeInflowDay?: string | null;
  }>;
  items: ReadonlyArray<ForecastAccountItem>;
  dayZeroItems?: ReadonlyArray<ForecastAccountItem>;
  /** An aggregate estimate remains unassigned rather than inventing an account. */
  variableMonthlyCents: number;
  /** Missing rates cannot silently turn an incomplete cash path into an all-clear. */
  missingFx?: ReadonlyArray<{ paymentId: string; dueDate: string; currency: string }>;
}

export type AccountLiquidityResult = ReturnType<typeof accountLiquidityForecast>;

/**
 * One attributed cash path for Heute, the liquidity report and R07. Both views use
 * the existing forecast engine. Account paths plus the explicit unassigned path
 * equal the household on every day, including overdue open payments on day zero.
 */
export function accountLiquidityForecast(input: AccountLiquidityInput, days: number) {
  if (!Number.isSafeInteger(days) || days < 0) throw new RangeError('Invalid liquidity horizon');
  const ids = new Set(input.accounts.map((a) => a.id));
  if (ids.size !== input.accounts.length) throw new RangeError('Duplicate liquidity account');
  const all = [...(input.dayZeroItems ?? []), ...input.items];
  const missingFx = (input.missingFx ?? []).filter(
    (item) => item.dueDate <= addDays(input.startDay, days),
  );
  const cents = [
    input.variableMonthlyCents,
    ...input.accounts.flatMap((account) => [account.balanceCents, account.bufferCents ?? 0]),
    ...all.map((item) => item.cents),
  ];
  if (cents.some((amount) => !Number.isSafeInteger(amount)))
    throw new RangeError('Invalid liquidity cents');
  // Bound intermediate additions too: a safe closing balance can hide unsafe cancellation.
  const arithmeticBudget =
    input.accounts.reduce((sum, account) => sum + BigInt(Math.abs(account.balanceCents)), 0n) +
    all.reduce((sum, item) => sum + BigInt(Math.abs(item.cents)), 0n) +
    BigInt(Math.abs(input.variableMonthlyCents)) * BigInt(Math.ceil(days / 28) + 1);
  if (arithmeticBudget > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Unsafe liquidity cent arithmetic');
  if (all.some((item) => item.accountId !== null && !ids.has(item.accountId)))
    throw new RangeError('Unknown liquidity account');
  const project = (withoutExpected: boolean) => {
    const items = all.filter((item) => !(withoutExpected && item.expected && item.cents > 0));
    const run = (
      balanceCents: number,
      legs: ReadonlyArray<ForecastAccountItem>,
      variable: number,
    ) => {
      const forecast = liquidityForecast({
        startDay: input.startDay,
        startCents:
          balanceCents +
          legs
            .filter((item) => item.day <= input.startDay)
            .reduce((sum, item) => sum + item.cents, 0),
        days,
        items: legs,
        variablePerDay: evenDaily(() => variable),
      });
      if (forecast.days.some((day) => !Number.isSafeInteger(day.balanceCents)))
        throw new RangeError('Unsafe liquidity balance');
      return { days: forecast.days, low: lowPoint(forecast.days, days)! };
    };
    const accounts = input.accounts.map((account) => {
      const legs = items.filter((item) => item.accountId === account.id);
      const forecast = run(account.balanceCents, legs, 0);
      const firstBelow = (limit: number) => {
        const day = forecast.days.find((day) => day.balanceCents < limit);
        return day ? { day: day.day, index: day.index, cents: day.balanceCents } : null;
      };
      const nextSafeInflowDay = account.nextSafeInflowDay ?? null;
      const beforeSafe = forecast.days.filter(
        (day) => nextSafeInflowDay === null || day.day < nextSafeInflowDay || day.index === 0,
      );
      return {
        accountId: account.id,
        name: account.name,
        paymentAccount: account.paymentAccount ?? true,
        balanceTodayCents: account.balanceCents,
        bufferCents: account.bufferCents ?? null,
        nextSafeInflowDay,
        ...forecast,
        firstBelowZero: firstBelow(0),
        firstBelowBuffer:
          account.bufferCents === undefined || account.bufferCents === null
            ? null
            : firstBelow(account.bufferCents),
        lowBeforeSafeInflow: lowPoint(beforeSafe, days)!,
        payments: legs.filter((item) => item.cents < 0 && item.day <= forecast.low.day),
      };
    });
    return {
      accounts,
      household: run(
        input.accounts.reduce((sum, account) => sum + account.balanceCents, 0),
        items,
        input.variableMonthlyCents,
      ),
      unassigned: run(
        0,
        items.filter((item) => item.accountId === null),
        input.variableMonthlyCents,
      ),
    };
  };
  return {
    withExpectedInflows: project(false),
    withoutExpectedInflows: project(true),
    unassignedPayments: all.filter(
      (item) => item.accountId === null && item.day <= addDays(input.startDay, days),
    ),
    variableSpendingUnassigned: input.variableMonthlyCents > 0,
    incomplete: missingFx.length > 0,
    missingFx,
  };
}

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
    return roundDivCents(total * n, dim) - roundDivCents(total * (n - 1), dim);
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
        shown.push({
          cents: item.cents,
          kind: item.kind,
          ...(item.label === undefined ? {} : { label: item.label }),
          ...(item.ref === undefined ? {} : { ref: item.ref }),
        });
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

/** One unbuffered projection and low point for R07 and the Heute balance chart. */
export function budgetLiquidityForecast(
  input: {
    startDay: string;
    startCents: number;
    items: ReadonlyArray<ForecastItem>;
    variableMonthlyCents: number;
    accountLiquidity?: AccountLiquidityInput;
  },
  days: number,
) {
  const forecast = liquidityForecast({
    ...input,
    days,
    variablePerDay: evenDaily(() => input.variableMonthlyCents),
  });
  return {
    ...forecast,
    low: lowPoint(forecast.days, days),
    ...(input.accountLiquidity === undefined
      ? {}
      : {
          accountLiquidity: accountLiquidityForecast(
            input.accountLiquidity,
            input.accountLiquidity.through === undefined
              ? days
              : daysBetween(input.accountLiquidity.startDay, input.accountLiquidity.through),
          ),
        }),
  };
}
