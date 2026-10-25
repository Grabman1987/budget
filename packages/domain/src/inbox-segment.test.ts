import { describe, expect, it } from 'vitest';
import { inboxSegment } from './inbox';

describe('inboxSegment', () => {
  it('puts bank movements to book into Umsätze and everything else into Aufgaben', () => {
    expect(inboxSegment({ type: 'booking' })).toBe('umsaetze');
    expect(inboxSegment({ type: 'stored', refType: 'bank-sync-candidate' })).toBe('umsaetze');
    expect(inboxSegment({ type: 'stored', refType: 'payslip-intake' })).toBe('aufgaben');
    expect(inboxSegment({ type: 'stored', refType: null })).toBe('aufgaben');
    expect(inboxSegment({ type: 'savings' })).toBe('aufgaben');
  });
});
