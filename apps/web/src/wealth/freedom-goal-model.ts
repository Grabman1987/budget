import { freedomGoalMonth, lastDayOfMonth } from '@budget/domain';

/** Drawing extent only. No new sample, interpolated value or forecast continuation is created. */
export function freedomGoalAxis(dates: readonly string[], startMonth: string, year: number) {
  const goalDate = lastDayOfMonth(freedomGoalMonth(year));
  const sourceStart = dates[0] ?? lastDayOfMonth(startMonth);
  const sourceEnd = dates.at(-1) ?? sourceStart;
  const first = goalDate < sourceStart ? goalDate : sourceStart;
  const last = goalDate > sourceEnd ? goalDate : sourceEnd;
  const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const duration = Math.max(86_400_000, time(last) - time(first));
  return {
    first,
    last,
    goalDate,
    position: (date: string) => (time(date) - time(first)) / duration,
  };
}
