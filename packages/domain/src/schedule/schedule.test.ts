import { describe, expect, it } from 'vitest';
import type { ScheduleRule } from './due-dates';
import {
  assignMatches,
  candidateFits,
  matchOccurrence,
  monthlyEquivalent,
  occurrenceStatus,
  occurrences,
  shareOf,
  versionOn,
  versionSuggestion,
  yearlyEquivalent,
  type MatchCandidate,
  type Occurrence,
  type SchedulePayment,
} from './occurrences';

const rule: ScheduleRule = {
  rhythm: 'monthly',
  dueDay: 10,
  dueMonth: null,
  dateShift: 'none',
  startDate: null,
  endDate: null,
};
const payment = (over: Partial<SchedulePayment> = {}): SchedulePayment => ({
  ...rule,
  kind: 'outflow',
  contactShareBp: 0,
  ...over,
});
const versions = [
  { validFrom: '2026-03-01', amountCents: 5000, amountMaxCents: null },
  { validFrom: '2025-01-01', amountCents: 4000, amountMaxCents: null },
];

describe('versionOn', () => {
  it('takes the latest version that has started, whatever the order', () => {
    expect(versionOn(versions, '2024-12-31')).toBeUndefined();
    expect(versionOn(versions, '2025-01-01')?.amountCents).toBe(4000);
    expect(versionOn(versions, '2026-02-28')?.amountCents).toBe(4000);
    expect(versionOn(versions, '2026-03-01')?.amountCents).toBe(5000);
  });
});

describe('shareOf', () => {
  it('rounds half away from zero and keeps the sign', () => {
    expect(shareOf(10000, 10000)).toBe(10000);
    expect(shareOf(-10000, 5000)).toBe(-5000);
    expect(shareOf(-1001, 5000)).toBe(-501); // 500,5 rounds away from zero
    expect(shareOf(1001, 5000)).toBe(501);
    expect(shareOf(999, 3333)).toBe(333);
    expect(shareOf(-999, 0)).toBe(0);
  });
});

describe('occurrences', () => {
  it('signs outflows negative and inflows positive, per version, with the contact share', () => {
    const out = occurrences(
      payment({ contactShareBp: 5000 }),
      versions,
      '2026-02-01',
      '2026-03-31',
    );
    expect(out).toEqual([
      { dueDate: '2026-02-10', amountCents: -4000, amountMaxCents: null, contactShareCents: -2000 },
      { dueDate: '2026-03-10', amountCents: -5000, amountMaxCents: null, contactShareCents: -2500 },
    ]);
    const inflow = occurrences(payment({ kind: 'inflow' }), versions, '2026-03-01', '2026-03-31');
    expect(inflow[0]?.amountCents).toBe(5000);
  });

  it('skips dates before the first version and carries a range maximum', () => {
    const ranged = [{ validFrom: '2026-02-01', amountCents: 1000, amountMaxCents: 1500 }];
    const out = occurrences(payment(), ranged, '2026-01-01', '2026-02-28');
    expect(out).toEqual([
      { dueDate: '2026-02-10', amountCents: -1000, amountMaxCents: -1500, contactShareCents: 0 },
    ]);
  });
});

const occ = (over: Partial<Occurrence> = {}): Occurrence => ({
  dueDate: '2026-03-10',
  amountCents: -5000,
  amountMaxCents: null,
  contactShareCents: 0,
  ...over,
});
const cand = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id: 'b1',
  date: '2026-03-10',
  amountCents: -5000,
  ...over,
});

describe('matchOccurrence', () => {
  it('received when the amount is inside the tolerance, deviating outside', () => {
    expect(matchOccurrence(occ(), [cand()], 0, 3)?.status).toBe('received');
    expect(matchOccurrence(occ(), [cand({ amountCents: -5050 })], 50, 3)?.status).toBe('received');
    expect(matchOccurrence(occ(), [cand({ amountCents: -5051 })], 50, 3)?.status).toBe('deviating');
  });

  it('a range counts every amount between min and max as received', () => {
    const ranged = occ({ amountCents: -1000, amountMaxCents: -1500 });
    expect(matchOccurrence(ranged, [cand({ amountCents: -1400 })], 0, 3)?.status).toBe('received');
    expect(matchOccurrence(ranged, [cand({ amountCents: -1501 })], 0, 3)?.status).toBe('deviating');
    expect(matchOccurrence(ranged, [cand({ amountCents: -999 })], 1, 3)?.status).toBe('received');
  });

  it('only the window and the same sign count', () => {
    expect(matchOccurrence(occ(), [cand({ date: '2026-03-13' })], 0, 3)?.candidate.id).toBe('b1');
    expect(matchOccurrence(occ(), [cand({ date: '2026-03-14' })], 0, 3)).toBeNull();
    expect(matchOccurrence(occ(), [cand({ date: '2026-03-07' })], 0, 3)).not.toBeNull();
    expect(matchOccurrence(occ(), [cand({ amountCents: 5000 })], 0, 3)).toBeNull();
  });

  it('picks the nearest day first, then the nearest amount, then the smaller id', () => {
    const a = cand({ id: 'a', date: '2026-03-12', amountCents: -5000 });
    const b = cand({ id: 'b', date: '2026-03-11', amountCents: -4000 });
    expect(matchOccurrence(occ(), [a, b], 0, 3)?.candidate.id).toBe('b');
    const c = cand({ id: 'c', date: '2026-03-11', amountCents: -4900 });
    expect(matchOccurrence(occ(), [b, c], 0, 3)?.candidate.id).toBe('c');
    const d = cand({ id: 'd', date: '2026-03-11', amountCents: -4900 });
    expect(matchOccurrence(occ(), [d, c], 0, 3)?.candidate.id).toBe('c');
  });
});

describe('assignMatches', () => {
  it('gives a booking to one occurrence only, and exact fits win over deviating ones', () => {
    const first = occ({ dueDate: '2026-03-10', amountCents: -4800 });
    const second = occ({ dueDate: '2026-03-11', amountCents: -2800 });
    const bookings = [
      cand({ id: 'kfz', date: '2026-03-10', amountCents: -2800 }),
      cand({ id: 'unf', date: '2026-03-11', amountCents: -4800 }),
    ];
    const result = assignMatches(
      [
        { key: 'first', occurrence: first, candidates: bookings, toleranceCents: 0, windowDays: 3 },
        {
          key: 'second',
          occurrence: second,
          candidates: bookings,
          toleranceCents: 0,
          windowDays: 3,
        },
      ],
      new Set(),
    );
    expect(result.get('first')?.candidate.id).toBe('unf');
    expect(result.get('second')?.candidate.id).toBe('kfz');
    expect(result.get('first')?.status).toBe('received');
  });

  it('skips claimed bookings and leaves occurrences without a booking out', () => {
    const result = assignMatches(
      [{ key: 'x', occurrence: occ(), candidates: [cand()], toleranceCents: 0, windowDays: 3 }],
      new Set(['b1']),
    );
    expect(result.size).toBe(0);
  });

  it('never matches a skipped (gestrichen) occurrence, even to a booking that fits exactly', () => {
    const planned = occ({ dueDate: '2026-03-10', amountCents: -4800 });
    const input = {
      candidates: [cand({ id: 'exact', date: '2026-03-10', amountCents: -4800 })],
      toleranceCents: 0,
      windowDays: 3,
    };
    const result = assignMatches(
      [
        { key: 'skipped', status: 'skipped', occurrence: planned, ...input },
        {
          key: 'open',
          status: 'expected',
          occurrence: { ...planned, dueDate: '2026-03-12' },
          ...input,
        },
      ],
      new Set(),
    );
    expect(result.has('skipped')).toBe(false);
    // The booking stays free for the occurrence that is still open.
    expect(result.get('open')?.candidate.id).toBe('exact');
  });
});

describe('occurrenceStatus', () => {
  it('received and deviating come from the match, missed after the window, else expected', () => {
    const base = { dueDate: '2026-03-10', windowDays: 3 };
    expect(occurrenceStatus({ ...base, today: '2026-03-10', match: { status: 'received' } })).toBe(
      'received',
    );
    expect(occurrenceStatus({ ...base, today: '2026-03-10', match: { status: 'deviating' } })).toBe(
      'deviating',
    );
    expect(occurrenceStatus({ ...base, today: '2026-03-13', match: null })).toBe('expected');
    expect(occurrenceStatus({ ...base, today: '2026-03-14', match: null })).toBe('missed');
  });
});

describe('versionSuggestion', () => {
  it('proposes the booked amount from the month of the occurrence', () => {
    expect(versionSuggestion('ep-1', occ(), cand({ amountCents: -5500 }))).toEqual({
      paymentId: 'ep-1',
      fromMonth: '2026-03',
      amountCents: 5500,
    });
    const inflow = versionSuggestion(
      'ep-2',
      occ({ amountCents: 5000 }),
      cand({ amountCents: 4200 }),
    );
    expect(inflow).toEqual({ paymentId: 'ep-2', fromMonth: '2026-03', amountCents: 4200 });
  });
});

describe('candidateFits', () => {
  const target = {
    accountId: 'giro',
    payeeId: 'p1',
    contactId: 'c1',
    categoryId: 'cat1',
    incomeTypeId: null,
  };
  const booking = {
    accountId: 'giro',
    payeeId: null,
    payeeContactId: null,
    categoryIds: [] as string[],
    incomeTypeIds: [] as string[],
  };
  it('needs the account and one matching key: payee, its contact, category or income type', () => {
    expect(candidateFits(target, booking)).toBe(false);
    expect(candidateFits(target, { ...booking, payeeId: 'p1' })).toBe(true);
    expect(candidateFits(target, { ...booking, payeeContactId: 'c1' })).toBe(true);
    expect(candidateFits(target, { ...booking, categoryIds: ['x', 'cat1'] })).toBe(true);
    expect(candidateFits(target, { ...booking, payeeId: 'p1', accountId: 'other' })).toBe(false);
    const income = { ...target, categoryId: null, incomeTypeId: 'inc' };
    expect(candidateFits(income, { ...booking, incomeTypeIds: ['inc'] })).toBe(true);
  });
  it('a payment without any key fits nothing', () => {
    const none = {
      accountId: 'giro',
      payeeId: null,
      contactId: null,
      categoryId: null,
      incomeTypeId: null,
    };
    expect(candidateFits(none, { ...booking, payeeId: 'p1' })).toBe(false);
  });
});

describe('equivalents', () => {
  it('yearly and monthly equivalents per rhythm, rounded half away from zero', () => {
    expect(yearlyEquivalent('monthly', -1000)).toBe(-12000);
    expect(yearlyEquivalent('quarterly', 3000)).toBe(12000);
    expect(yearlyEquivalent('semiannual', 500)).toBe(1000);
    expect(monthlyEquivalent('yearly', -48600)).toBe(-4050);
    expect(monthlyEquivalent('yearly', 100)).toBe(8); // 8,33
    expect(monthlyEquivalent('yearly', 150)).toBe(13); // 12,5
    expect(monthlyEquivalent('yearly', -150)).toBe(-13);
    expect(monthlyEquivalent('monthly', 1599)).toBe(1599);
    expect(monthlyEquivalent('monthly', 0)).toBe(0);
  });

  it('weekly: every n weeks pays 52 / n times a year, rounded once half away from zero', () => {
    // 52 * 100000 / 12 = 433333,33
    expect(monthlyEquivalent('weekly', 100000)).toBe(433333);
    expect(monthlyEquivalent('weekly', 100000, 1)).toBe(433333);
    expect(monthlyEquivalent('weekly', 100000, null)).toBe(433333);
    // 52 * 100000 / 24 = 216666,67
    expect(monthlyEquivalent('weekly', 100000, 2)).toBe(216667);
    expect(monthlyEquivalent('weekly', -100000, 2)).toBe(-216667);
    // 52 * 100000 / 36 = 144444,44
    expect(monthlyEquivalent('weekly', 100000, 3)).toBe(144444);
    expect(yearlyEquivalent('weekly', 100000)).toBe(5_200_000);
    expect(yearlyEquivalent('weekly', 100000, 2)).toBe(2_600_000);
    expect(yearlyEquivalent('weekly', 100000, 3)).toBe(1_733_333);
    expect(yearlyEquivalent('weekly', -100000, 3)).toBe(-1_733_333);
    // the interval is ignored for every other rhythm
    expect(monthlyEquivalent('monthly', 1599, 2)).toBe(1599);
    expect(yearlyEquivalent('quarterly', 3000, 2)).toBe(12000);
  });
});
