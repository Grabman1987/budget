import { daysBetween } from '../date';
import { budgetLiquidityForecast, lowPoint } from '../forecast/liquidity';
import type { HeuteWindow } from './payday';

/** One period-bound read for Heute and the R07 account forecast, including actual history. */
export function balanceForecast(
  input: Parameters<typeof budgetLiquidityForecast>[0],
  window: HeuteWindow,
  history: ReadonlyArray<{ day: string; balanceCents: number }>,
) {
  const actual = history.filter((d) => d.day >= window.from && d.day <= window.to);
  const forecast =
    window.to > input.startDay
      ? budgetLiquidityForecast(input, daysBetween(input.startDay, window.to)).days.map((d) => ({
          day: d.day,
          balanceCents: d.balanceCents,
          items: d.items,
          variableCents: d.variableCents,
        }))
      : [];
  const days = [...actual, ...forecast.filter((d) => d.day > input.startDay)].map((d) => ({
    ...d,
    index: daysBetween(window.from, d.day),
    items: [],
    variableCents: 0,
  }));
  return { actual, forecast, low: lowPoint(days, daysBetween(window.from, window.to)) };
}
