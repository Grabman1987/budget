import { describe, expect, it } from 'vitest';
import { isMonth, monthLabel, monthOf, shiftMonth } from './month';

describe('month helpers', () => {
  it('accepts only YYYY-MM', () => {
    expect(isMonth('2026-09')).toBe(true);
    for (const bad of ['2026-9', '2026-13', '26-09', '2026-09-01', '', undefined, 202609])
      expect(isMonth(bad)).toBe(false);
  });

  it('formats a date as a month key', () => {
    expect(monthOf(new Date(2026, 8, 17))).toBe('2026-09');
    expect(monthOf(new Date(2027, 0, 1))).toBe('2027-01');
  });

  it('moves across year boundaries', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-01', -13)).toBe('2024-12');
    expect(shiftMonth('kaputt', 1)).toBe('kaputt');
  });

  it('labels the month in German', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
    expect(monthLabel('2026-03')).toBe('März 2026');
  });
});
