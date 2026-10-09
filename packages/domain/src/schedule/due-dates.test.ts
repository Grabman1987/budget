import { describe, expect, it } from 'vitest';
import {
  dueDates,
  nextRepeatDate,
  shiftToBusinessDay,
  weekInterval,
  type ScheduleRule,
} from './due-dates';

const rule = (over: Partial<ScheduleRule> = {}): ScheduleRule => ({
  rhythm: 'monthly',
  dueDay: 15,
  dueMonth: null,
  dateShift: 'none',
  startDate: null,
  endDate: null,
  ...over,
});

describe('dueDates: rhythms', () => {
  it('monthly: every month in the range', () => {
    expect(dueDates(rule(), '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  it('includes both range ends and nothing outside', () => {
    expect(dueDates(rule(), '2026-01-15', '2026-02-15')).toEqual(['2026-01-15', '2026-02-15']);
    expect(dueDates(rule(), '2026-01-16', '2026-02-14')).toEqual([]);
  });

  it('quarterly: every third month from due_month', () => {
    expect(
      dueDates(rule({ rhythm: 'quarterly', dueMonth: 2 }), '2026-01-01', '2026-12-31'),
    ).toEqual(['2026-02-15', '2026-05-15', '2026-08-15', '2026-11-15']);
  });

  it('semiannual: every sixth month from due_month', () => {
    expect(
      dueDates(rule({ rhythm: 'semiannual', dueMonth: 4 }), '2026-01-01', '2027-06-30'),
    ).toEqual(['2026-04-15', '2026-10-15', '2027-04-15']);
  });

  it('yearly: the due month only', () => {
    expect(dueDates(rule({ rhythm: 'yearly', dueMonth: 6 }), '2026-01-01', '2028-12-31')).toEqual([
      '2026-06-15',
      '2027-06-15',
      '2028-06-15',
    ]);
  });

  it('yearly without due_month falls back to the start month, then January', () => {
    expect(
      dueDates(rule({ rhythm: 'yearly', startDate: '2025-09-02' }), '2026-01-01', '2026-12-31'),
    ).toEqual(['2026-09-15']);
    expect(dueDates(rule({ rhythm: 'yearly' }), '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
    ]);
  });
});

describe('dueDates: month ends', () => {
  it('31 and days past the month end mean the last day', () => {
    expect(dueDates(rule({ dueDay: 31 }), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(dueDates(rule({ dueDay: 30 }), '2026-02-01', '2026-02-28')).toEqual(['2026-02-28']);
  });

  it('leap years have a 29th of February', () => {
    expect(dueDates(rule({ dueDay: 29 }), '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
    expect(dueDates(rule({ dueDay: 31 }), '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
    expect(dueDates(rule({ dueDay: 29 }), '2027-02-01', '2027-02-28')).toEqual(['2027-02-28']);
  });
});

describe('dueDates: start and end', () => {
  it('drops dates before the start and after the end (both inclusive)', () => {
    const r = rule({ startDate: '2026-02-15', endDate: '2026-04-15' });
    expect(dueDates(r, '2026-01-01', '2026-12-31')).toEqual([
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
  });
});

describe('dueDates: date shift', () => {
  it('none keeps a weekend day', () => {
    expect(dueDates(rule({ dueDay: 27 }), '2026-06-01', '2026-06-30')).toEqual(['2026-06-27']);
  });

  it('before moves to the previous business day, after to the next', () => {
    // 27.06.2026 is a Saturday
    expect(dueDates(rule({ dueDay: 27, dateShift: 'before' }), '2026-06-01', '2026-06-30')).toEqual(
      ['2026-06-26'],
    );
    expect(dueDates(rule({ dueDay: 27, dateShift: 'after' }), '2026-06-01', '2026-06-30')).toEqual([
      '2026-06-29',
    ]);
  });

  it('salary on the last business day: 31st, shifted before', () => {
    const r = rule({ dueDay: 31, dateShift: 'before' });
    expect(dueDates(r, '2026-08-01', '2026-10-31')).toEqual([
      '2026-08-31',
      '2026-09-30',
      '2026-10-30', // 31.10.2026 is a Saturday
    ]);
  });

  it('skips holidays: New Year moves to the next business day', () => {
    const r = rule({ dueDay: 1, dateShift: 'after' });
    expect(dueDates(r, '2027-01-01', '2027-01-31')).toEqual(['2027-01-04']);
  });

  it('a shift across a month end lands in the other month, inside the range filter', () => {
    // 31.01.2027 is a Sunday, shifted after: Monday 01.02.2027
    const r = rule({ dueDay: 31, dateShift: 'after' });
    expect(dueDates(r, '2027-01-01', '2027-01-31')).toEqual([]);
    expect(dueDates(r, '2027-02-01', '2027-02-28')).toEqual(['2027-02-01']);
    expect(dueDates(r, '2027-03-01', '2027-03-31')).toEqual(['2027-03-01', '2027-03-31']);
    // 01.05.2027 is a Saturday (and a holiday), shifted before: Friday 30.04.2027
    const before = rule({ dueDay: 1, dateShift: 'before' });
    expect(dueDates(before, '2027-04-01', '2027-04-30')).toEqual(['2027-04-01', '2027-04-30']);
  });
});

describe('dueDates: weekly with an interval', () => {
  const weekly = (over: Partial<ScheduleRule> = {}) =>
    rule({ rhythm: 'weekly', startDate: '2026-01-02', ...over });

  it('every week without an interval, and interval 1 or null equal it', () => {
    const old = dueDates(weekly(), '2026-01-01', '2026-02-28');
    expect(old).toHaveLength(9);
    expect(old[0]).toBe('2026-01-02');
    expect(old[8]).toBe('2026-02-27');
    expect(dueDates(weekly({ intervalWeeks: 1 }), '2026-01-01', '2026-02-28')).toEqual(old);
    expect(dueDates(weekly({ intervalWeeks: null }), '2026-01-01', '2026-02-28')).toEqual(old);
  });

  it('every 2 weeks from the start date, across month boundaries', () => {
    expect(dueDates(weekly({ intervalWeeks: 2 }), '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-02',
      '2026-01-16',
      '2026-01-30',
      '2026-02-13',
      '2026-02-27',
      '2026-03-13',
      '2026-03-27',
    ]);
  });

  it('keeps the cadence across a year boundary and for a range far from the start', () => {
    const r = weekly({ startDate: '2026-12-04', intervalWeeks: 2 });
    expect(dueDates(r, '2026-12-01', '2027-01-31')).toEqual([
      '2026-12-04',
      '2026-12-18',
      '2027-01-01',
      '2027-01-15',
      '2027-01-29',
    ]);
    // 2026-12-04 + 26 * 14 days = 2027-12-03, the cadence does not restart with the range
    expect(dueDates(r, '2027-11-20', '2027-12-10')).toEqual(['2027-12-03']);
  });

  it('every 3 weeks and the end date', () => {
    expect(
      dueDates(weekly({ intervalWeeks: 3, endDate: '2026-02-28' }), '2026-01-01', '2026-12-31'),
    ).toEqual(['2026-01-02', '2026-01-23', '2026-02-13']);
  });

  it('does not produce due dates before the start date', () => {
    expect(dueDates(weekly({ intervalWeeks: 2 }), '2025-12-01', '2026-01-10')).toEqual([
      '2026-01-02',
    ]);
  });

  it('the business-day shift applies to every occurrence', () => {
    // 01.01.2027 (Friday) is a holiday: before -> Thursday 31.12.2026, after -> Monday 04.01.2027
    const base = { startDate: '2026-12-18', intervalWeeks: 2 };
    expect(dueDates(weekly({ ...base, dateShift: 'before' }), '2026-12-01', '2027-01-31')).toEqual([
      '2026-12-18',
      '2026-12-31',
      '2027-01-15',
      '2027-01-29',
    ]);
    expect(dueDates(weekly({ ...base, dateShift: 'after' }), '2026-12-01', '2027-01-31')).toEqual([
      '2026-12-18',
      '2027-01-04',
      '2027-01-15',
      '2027-01-29',
    ]);
  });

  it('an invalid interval falls back to every week', () => {
    expect(weekInterval(0)).toBe(1);
    expect(weekInterval(53)).toBe(1);
    expect(weekInterval(2.5)).toBe(1);
    expect(weekInterval(undefined)).toBe(1);
    expect(weekInterval(52)).toBe(52);
  });

  it('nextRepeatDate adds the interval for a weekly rhythm only', () => {
    expect(nextRepeatDate('2026-12-30', 'weekly')).toBe('2027-01-06');
    expect(nextRepeatDate('2026-12-30', 'weekly', 2)).toBe('2027-01-13');
    expect(nextRepeatDate('2026-01-31', 'monthly', 2)).toBe('2026-02-28');
  });
});

describe('shiftToBusinessDay', () => {
  it('leaves a business day alone', () => {
    expect(shiftToBusinessDay('2026-09-30', 'before')).toBe('2026-09-30');
  });
});
