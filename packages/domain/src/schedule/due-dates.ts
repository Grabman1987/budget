import { addDays, addMonths, daysBetween, lastDayOfMonth, monthOf } from '../date';
import { isBusinessDayAT } from './holidays';

export type Rhythm = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
/** What to do when the due day is no business day: keep it, move to the previous or next one. */
export type DateShift = 'none' | 'before' | 'after';

/** The part of an expected payment that decides when it falls due. */
export interface ScheduleRule {
  rhythm: Rhythm;
  /** 1–31; 31, or any day past the month end, means the last day of the month. */
  dueDay: number;
  /** Yearly: the month; quarterly and semiannual: the first month of the cycle. */
  dueMonth: number | null;
  dateShift: DateShift;
  startDate: string | null;
  endDate: string | null;
}

const STEP: Record<Rhythm, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

/** `day` itself when it is a business day, else the previous (`before`) or next (`after`) one. */
export function shiftToBusinessDay(day: string, shift: DateShift): string {
  if (shift === 'none') return day;
  const step = shift === 'before' ? -1 : 1;
  let d = day;
  while (!isBusinessDayAT(d)) d = addDays(d, step);
  return d;
}

/** First month of the cycle (1–12): due month, else the start month, else January. */
const anchorMonth = (rule: ScheduleRule): number =>
  rule.dueMonth ?? (rule.startDate ? Number(rule.startDate.slice(5, 7)) : 1);

/**
 * Due dates in `from`..`to` (both included), ascending. The base day of a month is `dueDay`
 * clamped to the month; the shift is applied after that and may cross a month end, so the range
 * test runs on the shifted day. Start and end date bound the shifted day as well.
 */
export function dueDates(rule: ScheduleRule, from: string, to: string): string[] {
  if (to < from) return [];
  const step = STEP[rule.rhythm];
  const anchor = anchorMonth(rule);
  const out: string[] = [];
  // One month of slack on both sides: a shift can move a day across the month end.
  for (let m = addMonths(monthOf(from), -1); m <= addMonths(monthOf(to), 1); m = addMonths(m, 1)) {
    if (step > 1 && (((Number(m.slice(5, 7)) - anchor) % step) + step) % step !== 0) continue;
    const last = lastDayOfMonth(m);
    const base =
      Number(last.slice(8)) < rule.dueDay ? last : `${m}-${String(rule.dueDay).padStart(2, '0')}`;
    const day = shiftToBusinessDay(base, rule.dateShift);
    if (day < from || day > to) continue;
    if (rule.startDate && day < rule.startDate) continue;
    if (rule.endDate && day > rule.endDate) continue;
    out.push(day);
  }
  return out;
}

/** Whole days between two days, absolute. */
export const dayDistance = (a: string, b: string): number => Math.abs(daysBetween(a, b));
