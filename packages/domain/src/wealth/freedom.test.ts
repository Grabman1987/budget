import { describe, expect, it } from 'vitest';
import {
  averageCents,
  compoundStep,
  freedomAnnualSpendCents,
  freedomMonths,
  freedomProgressBp,
  freedomTargetCents,
  projectFreedom,
  requiredMonthlySavingCents,
  sollPfad,
  valueAfterMonths,
} from './index';

// Prototype (design/prototype/vermoegen.js): 39.600 € annual spend, invested 88.000 €, 700 € per month, 5 % real.
const TARGET = freedomTargetCents(3_960_000);
const INVESTED = 8_800_000;

describe('R16 progress', () => {
  it('prototype: 88.000 € of 990.000 € is 8,9 %', () => {
    expect(TARGET).toBe(99_000_000);
    expect(freedomProgressBp(INVESTED, TARGET)).toBe(889);
  });
  it('is not capped and is 0 without a target', () => {
    expect(freedomProgressBp(150, 100)).toBe(15_000);
    expect(freedomProgressBp(150, 0)).toBe(0);
  });
  it('annual spend: last 12 months, scaled when fewer, 0 without data', () => {
    expect(freedomAnnualSpendCents(Array.from({ length: 14 }, (_, i) => (i < 2 ? 1 : 100)))).toBe(
      1_200,
    );
    expect(freedomAnnualSpendCents([100, 200])).toBe(1_800);
    expect(freedomAnnualSpendCents([])).toBe(0);
    expect(averageCents([100, 201])).toBe(151);
    expect(averageCents([])).toBe(0);
  });
});

describe('compounding', () => {
  it('rounds the monthly interest once per step, half up', () => {
    expect(compoundStep(100_000, 500, 0)).toBe(100_000 + 417); // 416,67 -> 417
    expect(compoundStep(100_000, 500, 2_500)).toBe(102_917);
    expect(compoundStep(120, 500, 0)).toBe(120 + 1); // 0,5 -> 1
    expect(compoundStep(100, 500, 0)).toBe(100); // 0,42 -> 0
    expect(valueAfterMonths(100_000, 2, 0, 1_000)).toBe(102_000);
  });
});

describe('projectFreedom', () => {
  it('prototype: 363 months (30,25 years) and +100 € is 16 months earlier', () => {
    const p = projectFreedom({
      investedCents: INVESTED,
      monthlySavingCents: 70_000,
      realReturnBp: 500,
      targetCents: TARGET,
      startMonth: '2026-10',
    });
    expect(p.months).toBe(363);
    expect(p.monthsWithExtra).toBe(347);
    expect(p.monthsEarlier).toBe(16);
    expect(p.doneMonth).toBe('2057-01');
    expect(p.doneYear).toBe(2057);
    expect(p.yearlyPath[0]).toBe(INVESTED);
    expect(p.yearlyPath).toHaveLength(32);
    expect(p.yearlyPath.at(-1)).toBeGreaterThanOrEqual(TARGET);
  });

  it('0 % return: target is reached by saving alone', () => {
    const p = projectFreedom({
      investedCents: 0,
      monthlySavingCents: 10_000,
      realReturnBp: 0,
      targetCents: 100_000,
    });
    expect(p.months).toBe(10);
    expect(p.doneMonth).toBeNull();
    expect(p.monthsWithExtra).toBe(5);
    expect(p.monthsEarlier).toBe(5);
  });

  it('already above the target: 0 months, nothing earlier', () => {
    const p = projectFreedom({
      investedCents: 200_000,
      monthlySavingCents: 10_000,
      realReturnBp: 500,
      targetCents: 100_000,
      startMonth: '2026-10',
    });
    expect(p).toMatchObject({ months: 0, doneMonth: '2026-10', monthsEarlier: 0 });
    expect(p.yearlyPath).toEqual([200_000]);
  });

  it('unreachable within the horizon: null, but the extra saving may still reach it', () => {
    const p = projectFreedom({
      investedCents: 0,
      monthlySavingCents: 0,
      realReturnBp: 0,
      targetCents: 100_000,
      extraSavingCents: 10_000,
    });
    expect(p.months).toBeNull();
    expect(p.doneYear).toBeNull();
    expect(p.monthsWithExtra).toBe(10);
    expect(p.monthsEarlier).toBeNull();
  });
});

describe('requiredMonthlySavingCents', () => {
  it('is the smallest saving that reaches the target', () => {
    const s = requiredMonthlySavingCents({
      startCents: 100_000,
      months: 24,
      realReturnBp: 500,
      targetCents: 500_000,
    })!;
    expect(valueAfterMonths(100_000, 24, 500, s)).toBeGreaterThanOrEqual(500_000);
    expect(valueAfterMonths(100_000, 24, 500, s - 1)).toBeLessThan(500_000);
  });
  it('0 % return is a plain division rounded up', () => {
    expect(
      requiredMonthlySavingCents({ startCents: 0, months: 3, realReturnBp: 0, targetCents: 1_000 }),
    ).toBe(334);
  });
  it('0 when the start compounds to the target alone, null with no month left', () => {
    expect(
      requiredMonthlySavingCents({
        startCents: 100_000,
        months: 12,
        realReturnBp: 500,
        targetCents: 100_000,
      }),
    ).toBe(0);
    expect(
      requiredMonthlySavingCents({ startCents: 0, months: 0, realReturnBp: 500, targetCents: 100 }),
    ).toBeNull();
  });
});

describe('sollPfad', () => {
  // Prototype: 40.831 € in Oct 2023, goal year 2050, today Oct 2026 (36 months in).
  const soll = sollPfad({
    startCents: 4_083_100,
    startMonth: '2023-10',
    goalYear: 2050,
    targetCents: TARGET,
    realReturnBp: 500,
    todayMonth: '2026-10',
    investedCents: INVESTED,
  });

  it('prototype: constant rate 1.291,76 € over 315 months, Soll today about 97.484 €', () => {
    expect(soll.months).toBe(315);
    expect(soll.goalMonth).toBe('2050-01');
    expect(soll.monthlySavingCents).toBe(129_176); // float prototype: 1.291,75
    expect(soll.todayIndex).toBe(36);
    expect(soll.sollTodayCents).toBe(9_748_410); // float prototype: 97.483,70
    expect(Math.abs(soll.sollTodayCents - 9_748_370)).toBeLessThan(100);
    expect(soll.path).toHaveLength(316);
    expect(soll.path[0]).toBe(4_083_100);
    expect(soll.path[315]).toBeGreaterThanOrEqual(TARGET);
  });

  it('prototype: behind the Soll-Pfad by about 9.484 €, needs 1.349,31 € from today', () => {
    expect(soll.gapCents).toBe(INVESTED - 9_748_410);
    expect(soll.monthsLeft).toBe(279);
    expect(soll.neededMonthlySavingCents).toBe(134_931); // float prototype: 1.349,31
  });

  it('already above the target: rate 0, ahead of the plan, nothing needed', () => {
    const s = sollPfad({
      startCents: 200_000,
      startMonth: '2023-10',
      goalYear: 2030,
      targetCents: 100_000,
      realReturnBp: 500,
      todayMonth: '2026-10',
      investedCents: 300_000,
    });
    expect(s.monthlySavingCents).toBe(0);
    expect(s.neededMonthlySavingCents).toBe(0);
    expect(s.gapCents).toBeGreaterThan(0);
  });

  it('goal month in the past: today clamps to the goal, missed target cannot be caught up', () => {
    const s = sollPfad({
      startCents: 100_000,
      startMonth: '2020-01',
      goalYear: 2024,
      targetCents: 200_000,
      realReturnBp: 0,
      todayMonth: '2026-10',
      investedCents: 150_000,
    });
    expect(s.todayIndex).toBe(s.months);
    expect(s.monthsLeft).toBe(0);
    expect(s.neededMonthlySavingCents).toBeNull();
    expect(s.sollTodayCents).toBeGreaterThanOrEqual(200_000);
  });

  it('0 % return and an explicit goal month', () => {
    const s = sollPfad({
      startCents: 0,
      startMonth: '2026-01',
      goalYear: 2026,
      goalMonth: '2026-11',
      targetCents: 100_000,
      realReturnBp: 0,
      todayMonth: '2026-06',
      investedCents: 60_000,
    });
    expect(s.months).toBe(10);
    expect(s.monthlySavingCents).toBe(10_000);
    expect(s.sollTodayCents).toBe(50_000);
    expect(s.gapCents).toBe(10_000);
    expect(s.neededMonthlySavingCents).toBe(8_000);
  });
});

describe('public projection numeric boundary', () => {
  const input = {
    investedCents: 0,
    targetCents: 100_000,
    monthlySavingCents: 10_000,
    realReturnBp: 0,
  };
  it('rejects nonfinite, fractional and unsafe inputs', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => projectFreedom({ ...input, investedCents: value })).toThrow(RangeError);
    }
    expect(() => projectFreedom({ ...input, monthlySavingCents: Number.MAX_SAFE_INTEGER })).toThrow(
      RangeError,
    );
  });
  it('fails at an unsafe compound step, not an approximate forecast', () => {
    expect(() =>
      projectFreedom({
        ...input,
        investedCents: Number.MAX_SAFE_INTEGER - 1,
        targetCents: Number.MAX_SAFE_INTEGER,
        realReturnBp: 500,
      }),
    ).toThrow(RangeError);
  });
});

describe('exact cancellation at safe cent boundaries', () => {
  it('annualises a literal monthly cancellation without losing a cent', () => {
    expect(freedomAnnualSpendCents([Number.MAX_SAFE_INTEGER, 2, -Number.MAX_SAFE_INTEGER])).toBe(8);
  });
  it('rejects unsafe direct compound inputs before multiplication', () => {
    expect(() => compoundStep(0, Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(RangeError);
    expect(() => compoundStep(0.5, 500, 0)).toThrow(RangeError);
    expect(() => compoundStep(0, 500, Number.NaN)).toThrow(RangeError);
  });
  it('adds the three compound components exactly even with unsafe intermediate cancellation', () => {
    expect(compoundStep(-Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER)).toBe(
      -75_059_993_790,
    );
    expect(compoundStep(Number.MAX_SAFE_INTEGER, 1, -Number.MAX_SAFE_INTEGER)).toBe(75_059_993_790);
  });
});

it('months of freedom: 12/24/60 milestones, tenths and absent expense base', () => {
  expect(freedomMonths(1_200_000, 1_200_000)).toBe(120);
  expect(freedomMonths(2_400_000, 1_200_000)).toBe(240);
  expect(freedomMonths(6_000_000, 1_200_000)).toBe(600);
  expect(freedomMonths(125_000, 1_200_000)).toBe(13);
  expect(freedomMonths(100, 0)).toBeNull();
});
