import { describe, expect, it } from 'vitest';
import { dueDates, type ScheduleRule } from './due-dates';
import { occurrences } from './occurrences';

const monthly: ScheduleRule = {
  rhythm: 'monthly',
  dueDay: 1,
  dueMonth: null,
  dateShift: 'before',
  startDate: '2026-01-01',
  endDate: null,
};

describe('#607 canonical final-day pause boundaries', () => {
  it('filters the shifted Friday, not the nominal Sunday, including both endpoints', () => {
    expect(
      dueDates(
        { ...monthly, pauses: [{ fromDate: '2026-02-27', throughDate: '2026-02-27' }] },
        '2026-02-25',
        '2026-04-02',
      ),
    ).toEqual(['2026-04-01']);
    expect(
      dueDates(
        { ...monthly, pauses: [{ fromDate: '2026-03-01', throughDate: '2026-03-01' }] },
        '2026-02-25',
        '2026-04-02',
      ),
    ).toEqual(['2026-02-27', '2026-04-01']);
  });

  it('resumes the original fortnightly anchor and uses the actual later price version', () => {
    expect(
      occurrences(
        {
          ...monthly,
          rhythm: 'weekly',
          startDate: '2026-03-02',
          intervalWeeks: 2,
          dateShift: 'none',
          kind: 'outflow',
          contactShareBp: 3333,
          pauses: [{ fromDate: '2026-03-10', throughDate: '2026-03-30' }],
        },
        [
          { validFrom: '2026-01-01', amountCents: 1001, amountMaxCents: null },
          { validFrom: '2026-04-01', amountCents: 1501, amountMaxCents: null },
        ],
        '2026-03-01',
        '2026-04-14',
      ),
    ).toEqual([
      { dueDate: '2026-03-02', amountCents: -1001, amountMaxCents: null, contactShareCents: -334 },
      { dueDate: '2026-04-13', amountCents: -1501, amountMaxCents: null, contactShareCents: -500 },
    ]);
  });

  it('keeps the old inclusive end semantics and composes disjoint pauses without shifting dates', () => {
    const rule = { ...monthly, dueDay: 25, dateShift: 'none' as const, endDate: '2026-05-25' };
    expect(dueDates(rule, '2026-03-01', '2026-06-30')).toEqual([
      '2026-03-25',
      '2026-04-25',
      '2026-05-25',
    ]);
    expect(
      dueDates(
        {
          ...rule,
          pauses: [
            { fromDate: '2026-03-20', throughDate: '2026-03-25' },
            { fromDate: '2026-05-25', throughDate: '2026-06-01' },
          ],
        },
        '2026-03-01',
        '2026-06-30',
      ),
    ).toEqual(['2026-04-25']);
  });
});
