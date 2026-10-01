import { addDays } from '../date';

/**
 * Austrian business days. Public holidays are computed (fixed dates plus the ones derived from
 * Easter Sunday), never kept in a table, so any year works.
 */

/** Easter Sunday of `year` (`YYYY-MM-DD`), Gregorian computus (Meeus/Jones/Butcher), integers only. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const FIXED = ['01-01', '01-06', '05-01', '08-15', '10-26', '11-01', '12-08', '12-25', '12-26'];
/** Easter Monday, Ascension, Whit Monday, Corpus Christi (days after Easter Sunday). */
const EASTER_OFFSETS = [1, 39, 50, 60];

/** Public holiday in Austria (Good Friday, 24 and 31 December are none). */
export function isPublicHolidayAT(day: string): boolean {
  if (FIXED.includes(day.slice(5))) return true;
  const easter = easterSunday(Number(day.slice(0, 4)));
  return EASTER_OFFSETS.some((n) => addDays(easter, n) === day);
}

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay();

/** Monday to Friday and no Austrian public holiday. */
export function isBusinessDayAT(day: string): boolean {
  const w = weekday(day);
  return w !== 0 && w !== 6 && !isPublicHolidayAT(day);
}
