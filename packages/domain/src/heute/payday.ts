import { lastDayOfMonth, monthOf } from '../date';

/**
 * Payday and the two windows of Heute (concept §7.1). The payday is the next occurrence of the
 * salary expected payment (last business day of the month, shifted by Austrian public holidays,
 * see `schedule`); without a salary payment it is the end of the month. Pure; the caller supplies
 * the salary dates.
 */

export type HeutePeriod = 'month' | 'payday';

export interface Payday {
  /** `YYYY-MM-DD`. */
  day: string;
  /** `salary`: the next salary occurrence; `month_end`: no salary payment, the month's last day. */
  source: 'salary' | 'month_end';
}

/**
 * The first salary day on or after `today` (on the payday itself the salary is still due: a day
 * whose salary is already received is not passed), otherwise the last day of today's month.
 */
export function nextPayday(salaryDays: ReadonlyArray<string>, today: string): Payday {
  const next = [...salaryDays].filter((d) => d >= today).sort()[0];
  return next === undefined
    ? { day: lastDayOfMonth(monthOf(today)), source: 'month_end' }
    : { day: next, source: 'salary' };
}

export interface HeuteWindow {
  period: HeutePeriod;
  /** `YYYY-MM` shown by the pace and the month window. */
  month: string;
  /** First and last day of the balance chart. */
  from: string;
  to: string;
}

/**
 * "Monat": the whole month. "Bis Gehalt": from today up to the payday (the payday itself is the
 * salary jump). A month other than today's has no payday window: it is the month then as well.
 */
export function heuteWindow(
  period: HeutePeriod,
  month: string,
  today: string,
  payday: string,
): HeuteWindow {
  if (period === 'payday' && month === monthOf(today))
    return { period, month, from: today, to: payday > today ? payday : today };
  return { period: 'month', month, from: `${month}-01`, to: lastDayOfMonth(month) };
}
