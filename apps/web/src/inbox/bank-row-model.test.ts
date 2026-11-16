import { describe, expect, it } from 'vitest';
import { bankRowMissing } from './bank-row-model';

describe('bank row completeness', () => {
  const complete = { ready: true, account: true, payee: true, category: true };
  it('requires settled checks, account, recipient and category', () => {
    expect(bankRowMissing(complete)).toBeUndefined();
    expect(bankRowMissing({ ...complete, ready: false })).toEqual({
      cell: 'suggestion',
      reason: 'Vorschläge werden geprüft.',
    });
    expect(bankRowMissing({ ...complete, account: false })?.cell).toBe('source');
    expect(bankRowMissing({ ...complete, payee: false })?.cell).toBe('payee');
    expect(bankRowMissing({ ...complete, category: false })).toEqual({
      cell: 'category',
      reason: 'Kategorie fehlt.',
    });
  });
  it('accepts a proven transfer target without payee or category', () => {
    expect(
      bankRowMissing({ ...complete, payee: false, category: false, transfer: true }),
    ).toBeUndefined();
    expect(bankRowMissing({ ...complete, account: false, transfer: true })?.cell).toBe('source');
  });
  it('keeps blocking review reasons even for complete or transfer rows', () => {
    expect(bankRowMissing({ ...complete, blocked: 'Mehrere mögliche Buchungen.' })).toEqual({
      cell: 'suggestion',
      reason: 'Mehrere mögliche Buchungen.',
    });
    expect(
      bankRowMissing({ ...complete, transfer: true, blocked: 'Vorschlag nicht verfügbar.' })
        ?.reason,
    ).toBe('Vorschlag nicht verfügbar.');
  });
  it('allows a validated known rule target without inventing a payee', () => {
    expect(bankRowMissing({ ...complete, payee: false, knownRule: true })).toBeUndefined();
    expect(bankRowMissing({ ...complete, account: false, knownRule: true })?.cell).toBe('source');
    expect(bankRowMissing({ ...complete, knownRule: true, blocked: 'Regel prüfen.' })?.reason).toBe(
      'Regel prüfen.',
    );
  });
});
