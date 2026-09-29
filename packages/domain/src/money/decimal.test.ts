import { describe, expect, it } from 'vitest';
import { cents } from './cents';
import { formatDecimal } from './format';
import { parseAmount } from './parse';

describe('formatDecimal (amount field text)', () => {
  it('formats German decimals with grouping and no currency sign', () => {
    expect(formatDecimal(cents(2070))).toBe('20,70');
    expect(formatDecimal(cents(123456))).toBe('1.234,56');
    expect(formatDecimal(cents(0))).toBe('0,00');
  });

  it('uses the real minus for negative values', () => {
    expect(formatDecimal(cents(-5))).toBe('−0,05');
  });

  it('round-trips through parseAmount', () => {
    for (const value of [0, 1, 99, 100, 157600, 123456, -1, -123456, 100000000]) {
      const r = parseAmount(formatDecimal(cents(value)));
      expect(r).toEqual({ ok: true, cents: value });
    }
  });
});
