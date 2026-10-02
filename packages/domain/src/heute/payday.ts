import { addMonths, lastDayOfMonth, monthOf } from '../date';
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
