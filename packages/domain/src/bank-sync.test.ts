import { describe, expect, it } from 'vitest';
import {
  bankCents,
  bankMatches,
  canLinkTransfer,
  withinBankWindow,
  bankFetchFrom,
  bankTransactionKeys,
  matchBankLines,
  consentNeedsAttention,
  nextBankRun,
} from './bank-sync';

describe('bank sync arithmetic and identity', () => {
  it('parses exact cents and rejects precision loss', () => {
    expect(bankCents('-12.01')).toBe(-1201);
    expect(bankCents('0.29')).toBe(29);
    expect(bankCents('12.5')).toBe(1250);
    for (const value of ['1.001', 'NaN', '1e2', '90071992547409.92'])
      expect(() => bankCents(value)).toThrow();
  });
  it('preserves identical purchases and stable references', () => {
    const row = {
      reference: null,
      date: '2026-09-01',
      amountCents: -129,
      currency: 'EUR',
      memo: 'Shop A',
    };
    const keys = bankTransactionKeys([
      row,
      row,
      { ...row, reference: 'entry-a' },
      { ...row, reference: 'entry-a' },
    ]);
    expect(new Set(keys).size).toBe(4);
    expect(bankTransactionKeys([row, row])).toEqual(keys.slice(0, 2));
    expect(bankTransactionKeys([{ ...row, reference: 'entry-a' }])).toEqual([
      JSON.stringify(['reference', 'entry-a']),
    ]);
    const duplicates = [
      { ...row, reference: 'shared' },
      { ...row, reference: 'shared', amountCents: -130 },
    ];
    expect(bankTransactionKeys(duplicates)).toEqual(
      bankTransactionKeys(duplicates.map((r) => ({ ...r, reference: null }))),
    );
  });
  it('starts at the owner date, then overlaps 21 days from the account success', () => {
    expect(bankFetchFrom('2023-10-01', null)).toBe('2023-10-01');
    expect(bankFetchFrom('2023-10-01', '2026-10-01T03:00:00Z')).toBe('2026-09-10');
    expect(bankFetchFrom('2026-09-25', '2026-10-01T03:00:00Z')).toBe('2026-09-25');
  });
  it('warns exactly 14 days before expiry, including expired consents', () => {
    expect(consentNeedsAttention('2026-10-15T00:00:00Z', new Date('2026-10-01T00:00:00Z'))).toBe(
      true,
    );
    expect(consentNeedsAttention('2026-10-15T00:00:01Z', new Date('2026-10-01T00:00:00Z'))).toBe(
      false,
    );
    expect(nextBankRun(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10-02T02:30:00.000Z');
  });
});

describe('bank matching calendar window', () => {
  const candidate = {
    id: 'bank',
    accountId: 'a',
    date: '2026-10-27',
    currency: 'EUR',
    amountCents: -129,
  };
  it('includes both fifth-day boundaries across daylight saving time', () => {
    expect(withinBankWindow('2026-10-22', '2026-10-27')).toBe(true);
    expect(withinBankWindow('2026-10-21', '2026-10-27')).toBe(false);
    expect(withinBankWindow('invalid', '2026-10-27')).toBe(false);
    expect(bankMatches(candidate, [{ ...candidate, id: 'b', date: '2026-11-01' }])).toHaveLength(1);
  });
  it('ranks by exact day distance and stable identity; transfer means opposite amount', () => {
    expect(
      bankMatches(candidate, [
        { ...candidate, id: 'z' },
        { ...candidate, id: 'a' },
        { ...candidate, id: 'far', date: '2026-10-24' },
      ]).map((b) => b.id),
    ).toEqual(['a', 'z', 'far']);
    expect(
      canLinkTransfer(candidate, { ...candidate, id: 'other', accountId: 'b', amountCents: 129 }),
    ).toBe(true);
    expect(
      canLinkTransfer(candidate, { ...candidate, id: 'other', accountId: 'b', amountCents: -129 }),
    ).toBe(false);
    expect(
      canLinkTransfer(
        { ...candidate, amountCents: 0 },
        { ...candidate, id: 'other', accountId: 'b', amountCents: 0 },
      ),
    ).toBe(false);
  });
});

describe('matchBankLines', () => {
  const line = (key: string, date: string, amountCents = -1201) => ({
    key,
    accountId: 'giro',
    date,
    amountCents,
    currency: 'EUR',
  });
  const booking = (id: string, date: string, amountCents = -1201, accountId = 'giro') => ({
    id,
    accountId,
    date,
    amountCents,
    currency: 'EUR',
  });
  const result = (lines: ReturnType<typeof line>[], bookings: ReturnType<typeof booking>[]) =>
    Object.fromEntries(matchBankLines(lines, bookings));

  it('links an exact match and a match four days away', () => {
    expect(result([line('a', '2026-09-30')], [booking('x', '2026-09-30')])).toEqual({
      a: { kind: 'linked', bookingId: 'x' },
    });
    expect(result([line('a', '2026-09-30')], [booking('x', '2026-09-26')])).toEqual({
      a: { kind: 'linked', bookingId: 'x' },
    });
  });
  it('ignores other amounts, accounts and days beyond the window', () => {
    expect(
      result(
        [line('a', '2026-09-30')],
        [
          booking('x', '2026-09-25'),
          booking('y', '2026-09-30', -1200),
          booking('z', '2026-09-30', -1201, 'other'),
        ],
      ),
    ).toEqual({ a: { kind: 'none' } });
  });
  it('reports several candidates, nearest first, without choosing', () => {
    expect(
      result(
        [line('a', '2026-09-30')],
        [booking('far', '2026-09-27'), booking('near', '2026-09-29')],
      ),
    ).toEqual({ a: { kind: 'ambiguous', bookingIds: ['near', 'far'] } });
  });
  it('never gives one booking to two lines: the nearest line wins, the other is new', () => {
    expect(
      result([line('a', '2026-10-02'), line('b', '2026-09-30')], [booking('x', '2026-09-30')]),
    ).toEqual({ a: { kind: 'none' }, b: { kind: 'linked', bookingId: 'x' } });
  });
  it('pairs identical lines with as many identical bookings, in order', () => {
    expect(
      result(
        [line('a', '2026-09-30'), line('b', '2026-09-30')],
        [booking('x', '2026-09-30'), booking('y', '2026-09-30')],
      ),
    ).toEqual({
      a: { kind: 'linked', bookingId: 'x' },
      b: { kind: 'linked', bookingId: 'y' },
    });
  });
  it('keeps identical lines ambiguous when there are more bookings than lines', () => {
    const found = result(
      [line('a', '2026-09-30'), line('b', '2026-09-30')],
      [booking('x', '2026-09-30'), booking('y', '2026-09-30'), booking('z', '2026-09-30')],
    );
    expect(found['a']!.kind).toBe('ambiguous');
    expect(found['b']!.kind).toBe('ambiguous');
  });
});
