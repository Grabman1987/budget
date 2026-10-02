import { describe, expect, it } from 'vitest';
import { averageCents, freedomAnnualSpendCents } from './freedom';
import { mulDivRound, ratioBp } from './int';

describe('exact half-up wealth arithmetic', () => {
  it.each([
    [0, 12, 1, 0],
    [10000, 12, 1, 120000],
    [-10000, 12, 1, -120000],
    [1, 1, 3, 0],
    [2, 1, 3, 1],
    [-1, 1, 3, 0],
    [-2, 1, 3, -1],
    [4, 1, 3, 1],
    [-4, 1, 3, -1],
    [2, 1, 5, 0],
    [3, 1, 5, 1],
    [1, 1, 2, 1],
    [-1, 1, 2, -1],
    [3, 1, 2, 2],
    [-3, 1, 2, -2],
    [9007199254740991, 10000, 10000, 9007199254740991],
  ])('%i × %i / %i rounds to %i', (a, b, divisor, expected) => {
    expect(mulDivRound(a, b, divisor)).toBe(expected);
  });

  it('annualises one known month and averages one amount without adding a cent', () => {
    expect(freedomAnnualSpendCents([10000])).toBe(120000);
    expect(freedomAnnualSpendCents([0])).toBe(0);
    expect(averageCents([10000])).toBe(10000);
    expect(averageCents([-10000])).toBe(-10000);
    expect(ratioBp(0, 1)).toBe(0);
    expect(ratioBp(1, 1)).toBe(10000);
  });

  it('still rejects a nonpositive divisor', () => {
    expect(() => mulDivRound(1, 1, 0)).toThrow(RangeError);
    expect(() => mulDivRound(1, 1, -1)).toThrow(RangeError);
  });
});
