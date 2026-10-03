import { describe, expect, it } from 'vitest';
import { distributeRest, emptyDraft, newSplit } from './booking-model';

describe('Rest verteilen', () => {
  const draft = (first: string, second: string) => ({
    ...emptyDraft('account', '2026-10-03'),
    amount: '50,01',
    splitOn: true,
    splits: [newSplit({ amount: first }), newSplit({ amount: second })],
  });
  it('replaces a populated active line with the remaining cents', () => {
    const d = draft('10', '20');
    expect(distributeRest(d, d.splits[1]!.key).splits.map((s) => s.amount)).toEqual([
      '10',
      '40,01',
    ]);
    expect(d.splits[1]!.amount).toBe('20');
  });
  it('keeps refund signs and permits a negative remainder', () => {
    const d = draft('60', '');
    expect(distributeRest(d, d.splits[1]!.key).splits[1]!.amount).toBe('−9,99');
  });
  it('does not overwrite the active line when another amount is invalid', () => {
    const d = draft('invalid', '20');
    expect(distributeRest(d, d.splits[1]!.key)).toBe(d);
  });
});
