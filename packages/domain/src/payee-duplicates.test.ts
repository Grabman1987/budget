import { describe, expect, it } from 'vitest';
import {
  findPayeeDuplicateGroups,
  matchPayeeAlias,
  payeeAliasKeys,
  payeeNameKey,
} from './payee-duplicates';

describe('payeeNameKey', () => {
  it('ignores case, diacritics and whitespace', () => {
    expect(payeeNameKey('  Bäckerei   MUSTER ')).toBe('backerei muster');
    expect(payeeNameKey('Bäckerei Muster')).toBe(payeeNameKey('backerei  muster'));
  });
  it('strips processor prefixes and trailing reference or location tokens', () => {
    expect(payeeNameKey('Payment for Bäckerei Muster')).toBe(payeeNameKey('Bäckerei Muster'));
    expect(payeeNameKey('Zahlung an Bäckerei Muster')).toBe(payeeNameKey('Bäckerei Muster'));
    expect(payeeNameKey('PAYPAL *Shop Muster')).toBe('shop muster');
    expect(payeeNameKey('Shop Muster Wien')).toBe('shop muster');
    expect(payeeNameKey('Shop Muster 1234')).toBe('shop muster');
    expect(payeeNameKey('Shop Muster #77 Wien')).toBe('shop muster');
  });
  it('never reduces a name to nothing', () => {
    expect(payeeNameKey('Wien')).toBe('wien');
    expect(payeeNameKey('123')).toBe('123');
  });
});

describe('findPayeeDuplicateGroups', () => {
  const p = (id: string, name: string, bookingCount = 0) => ({ id, name, bookingCount });
  it('groups equal keys and small typos, main suggestion first', () => {
    const groups = findPayeeDuplicateGroups([
      p('1', 'Bäckerei Muster', 5),
      p('2', 'Payment for Bäckerei Muster', 2),
      p('3', 'Baeckerei Mustr', 1),
      p('4', 'Tankstelle Beispiel', 3),
      p('5', 'Kino', 1),
      p('6', 'Kini', 1),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((m) => m.id)).toEqual(['1', '2', '3']);
    expect(groups[0]!.reason).toBe('similar');
  });
  it('marks identical keys as equal and leaves short names alone', () => {
    const groups = findPayeeDuplicateGroups([p('a', 'Shop Muster'), p('b', 'SHOP MUSTER Wien')]);
    expect(groups).toEqual([
      { members: [p('a', 'Shop Muster'), p('b', 'SHOP MUSTER Wien')], reason: 'equal' },
    ]);
    expect(findPayeeDuplicateGroups([p('x', 'Kino'), p('y', 'Kini')])).toEqual([]);
  });
  it('returns nothing without duplicates', () => {
    expect(findPayeeDuplicateGroups([p('1', 'Alpha Markt'), p('2', 'Beta Service')])).toEqual([]);
  });
});

describe('alias matching', () => {
  const aliases = [{ rawKey: 'payment for bäckerei muster', payeeId: 'main' }];
  it('stores exact and cleaned keys', () => {
    expect(payeeAliasKeys('Payment for Bäckerei Muster')).toEqual([
      'payment for bäckerei muster',
      'backerei muster',
    ]);
  });
  it('matches the raw text exactly, case-insensitively', () => {
    expect(matchPayeeAlias(aliases, ['PAYMENT FOR  Bäckerei Muster'])?.payeeId).toBe('main');
  });
  it('matches through the cleaned key and prefers earlier candidates', () => {
    const cleaned = [{ rawKey: 'backerei muster', payeeId: 'main' }];
    expect(matchPayeeAlias(cleaned, ['Bäckerei Muster 4711'])?.payeeId).toBe('main');
    const two = [
      { rawKey: 'a', payeeId: '1' },
      { rawKey: 'b', payeeId: '2' },
    ];
    expect(matchPayeeAlias(two, ['b', 'a'])?.payeeId).toBe('2');
    expect(matchPayeeAlias(two, ['zzz'])).toBeUndefined();
  });
});
