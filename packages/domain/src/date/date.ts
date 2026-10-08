/**
 * Calendar dates of the app. Days are ISO text `YYYY-MM-DD`, months `YYYY-MM`. "Today" is the day
 * in Europe/Vienna, whatever the server's time zone (the Fly machine runs on UTC).
 */

const DAY_MS = 86_400_000;

const viennaDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The current day in Vienna as `YYYY-MM-DD`. */
export function todayInVienna(now: Date = new Date()): string {
  return viennaDay.format(now);
}

/** `YYYY-MM` of a day. */
export const monthOf = (day: string): string => day.slice(0, 7);

const parseMonth = (month: string): [number, number] => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new RangeError(`Invalid month "${month}", expected YYYY-MM`);
  return [Number(match[1]), Number(match[2])];
};

/** The month `n` months after `month` (negative `n` goes back). */
export function addMonths(month: string, n: number): string {
  const [y, m] = parseMonth(month);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export const nextMonth = (month: string): string => addMonths(month, 1);

/** Every month from `from` to `to`, both included (empty when `to` is before `from`). */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = nextMonth(m)) out.push(m);
  return out;
}

/** Last day `YYYY-MM-DD` of a month. */
export function lastDayOfMonth(month: string): string {
  const [y, m] = parseMonth(month);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayMs(b) - dayMs(a)) / DAY_MS);
}

/** Parsed days are reused: the age and matching loops call this millions of times per request. */
const parsedDays = new Map<string, number>();
function dayMs(day: string): number {
  let ms = parsedDays.get(day);
  if (ms === undefined) {
    if (parsedDays.size >= 50_000) parsedDays.clear();
    ms = Date.parse(`${day}T00:00:00Z`);
    parsedDays.set(day, ms);
  }
  return ms;
}

/** The day `n` days after `day` (`YYYY-MM-DD`, negative `n` goes back). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;
/** `September` from `YYYY-MM` or any day of it; `''` for an invalid month. */
export const monthNameOnly = (month: string): string =>
  /^\d{4}-(0[1-9]|1[0-2])/.test(month) ? MONTH_NAMES[Number(month.slice(5, 7)) - 1]! : '';
