import { describe, expect, it } from 'vitest';
import { cents } from './cents';
import { formatEuro } from './format';

describe('formatEuro (de-AT)', () => {
  it('formats with cents, thousands dots and a comma', () => {
    expect(formatEuro(cents(123456))).toBe('1.234,56 €');
    expect(formatEuro(cents(0))).toBe('0,00 €');
    expect(formatEuro(cents(5))).toBe('0,05 €');
    expect(formatEuro(cents(100000000))).toBe('1.000.000,00 €');
  });

  it('uses the real minus sign U+2212, never a hyphen', () => {
    expect(formatEuro(cents(-123456))).toBe('−1.234,56 €');
    expect(formatEuro(cents(-1))).toBe('−0,01 €');
  });

  it('prefixes + only with the sign option and never on zero', () => {
    expect(formatEuro(cents(1250), { sign: true })).toBe('+12,50 €');
    expect(formatEuro(cents(-1250), { sign: true })).toBe('−12,50 €');
    expect(formatEuro(cents(0), { sign: true })).toBe('0,00 €');
    expect(formatEuro(cents(1250))).toBe('12,50 €');
  });

  it('drops cents for KPIs and rounds half away from zero', () => {
    expect(formatEuro(cents(123456), { cents: false })).toBe('1.235 €');
    expect(formatEuro(cents(123449), { cents: false })).toBe('1.234 €');
    expect(formatEuro(cents(50), { cents: false })).toBe('1 €');
    expect(formatEuro(cents(-50), { cents: false })).toBe('−1 €');
    expect(formatEuro(cents(-1234567), { cents: false })).toBe('−12.346 €');
  });

  it('shows no minus when a negative value rounds to zero without cents', () => {
    expect(formatEuro(cents(-49), { cents: false })).toBe('0 €');
    expect(formatEuro(cents(-49), { cents: false, sign: true })).toBe('0 €');
  });
});
