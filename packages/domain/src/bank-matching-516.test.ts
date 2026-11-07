import { describe, expect, it } from 'vitest';
import { bankFetchFrom, bankMatches, bankTransactionKeys, matchBankLines } from './bank-sync';

const line = (key: string, date = '2026-10-27') => ({
  key,
  accountId: 'synthetic-account',
  date,
  amountCents: -1250,
  currency: 'EUR',
});
const booking = (id: string, date = '2026-10-27') => ({ ...line(id, date), id });
const match = (lines = [line('source')], bookings = [booking('target')]) =>
  Object.fromEntries(matchBankLines(lines, bookings));

describe('literal matching audit #516', () => {
  it.each([
    ['2026-10-22', 'none'],
    ['2026-10-23', 'linked'],
    ['2026-10-27', 'linked'],
    ['2026-10-31', 'linked'],
    ['2026-11-01', 'none'],
  ])('keeps the inclusive four-day link boundary at %s across DST/month end', (date, kind) => {
    expect(match([line('source')], [booking('target', date)])).toEqual({
      source: kind === 'linked' ? { kind, bookingId: 'target' } : { kind },
    });
  });

  it('requires exact signed cents, account and currency for links and suggestions', () => {
    const rows = [
      { ...booking('cent'), amountCents: -1251 },
      { ...booking('sign'), amountCents: 1250 },
      { ...booking('account'), accountId: 'other-account' },
      { ...booking('currency'), currency: 'USD' },
    ];
    expect(match([line('source')], rows)).toEqual({ source: { kind: 'none' } });
    expect(bankMatches(booking('source'), rows)).toEqual([]);
  });

  it('suggests both fifth days, excludes both sixth days and orders ties by date then ID', () => {
    const rows = [
      booking('after-six', '2026-11-02'),
      booking('after-five', '2026-11-01'),
      booking('before-six', '2026-10-21'),
      booking('before-five', '2026-10-22'),
      booking('later', '2026-10-28'),
      booking('z', '2026-10-26'),
      booking('a', '2026-10-26'),
    ];
    expect(bankMatches(booking('source'), rows).map((row) => row.id)).toEqual([
      'a',
      'z',
      'later',
      'before-five',
      'after-five',
    ]);
    expect(match([line('source')], rows)).toEqual({
      source: { kind: 'ambiguous', bookingIds: ['a', 'z', 'later'] },
    });
  });

  it('keeps even an exact-day candidate ambiguous beside another eligible candidate', () => {
    expect(match([line('source')], [booking('far', '2026-10-31'), booking('exact')])).toEqual({
      source: { kind: 'ambiguous', bookingIds: ['exact', 'far'] },
    });
  });

  it('retains input-order tie breaking when two singleton claims meet one booking', () => {
    expect(match([line('first', '2026-10-26'), line('second', '2026-10-28')])).toEqual({
      first: { kind: 'linked', bookingId: 'target' },
      second: { kind: 'none' },
    });
  });

  it('does not pair equal-sized groups when the target booking dates differ', () => {
    expect(
      match([line('a'), line('b')], [booking('x', '2026-10-26'), booking('y', '2026-10-28')]),
    ).toEqual({
      a: { kind: 'ambiguous', bookingIds: ['x', 'y'] },
      b: { kind: 'ambiguous', bookingIds: ['x', 'y'] },
    });
  });

  it.each([false, true])('keeps overlapping duplicate groups ambiguous, reversed=%s', (reverse) => {
    const lines = [line('a'), line('b'), line('c', '2026-10-28'), line('d', '2026-10-28')];
    expect(match(reverse ? lines.reverse() : lines, [booking('x'), booking('y')])).toEqual({
      a: { kind: 'ambiguous', bookingIds: ['x', 'y'] },
      b: { kind: 'ambiguous', bookingIds: ['x', 'y'] },
      c: { kind: 'ambiguous', bookingIds: ['x', 'y'] },
      d: { kind: 'ambiguous', bookingIds: ['x', 'y'] },
    });
  });

  it.each([
    ['2026-01-05T00:00:00Z', '2025-12-15'],
    ['2024-03-10T23:59:59Z', '2024-02-18'],
    ['2026-10-27T03:00:00Z', '2026-10-06'],
  ])('retains the literal 21-day UTC overlap from %s', (watermark, expected) => {
    expect(bankFetchFrom('2023-10-01', watermark)).toBe(expected);
  });
  it('clamps the overlap to the configured start, including equality', () => {
    expect(bankFetchFrom('2026-10-06', null)).toBe('2026-10-06');
    expect(bankFetchFrom('2026-10-06', '2026-10-27T03:00:00Z')).toBe('2026-10-06');
    expect(bankFetchFrom('2026-10-07', '2026-10-27T03:00:00Z')).toBe('2026-10-07');
  });

  it('keeps literal fallback ordinals on reordered complete batches and exposes batch limits', () => {
    const row = { ...line('source'), reference: 'shared', memo: ' Synthetic shop ' };
    const other = { ...row, amountCents: -1251 };
    const first = '["fallback","[\\"2026-10-27\\",-1250,\\"EUR\\",\\"Synthetic shop\\"]",1]';
    const second = '["fallback","[\\"2026-10-27\\",-1250,\\"EUR\\",\\"Synthetic shop\\"]",2]';
    const different = '["fallback","[\\"2026-10-27\\",-1251,\\"EUR\\",\\"Synthetic shop\\"]",1]';
    expect(bankTransactionKeys([row, row, other])).toEqual([first, second, different]);
    expect(bankTransactionKeys([other, row, row])).toEqual([different, first, second]);
    // A duplicate reference becoming unique is a different identity, not universal idempotency.
    expect(bankTransactionKeys([row])).toEqual(['["reference","shared"]']);
    expect(bankTransactionKeys([{ ...row, reference: null }])).toEqual([first]);
  });
});
