import { describe, expect, it } from 'vitest';
import { paceModel } from '../kpi/pace';
import { heuteWindow, nextPayday } from './payday';
import { paceForecastCurve } from './pace-forecast';
import { changeBp, netWorthDays, netWorthParts } from './net-worth';

describe('nextPayday', () => {
  it('is the first salary day on or after today', () => {
    expect(nextPayday(['2026-08-31', '2026-09-30', '2026-10-30'], '2026-09-17')).toEqual({
      day: '2026-09-30',
      source: 'salary',
    });
    expect(nextPayday(['2026-09-30'], '2026-09-30').day).toBe('2026-09-30');
  });
  it('takes the next month once the salary day has passed', () => {
    expect(nextPayday(['2026-09-30', '2026-10-30'], '2026-10-01').day).toBe('2026-10-30');
  });
  it('falls back to the end of the month without a salary', () => {
    expect(nextPayday([], '2026-02-10')).toEqual({ day: '2026-02-28', source: 'month_end' });
  });
});

describe('heuteWindow', () => {
  it('Monat spans the month, Bis Gehalt runs from today to the payday', () => {
    expect(heuteWindow('month', '2026-09', '2026-09-17', '2026-09-30')).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(heuteWindow('payday', '2026-09', '2026-09-17', '2026-09-30')).toMatchObject({
      period: 'payday',
      from: '2026-09-17',
      to: '2026-09-30',
    });
  });
  it('shows another month as the whole month', () => {
    expect(heuteWindow('payday', '2026-08', '2026-09-17', '2026-09-30')).toEqual({
      period: 'month',
      month: '2026-08',
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });
  it('is one day on the payday itself', () => {
    expect(heuteWindow('payday', '2026-09', '2026-09-30', '2026-09-30')).toMatchObject({
      from: '2026-09-30',
      to: '2026-09-30',
    });
  });
});

describe('paceForecastCurve', () => {
  const fixed = [
    { day: '2026-09-01', cents: 89_000 },
    { day: '2026-09-25', cents: 10_500 },
  ];
  const model = paceModel({
    month: '2026-09',
    today: '2026-09-17',
    limitCents: 330_000,
    fixed,
    spending: [
      { day: '2026-09-01', cents: 89_000 },
      { day: '2026-09-10', cents: 60_000 },
    ],
  });
  const curve = paceForecastCurve(model, fixed);
  it('starts at today and ends at the forecast of the month end', () => {
    expect(curve).toHaveLength(30 - 17 + 1);
    expect(curve[0]).toBe(model.figures.spentCents);
    expect(curve.at(-1)).toBe(model.figures.forecastEndCents);
  });
  it('jumps by the open fixed cost on its due day and never falls', () => {
    expect(curve[25 - 17]! - curve[24 - 17]!).toBeGreaterThanOrEqual(10_500);
    for (let i = 1; i < curve.length; i++) expect(curve[i]!).toBeGreaterThanOrEqual(curve[i - 1]!);
  });
});

describe('netWorthParts', () => {
  const parts = netWorthParts([
    { role: 'budget', valueCents: 149_700 },
    { role: 'budget', valueCents: -45_000 }, // card owed
    { role: 'reserve', valueCents: 773_900 },
    { role: 'investment', valueCents: 8_800_000 },
    { role: 'debt', valueCents: -1_217_600 },
  ]);
  it('splits into liquid, invested and debt that add up to the total', () => {
    expect(parts).toEqual({
      liquidCents: 923_600,
      investedCents: 8_800_000,
      receivableCents: 0,
      debtCents: -1_262_600,
      totalCents: 8_461_000,
    });
  });
});

describe('changeBp and netWorthDays', () => {
  it('rounds the change to whole basis points', () => {
    expect(changeBp(8_473_000, 8_574_400)).toBe(-118);
    expect(changeBp(100, 0)).toBeNull();
    expect(changeBp(-50, -100)).toBe(5000);
  });
  it('lists 11 month ends and today', () => {
    const days = netWorthDays('2026-09-17');
    expect(days).toHaveLength(12);
    expect(days[0]).toBe('2025-10-31');
    expect(days[10]).toBe('2026-08-31');
    expect(days[11]).toBe('2026-09-17');
  });
});
