import { describe, expect, it } from 'vitest';
import { easterSunday, isBusinessDayAT, isPublicHolidayAT } from './holidays';

describe('easterSunday', () => {
  it('matches known dates', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
});

describe('isPublicHolidayAT', () => {
  it('knows the fixed and the Easter-derived holidays of 2026', () => {
    const holidays = [
      '2026-01-01',
      '2026-01-06',
      '2026-04-06', // Easter Monday
      '2026-05-01',
      '2026-05-14', // Ascension
      '2026-05-25', // Whit Monday
      '2026-06-04', // Corpus Christi
      '2026-08-15',
      '2026-10-26',
      '2026-11-01',
      '2026-12-08',
      '2026-12-25',
      '2026-12-26',
    ];
    for (const day of holidays) expect(isPublicHolidayAT(day), day).toBe(true);
    expect(isPublicHolidayAT('2026-04-03')).toBe(false); // Good Friday is no holiday
    expect(isPublicHolidayAT('2026-12-24')).toBe(false);
  });

  it('knows the Easter-derived holidays of 2027', () => {
    for (const day of ['2027-03-29', '2027-05-06', '2027-05-17', '2027-05-27'])
      expect(isPublicHolidayAT(day), day).toBe(true);
    expect(isPublicHolidayAT('2027-03-28')).toBe(false); // Easter Sunday is a Sunday anyway
  });
});

describe('isBusinessDayAT', () => {
  it('excludes weekends and holidays', () => {
    expect(isBusinessDayAT('2026-09-30')).toBe(true); // Wednesday
    expect(isBusinessDayAT('2026-09-26')).toBe(false); // Saturday
    expect(isBusinessDayAT('2026-09-27')).toBe(false); // Sunday
    expect(isBusinessDayAT('2026-10-26')).toBe(false); // Monday, National Day
    expect(isBusinessDayAT('2027-01-01')).toBe(false); // Friday, New Year
  });
});
