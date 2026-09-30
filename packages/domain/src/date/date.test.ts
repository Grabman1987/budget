import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  lastDayOfMonth,
  monthOf,
  monthsBetween,
  nextMonth,
  todayInVienna,
} from './date';

describe('todayInVienna', () => {
  it('is the Vienna calendar day, also around midnight and the DST switches', () => {
    expect(todayInVienna(new Date('2026-09-29T21:59:00Z'))).toBe('2026-09-29'); // 23:59 CEST
    expect(todayInVienna(new Date('2026-09-29T22:00:00Z'))).toBe('2026-09-30'); // 00:00 CEST
    expect(todayInVienna(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01'); // 00:30 CET
    expect(todayInVienna(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29'); // before the switch
    expect(todayInVienna(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-25'); // 00:30 CEST
  });
});

describe('month arithmetic', () => {
  it('adds and subtracts months across years', () => {
    expect(addMonths('2023-10', 3)).toBe('2024-01');
    expect(addMonths('2024-01', -1)).toBe('2023-12');
    expect(addMonths('2026-09', -36)).toBe('2023-09');
    expect(nextMonth('2025-12')).toBe('2026-01');
    expect(() => addMonths('2026-13', 1)).toThrow(RangeError);
  });

  it('lists months, last days and day distances', () => {
    expect(monthsBetween('2023-11', '2024-02')).toEqual([
      '2023-11',
      '2023-12',
      '2024-01',
      '2024-02',
    ]);
    expect(monthsBetween('2024-02', '2024-01')).toEqual([]);
    expect(monthsBetween('2023-10', '2026-09')).toHaveLength(36);
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
    expect(lastDayOfMonth('2026-09')).toBe('2026-09-30');
    expect(monthOf('2026-09-17')).toBe('2026-09');
    expect(daysBetween('2025-01-01', '2026-01-01')).toBe(365);
    expect(daysBetween('2026-03-01', '2026-02-01')).toBe(-28);
  });
});

describe('addDays', () => {
  it('moves across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2026-09-30', 0)).toBe('2026-09-30');
  });
});
