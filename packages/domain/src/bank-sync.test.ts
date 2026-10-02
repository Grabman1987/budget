import { describe, expect, it } from 'vitest';
import {
  bankCents,
  bankFetchFrom,
  bankTransactionKeys,
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
