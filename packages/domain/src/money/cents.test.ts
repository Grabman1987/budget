import { describe, expect, it } from 'vitest';
import { cents } from './cents';

describe('cents', () => {
  it('accepts safe integers', () => {
    expect(cents(0)).toBe(0);
    expect(cents(-12345)).toBe(-12345);
    expect(cents(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects floats, NaN, Infinity and unsafe integers', () => {
    expect(() => cents(12.5)).toThrow(RangeError);
    expect(() => cents(Number.NaN)).toThrow(RangeError);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('normalises negative zero', () => {
    expect(Object.is(cents(-0), 0)).toBe(true);
  });
});
