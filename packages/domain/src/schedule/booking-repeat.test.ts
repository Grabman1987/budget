import { describe, expect, it } from 'vitest';
import { dueDates, nextRepeatDate } from './due-dates';
import { monthlyEquivalent, yearlyEquivalent } from './occurrences';

describe('booking repetition', () => {
  it('clamps month end and preserves the original day on later occurrences', () => {
    const next = nextRepeatDate('2028-01-31', 'monthly');
    expect(next).toBe('2028-02-29');
    expect(
      dueDates(
        {
          rhythm: 'monthly',
          dueDay: 31,
          dueMonth: null,
          startDate: next,
          endDate: null,
          dateShift: 'none',
        },
        next,
        '2028-04-30',
      ),
    ).toEqual(['2028-02-29', '2028-03-31', '2028-04-30']);
    expect(nextRepeatDate('2028-02-29', 'yearly')).toBe('2029-02-28');
  });
  it('weekly cadence crosses years and ranges, with bounded shifts and exact equivalents', () => {
    const rule = {
      rhythm: 'weekly' as const,
      dueDay: 28,
      dueMonth: null,
      startDate: '2026-12-28',
      endDate: '2027-01-18',
      dateShift: 'none' as const,
    };
    expect(dueDates(rule, '2026-12-30', '2027-02-01')).toEqual([
      '2027-01-04',
      '2027-01-11',
      '2027-01-18',
    ]);
    expect(nextRepeatDate('2026-12-28', 'weekly')).toBe('2027-01-04');
    expect(yearlyEquivalent('weekly', 1001)).toBe(52052);
    expect(monthlyEquivalent('weekly', 1001)).toBe(4338);
  });
});
