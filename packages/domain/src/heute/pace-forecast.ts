import { type PaceFixed, type PaceModel } from '../kpi/pace';
import { roundDivCents } from '../wealth/int';

/**
 * The forecast curve of the pace chart: cumulative spending from today to the end of the month,
 * index = day of the month (`todayDay..daysInMonth`, entry 0 is today). The open fixed costs fall
 * on their due day; the remaining variable forecast (provisional plan or daily rate) is spread
 * over the days left, so the last value is exactly
 * `figures.forecastEndCents`.
 */
export function paceForecastCurve(model: PaceModel, fixed: ReadonlyArray<PaceFixed>): number[] {
  const { todayDay, daysInMonth, figures } = model;
  if (!figures.forecastAvailable) return [];
  const open = fixed
    .filter((f) => f.day.startsWith(model.month))
    .filter((f) => !(f.settled ?? Number(f.day.slice(8)) <= todayDay));
  const remaining = figures.forecastEndCents - figures.spentCents - figures.openFixedCents;
  const left = daysInMonth - todayDay;
  const out: number[] = [];
  for (let d = todayDay; d <= daysInMonth; d++) {
    const fixedTo = open.reduce(
      (a, f) =>
        Math.max(todayDay + 1, Number(f.day.slice(8))) <= d
          ? a + Math.max(0, f.cents - (f.paidCents ?? 0))
          : a,
      0,
    );
    out.push(
      figures.spentCents +
        fixedTo +
        (left > 0 ? roundDivCents(remaining * (d - todayDay), left) : 0),
    );
  }
  return out;
}
