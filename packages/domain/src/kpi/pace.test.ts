import { describe, expect, it } from 'vitest';
import { paceModel, type PaceFixed, type PaceSpending } from './pace';

const day = (n: number, month = '2026-09') => `${month}-${String(n).padStart(2, '0')}`;

// The sample of design/prototype/app.js, September 2026, in cents.
const LIMIT = 330_000;
const FIXED: PaceFixed[] = [
  [1, 89_000],
  [3, 41_200],
  [15, 6000],
  [20, 1799],
  [22, 2500],
  [25, 10_500],
].map(([d, cents]) => ({ day: day(d as number), cents: cents as number }));
const VAR_ACTUAL = [
  0, 2200, 4800, 1500, 6100, 3000, 900, 7200, 2500, 4000, 1800, 5500, 3300, 4700, 2000, 6400, 5800,
  7334,
];
const SPENDING: PaceSpending[] = [
  ...VAR_ACTUAL.map((cents, d) => ({ day: day(Math.max(d, 1)), cents: d === 0 ? 0 : cents })),
  ...FIXED.filter((f) => f.day <= day(17)).map((f) => ({ day: f.day, cents: f.cents })),
];

describe('paceModel: prototype sample, September 2026 (today 17.09.)', () => {
  const m = paceModel({
    month: '2026-09',
    today: day(17),
    limitCents: LIMIT,
    fixed: FIXED,
    spending: SPENDING,
  });

  it('reproduces spent, plan to date, delta and the month-end forecast of the prototype', () => {
    // prototype (floats): 2.052,34 / 2.376,339 / −323,999 / 2.728,237
    expect(m.figures).toEqual({
      spentCents: 205_234,
      planToDateCents: 237_634,
      deltaCents: -32_400,
      forecastEndCents: 272_824,
      forecastAvailable: true,
      limitCents: LIMIT,
      variableSoFarCents: 69_034,
      openFixedCents: 14_799,
      over: false,
    });
  });

  it('plan: fixed costs on their due day, the variable rest linear', () => {
    expect(m.daysInMonth).toBe(30);
    expect(m.plan[0]).toBe(0);
    expect(m.plan[1]).toBe(89_000 + 5967); // 179.001 / 30 = 5.966,7
    expect(m.plan[30]).toBe(LIMIT);
    expect(m.fixedDays).toEqual([1, 3, 15, 20, 22, 25]);
    // jump of exactly the fixed cost over the day before (plus one day of variable plan)
    expect((m.plan[3] ?? 0) - (m.plan[2] ?? 0)).toBeGreaterThan(41_200);
  });

  it('actual is cumulative up to today only; previous holds the previous month', () => {
    expect(m.actual).toHaveLength(18);
    expect(m.actual[1]).toBe(89_000 + 2200);
    expect(m.actual[17]).toBe(205_234);
    expect(m.previous).toHaveLength(31);
  });
});

describe('paceModel edge cases', () => {
  it('over plan: delta is positive', () => {
    const m = paceModel({
      month: '2026-09',
      today: day(10),
      limitCents: 30_000,
      fixed: [],
      spending: [{ day: day(2), cents: 20_000 }],
    });
    expect(m.figures.planToDateCents).toBe(10_000);
    expect(m.figures.deltaCents).toBe(10_000);
    expect(m.figures.over).toBe(true);
    // rate 2.000 per day for 20 more days
    expect(m.figures.forecastEndCents).toBe(60_000);
  });

  it('before the month: nothing spent, forecast is the plan', () => {
    const m = paceModel({
      month: '2026-10',
      today: '2026-09-30',
      limitCents: 100_000,
      fixed: [{ day: '2026-10-05', cents: 40_000 }],
      spending: [],
    });
    expect(m.todayDay).toBe(0);
    expect(m.actual).toEqual([0]);
    expect(m.figures.forecastEndCents).toBe(100_000);
    expect(m.figures.deltaCents).toBe(0);
  });

  it('after the month: complete, the forecast is the actual', () => {
    const m = paceModel({
      month: '2026-09',
      today: '2026-10-03',
      limitCents: 1000,
      fixed: [],
      spending: [{ day: day(30), cents: 500 }],
    });
    expect(m.todayDay).toBe(30);
    expect(m.figures.forecastEndCents).toBe(500);
  });

  it('no limit and no spending: zeros, no division by zero; refunds do not make a negative rate', () => {
    const empty = paceModel({
      month: '2026-09',
      today: day(5),
      limitCents: 0,
      fixed: [],
      spending: [],
    });
    expect(empty.figures.forecastEndCents).toBe(0);
    expect(empty.plan.every((v) => v === 0)).toBe(true);
    const refund = paceModel({
      month: '2026-09',
      today: day(5),
      limitCents: 10_000,
      fixed: [],
      spending: [{ day: day(2), cents: -5000 }],
    });
    expect(refund.figures.spentCents).toBe(-5000);
    expect(refund.figures.forecastEndCents).toBe(-5000);
  });

  it('fixed costs above the limit leave no variable plan; overdue unpaid fixed costs stay open', () => {
    const m = paceModel({
      month: '2026-09',
      today: day(10),
      limitCents: 10_000,
      fixed: [
        { day: day(2), cents: 8000, settled: false },
        { day: day(4), cents: 7000 },
        { day: '2026-10-01', cents: 999 }, // other month: ignored
      ],
      spending: [{ day: day(4), cents: 7000 }],
    });
    expect(m.plan[30]).toBe(15_000);
    expect(m.figures.openFixedCents).toBe(8000);
    expect(m.figures.forecastEndCents).toBe(7000 + 8000);
  });

  it('previous month curve: cumulative, carried on when the previous month is shorter', () => {
    const m = paceModel({
      month: '2026-03',
      today: '2026-03-05',
      limitCents: 0,
      fixed: [],
      spending: [],
      previousSpending: [
        { day: '2026-02-10', cents: 100 },
        { day: '2026-02-28', cents: 50 },
        { day: '2026-01-31', cents: 9999 }, // not the previous month
      ],
    });
    expect(m.previous).toHaveLength(32);
    expect(m.previous[9]).toBe(0);
    expect(m.previous[10]).toBe(100);
    expect(m.previous[28]).toBe(150);
    expect(m.previous[31]).toBe(150);
  });
});

it('does not extrapolate early rent/insurance and hides the first six days', () => {
  const m = paceModel({
    month: '2026-09',
    today: day(3),
    limitCents: 150000,
    fixed: [
      { day: day(1), cents: 90000, settled: true },
      { day: day(3), cents: 10000, settled: true },
    ],
    fixedSpentCents: 100000,
    spending: [
      { day: day(1), cents: 90000 },
      { day: day(3), cents: 10000 },
      { day: day(2), cents: 3000 },
    ],
  });
  expect(m.figures).toMatchObject({
    spentCents: 103000,
    planToDateCents: 105000,
    variableSoFarCents: 3000,
    openFixedCents: 0,
    forecastEndCents: 130000,
    forecastAvailable: false,
  });
});
it('uses actual fixed amounts, counts an open bill once and extrapolates only variable spending', () => {
  const m = paceModel({
    month: '2026-09',
    today: day(10),
    limitCents: 150000,
    fixedSpentCents: 95000,
    fixed: [
      { day: day(1), cents: 90000, settled: true },
      { day: day(20), cents: 10000, settled: false },
    ],
    spending: [
      { day: day(1), cents: 95000 },
      { day: day(2), cents: 5000 },
    ],
  });
  expect(m.figures).toMatchObject({
    variableSoFarCents: 5000,
    openFixedCents: 10000,
    forecastEndCents: 120000,
    forecastAvailable: true,
  });
});
