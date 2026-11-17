import { describe, expect, it } from 'vitest';
import { averageCents, freedomAnnualSpendCents } from './freedom';
import { mulDivRound, ratioBp, roundDivCents } from './int';

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

describe('rounding policy conformance (docs/rounding.md)', () => {
  it.each([
    // [n, d, expected]: half away from zero, symmetric for negatives
    [1, 2, 1],
    [-1, 2, -1],
    [3, 2, 2],
    [-3, 2, -2],
    [5, 10, 1],
    [-5, 10, -1],
    [4, 10, 0],
    [-4, 10, 0],
    [6, 10, 1],
    [-6, 10, -1],
    [1, 3, 0],
    [-1, 3, 0],
    [2, 3, 1],
    [-2, 3, -1],
    [0, 7, 0],
    [-1, 1, -1],
    [100, 12, 8],
    [-100, 12, -8],
    [102, 12, 9],
    [-102, 12, -9],
  ])('roundDivCents(%i, %i) = %i', (n, d, expected) => {
    expect(roundDivCents(n, d)).toBe(expected);
  });

  it('never yields negative zero', () => {
    expect(Object.is(roundDivCents(-1, 3), 0)).toBe(true);
    expect(Object.is(mulDivRound(-1, 1, 3), 0)).toBe(true);
  });

  it('rejects a non-positive divisor', () => {
    expect(() => roundDivCents(1, 0)).toThrow(RangeError);
    expect(() => roundDivCents(1, -2)).toThrow(RangeError);
  });

  it('stays exact when the intermediate product passes 2^53', () => {
    // 9 007 199 254 740 990 × 2 000 000 000 000 / 3 000 000 000 000 = 6 004 799 503 160 660
    expect(mulDivRound(9_007_199_254_740_990, 2_000_000_000_000, 3_000_000_000_000)).toBe(
      6_004_799_503_160_660,
    );
    expect(mulDivRound(-9_007_199_254_740_990, 2_000_000_000_000, 3_000_000_000_000)).toBe(
      -6_004_799_503_160_660,
    );
    // a 90 000 000 000 000,00 EUR value in basis points: 9e15 × 10 000 / 9e15 = 10 000
    expect(mulDivRound(9_000_000_000_000_000, 10_000, 9_000_000_000_000_000)).toBe(10_000);
    // half-way case beyond 2^53: 9 007 199 254 740 991 × 5 000 / 10 000 = 4 503 599 627 370 495,5
    expect(mulDivRound(9_007_199_254_740_991, 5_000, 10_000)).toBe(4_503_599_627_370_496);
    expect(mulDivRound(-9_007_199_254_740_991, 5_000, 10_000)).toBe(-4_503_599_627_370_496);
  });
});
