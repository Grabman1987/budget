import { describe, expect, it } from 'vitest';
import {
  averageRateCents,
  forecastMonth,
  goalProgress,
  goalStatus,
  goalTotals,
  monthsLeft,
  neededMonthlyCents,
  remainingCents,
} from './goals';

describe('remainingCents', () => {
  it('is target minus saved and never negative', () => {
    expect(remainingCents(300_000, 54_000)).toBe(246_000);
    expect(remainingCents(300_000, 300_000)).toBe(0);
    expect(remainingCents(300_000, 350_000)).toBe(0);
  });
});

describe('monthsLeft', () => {
  it('counts the months after the viewed month up to the target month', () => {
    expect(monthsLeft('2026-09', '2027-07-31')).toBe(10);
    expect(monthsLeft('2026-09', '2026-10-01')).toBe(1);
    expect(monthsLeft('2025-12', '2026-01-15')).toBe(1);
    expect(monthsLeft('2026-09', '2027-09-30')).toBe(12);
  });
  it('is 1 when the target month is the viewed one or has passed, null without a date', () => {
    expect(monthsLeft('2026-09', '2026-09-30')).toBe(1);
    expect(monthsLeft('2026-09', '2026-01-31')).toBe(1);
    expect(monthsLeft('2026-09', null)).toBeNull();
  });
});

describe('neededMonthlyCents', () => {
  it('rounds up to the cent so the target is met in time', () => {
    expect(neededMonthlyCents(100_000, 3)).toBe(33_334);
    expect(neededMonthlyCents(246_000, 10)).toBe(24_600);
    expect(neededMonthlyCents(1, 12)).toBe(1);
  });
  it('is 0 when nothing is missing and treats fewer than 1 month as 1', () => {
    expect(neededMonthlyCents(0, 5)).toBe(0);
    expect(neededMonthlyCents(5_000, 0)).toBe(5_000);
  });
});

describe('averageRateCents', () => {
  it('averages the last three months, rounded to the cent', () => {
    expect(averageRateCents([25_000, 25_000, 25_000])).toBe(25_000);
    expect(averageRateCents([0, 0, 0, 10_000, 10_000, 10_001])).toBe(10_000);
    expect(averageRateCents([1, 1, 2])).toBe(1);
    expect(averageRateCents([1, 2, 2])).toBe(2);
  });
  it('averages what exists when there are fewer months; 0 for none', () => {
    expect(averageRateCents([10_000, 20_000])).toBe(15_000);
    expect(averageRateCents([])).toBe(0);
  });
  it('keeps a negative month (money taken out) in the average', () => {
    expect(averageRateCents([30_000, 30_000, -30_000])).toBe(10_000);
  });
});

describe('forecastMonth', () => {
  it('is the month after as many months as the rate needs', () => {
    expect(forecastMonth('2026-09', 246_000, 25_000)).toBe('2027-07');
    expect(forecastMonth('2026-09', 25_000, 25_000)).toBe('2026-10');
    expect(forecastMonth('2026-09', 25_001, 25_000)).toBe('2026-11');
  });
  it('is the viewed month when nothing is missing, null without a positive rate', () => {
    expect(forecastMonth('2026-09', 0, 0)).toBe('2026-09');
    expect(forecastMonth('2026-09', 100, 0)).toBeNull();
    expect(forecastMonth('2026-09', 100, -5)).toBeNull();
  });
});

describe('goalStatus', () => {
  const base = { savedCents: 100, targetCents: 1_000, targetDate: '2027-03-31' };
  it('reached when the target is met', () => {
    expect(goalStatus({ ...base, savedCents: 1_000, forecast: null })).toBe('reached');
  });
  it('on track when the forecast is full by the target month, else behind', () => {
    expect(goalStatus({ ...base, forecast: '2027-03' })).toBe('on_track');
    expect(goalStatus({ ...base, forecast: '2027-04' })).toBe('behind');
    expect(goalStatus({ ...base, forecast: null })).toBe('behind');
  });
  it('without a target date, on track as long as it fills at all', () => {
    expect(goalStatus({ ...base, targetDate: null, forecast: '2031-01' })).toBe('on_track');
    expect(goalStatus({ ...base, targetDate: null, forecast: null })).toBe('behind');
  });
});

describe('goalProgress', () => {
  const urlaub = {
    month: '2026-09',
    targetCents: 300_000,
    targetDate: '2027-07-31',
    savedCents: 54_000,
  };
  it('combines the figures: needed rate and status agree', () => {
    const fast = goalProgress({ ...urlaub, recentMonthlyCents: [25_000, 25_000, 25_000] });
    expect(fast).toEqual({
      savedCents: 54_000,
      remainingCents: 246_000,
      monthsLeft: 10,
      neededMonthlyCents: 24_600,
      averageRateCents: 25_000,
      forecastMonth: '2027-07',
      status: 'on_track',
    });
    const slow = goalProgress({ ...urlaub, recentMonthlyCents: [24_000, 24_000, 24_000] });
    expect(slow.status).toBe('behind');
    expect(slow.forecastMonth).toBe('2027-08');
    expect(slow.neededMonthlyCents).toBe(24_600);
  });
  it('a reached goal needs nothing and has no forecast', () => {
    const r = goalProgress({ ...urlaub, savedCents: 310_000, recentMonthlyCents: [0, 0, 0] });
    expect(r).toMatchObject({
      savedCents: 310_000,
      remainingCents: 0,
      monthsLeft: null,
      neededMonthlyCents: 0,
      forecastMonth: null,
      status: 'reached',
    });
  });
  it('a negative saved amount counts as 0', () => {
    const r = goalProgress({ ...urlaub, savedCents: -500, recentMonthlyCents: [] });
    expect(r.savedCents).toBe(0);
    expect(r.remainingCents).toBe(300_000);
    expect(r.status).toBe('behind');
  });
  it('without a target date there is no needed rate', () => {
    const r = goalProgress({
      ...urlaub,
      targetDate: null,
      recentMonthlyCents: [30_000, 30_000, 30_000],
    });
    expect(r.monthsLeft).toBeNull();
    expect(r.neededMonthlyCents).toBeNull();
    expect(r.forecastMonth).toBe('2027-06');
    expect(r.status).toBe('on_track');
  });
  it('an overdue goal asks for the rest at once and is behind', () => {
    const r = goalProgress({
      ...urlaub,
      targetDate: '2026-08-31',
      recentMonthlyCents: [50_000, 50_000, 50_000],
    });
    expect(r.neededMonthlyCents).toBe(246_000);
    expect(r.status).toBe('behind');
  });
});

describe('goalTotals', () => {
  it('sums the figures; a missing needed rate counts as 0', () => {
    expect(
      goalTotals([
        { targetCents: 100, savedCents: 40, remainingCents: 60, neededMonthlyCents: 10 },
        { targetCents: 200, savedCents: 0, remainingCents: 200, neededMonthlyCents: null },
      ]),
    ).toEqual({ targetCents: 300, savedCents: 40, remainingCents: 260, neededMonthlyCents: 10 });
    expect(goalTotals([])).toEqual({
      targetCents: 0,
      savedCents: 0,
      remainingCents: 0,
      neededMonthlyCents: 0,
    });
  });
});
