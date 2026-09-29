/**
 * Sample pace model for the chart spike, ported from `design/prototype/app.js` (synthetic data).
 * All values are cents. The real model moves to `packages/domain` with P3 (Heute).
 */

export const TODAY = 17;
export const DAYS = 30;
export const LIMIT = 330000;

/** Fixed costs by due day. */
export const FIXED: Readonly<Record<number, number>> = {
  1: 89000,
  3: 41200,
  15: 6000,
  20: 1799,
  22: 2500,
  25: 10500,
};

/** Variable spending per day, index 0..TODAY. */
const VAR_ACTUAL = [
  0, 2200, 4800, 1500, 6100, 3000, 900, 7200, 2500, 4000, 1800, 5500, 3300, 4700, 2000, 6400, 5800,
  7334,
];

const FIXED_TOTAL = Object.values(FIXED).reduce((a, b) => a + b, 0);
const VAR_PLAN = LIMIT - FIXED_TOTAL;

const fixedTo = (day: number): number =>
  Object.entries(FIXED).reduce((sum, [d, v]) => sum + (Number(d) <= day ? v : 0), 0);

export interface PaceModel {
  /** Planned cumulative spending: fixed costs on due day, variable rest linear. */
  plan: (day: number) => number;
  /** Actual cumulative spending, defined up to TODAY. */
  actual: (day: number) => number;
  /** Previous month, cumulative (dash-dot line). */
  previous: (day: number) => number;
  /** Days on which the plan jumps by a fixed cost. */
  fixedDays: number[];
  /** Linear forecast of month-end spending. */
  forecastEnd: number;
  /** Variable plan per day (slope of the plan between fixed costs). */
  variablePlanPerDay: number;
}

export function paceModel(): PaceModel {
  const plan = (d: number) => Math.round(fixedTo(d) + (VAR_PLAN * d) / DAYS);
  const actual = (d: number) => {
    const day = Math.min(d, TODAY);
    return fixedTo(day) + VAR_ACTUAL.slice(0, day + 1).reduce((a, b) => a + b, 0);
  };
  const previous = (d: number) =>
    Math.round(fixedTo(d) + 167000 * Math.pow(d / DAYS, 1.08) + (d > 9 ? 4000 : 0));
  const rate = (actual(TODAY) - fixedTo(TODAY)) / TODAY;
  const forecastEnd = Math.round(
    actual(TODAY) + (FIXED_TOTAL - fixedTo(TODAY)) + rate * (DAYS - TODAY),
  );
  return {
    plan,
    actual,
    previous,
    fixedDays: Object.keys(FIXED).map(Number),
    forecastEnd,
    variablePlanPerDay: VAR_PLAN / DAYS,
  };
}
