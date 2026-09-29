import { describe, expect, it } from 'vitest';
import { cents } from '../money/cents';
import { balanceChain, type ChainTerm } from './balance';

const t = (label: string, value: number, op?: ChainTerm['op']): ChainTerm => ({
  label,
  value: cents(value),
  ...(op ? { op } : {}),
});
const values = (terms: ChainTerm[], precision?: 'euro' | 'cent') =>
  balanceChain(terms, precision).map((x) => x.value);

describe('balanceChain (largest-remainder rounding of displayed euro parts)', () => {
  it('rounds every part to whole euros, half away from zero', () => {
    expect(values([t('a', 1050), t('b', 249, '+'), t('=', 1299, '=')])).toEqual([1100, 200, 1300]);
    expect(values([t('a', -1050)])).toEqual([-1100]);
  });

  it('lets the largest part absorb a rounding gap so the parts add up as shown', () => {
    // 333,40 + 333,40 + 333,40 = 1.000,20 -> 333 + 333 + 333 = 999, but the result shows 1.000
    const out = values([
      t('a', 33340),
      t('b', 33340, '+'),
      t('c', 33340, '+'),
      t('=', 100020, '='),
    ]);
    expect(out).toEqual([33400, 33300, 33300, 100000]);
    expect((out[0] ?? 0) + (out[1] ?? 0) + (out[2] ?? 0)).toBe(out[3]);
  });

  it('respects subtraction: the gap is applied with the sign of the absorbing part', () => {
    // 1.000,60 - 500,40 = 500,20 -> 1.001 - 500 = 501, result shows 500
    const out = values([t('a', 100060), t('b', 50040, '-'), t('=', 50020, '=')]);
    expect(out).toEqual([100000, 50000, 50000]);
    expect((out[0] ?? 0) - (out[1] ?? 0)).toBe(out[2]);
  });

  it('subtracted part absorbs with inverted direction when it is the largest', () => {
    // 100,40 - 700,40 = -600,00 exactly: parts 100 - 700 = -600 ok, no change needed
    expect(values([t('a', 10040), t('b', 70040, '-'), t('=', -60000, '=')])).toEqual([
      10000, 70000, -60000,
    ]);
    // 100,60 - 700,60 = -600 -> 101 - 701 = -600 ok
    // 100,50 - 700,40 = -599,90 -> 101 - 700 = -599 vs result -600 -> d = -1; largest is b (700, sub)
    const out = values([t('a', 10050), t('b', 70040, '-'), t('=', -59990, '=')]);
    expect(out).toEqual([10100, 70100, -60000]);
    expect((out[0] ?? 0) - (out[1] ?? 0)).toBe(out[2]);
  });

  it('leaves genuine mismatches alone (more than 4 euros apart)', () => {
    const out = values([t('a', 100000), t('b', 50000, '+'), t('=', 160000, '=')]);
    expect(out).toEqual([100000, 50000, 160000]);
  });

  it('never moves the result term itself', () => {
    const out = balanceChain([t('a', 33340), t('b', 33340, '+'), t('=', 66690, '=')]);
    expect(out[2]?.value).toBe(66700);
  });

  it('handles several segments; the previous result starts the next one fixed', () => {
    const out = values([
      t('a', 33340),
      t('b', 33340, '+'),
      t('=', 66690, '='),
      t('c', 10000, '+'),
      t('=', 76690, '='),
    ]);
    // 667 = 334 + 333, then 667 + 100 = 767
    expect(out).toEqual([33400, 33300, 66700, 10000, 76700]);
  });

  it('does not touch exact chains or cent precision', () => {
    expect(values([t('a', 1000), t('b', 250, '+'), t('=', 1250, '=')], 'cent')).toEqual([
      1000, 250, 1250,
    ]);
    const cent = values([t('a', 33340), t('b', 33340, '+'), t('=', 66680, '=')], 'cent');
    expect(cent).toEqual([33340, 33340, 66680]);
  });

  it('returns a chain without result unchanged apart from rounding', () => {
    expect(values([t('a', 120), t('b', 130, '+')])).toEqual([100, 100]);
  });

  it('keeps labels, operators and flags', () => {
    const out = balanceChain([
      { label: 'Übertrag', value: cents(100), signed: true },
      { label: 'Zugewiesen', value: cents(100), op: '-' },
      { label: 'Zu verteilen', value: cents(0), op: '=', result: true },
    ]);
    expect(out.map((x) => [x.label, x.op, x.signed, x.result])).toEqual([
      ['Übertrag', undefined, true, undefined],
      ['Zugewiesen', '-', undefined, undefined],
      ['Zu verteilen', '=', undefined, true],
    ]);
  });
});
