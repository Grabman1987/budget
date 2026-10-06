import { addDays, addMonths, daysBetween, lastDayOfMonth, monthOf } from '../date';
import { shiftToBusinessDay } from '../schedule/due-dates';

/**
 * Payday and the two windows of Heute. Owner rule (2026-10-02): the 15th, moved back to the
 * preceding Austrian business day. This is the planning boundary; actual salary bookings and
 * configured expected payments retain their own dates and amounts.
 */

export type HeutePeriod = 'month' | 'payday';

export interface Payday {
  /** `YYYY-MM-DD`. */
  day: string;
  source: 'payday_rule';
}

/**
 * The first rule-based payday on or after today. On payday itself the window is one day;
 * the next calendar day starts the following month's window, including across December.
 */
export function nextPayday(today: string): Payday {
  const month = monthOf(today);
  const candidate = shiftToBusinessDay(`${month}-15`, 'before');
  return {
    day: candidate >= today ? candidate : shiftToBusinessDay(`${addMonths(month, 1)}-15`, 'before'),
    source: 'payday_rule',
  };
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
 * Shared Heute/R07 chart window: fourteen actual days before today, then the selected boundary
 * plus two days. A payday forecast shorter than seven days uses the following payday instead.
 */
export function heuteWindow(
  period: HeutePeriod,
  month: string,
  today: string,
  payday: string,
): HeuteWindow {
  let boundary = period === 'payday' ? payday : lastDayOfMonth(month);
  if (period === 'payday' && daysBetween(today, addDays(boundary, 2)) < 7)
    boundary = nextPayday(addDays(payday, 1)).day;
  return { period, month, from: addDays(today, -14), to: addDays(boundary, 2) };
}
