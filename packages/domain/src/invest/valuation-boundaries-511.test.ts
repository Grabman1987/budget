import { describe, expect, it } from 'vitest';
import {
  marketValueCents,
  marketValueEurCents,
  toEurCents,
  unitsFor,
  ValuationLimitError,
  sumValuationCents,
} from './invest';
import { pickTradePrice, valueAtPrice } from './series';

describe('#511 existing valuation arithmetic boundaries', () => {
  it.each([
    [
      'operand',
      () => toEurCents(-9_007_199_254_740_994, 1_000_000),
      'Valuation requires safe integer operands',
    ],
    [
      'result',
      () => toEurCents(-4_503_599_627_370_497, 3_000_000),
      'Valuation result exceeds safe integer range',
    ],
  ] as const)(
    'identifies the %s boundary without weakening the existing RangeError contract',
    (boundary, calculate, message) => {
      expect(calculate).toThrow(RangeError);
      expect(calculate).toThrow(ValuationLimitError);
      try {
        calculate();
        throw new Error('Synthetic out-of-range conversion must be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(ValuationLimitError);
        if (!(error instanceof ValuationLimitError)) throw error;
        expect(error.boundary).toBe(boundary);
        expect(error.message).toBe(message);
      }
    },
  );
  it('retains literal native/EUR values and one signed position-day rounding', () => {
    expect(marketValueCents(1_000_000_000, 12_000_000)).toBe(12_000);
    expect(marketValueEurCents(1_000_000_000, 12_000_000, 950_000)).toBe(11_400);
    // One unit at USD0.014 and EUR1.10 per USD is1.54 cents, rounded only once.
    expect(marketValueEurCents(100_000_000, 14_000, 1_100_000)).toBe(2);
    expect(marketValueEurCents(-100_000_000, 14_000, 1_100_000)).toBe(-2);
    expect(toEurCents(1, 500_000)).toBe(1);
    expect(toEurCents(-1, 500_000)).toBe(-1);
    expect(unitsFor(12_345, 100_000_000)).toBe(123_450_000);
    expect(unitsFor(-12_345, 100_000_000)).toBe(-123_450_000);
  });

  it('retains the gross execution ratio before the single cent boundary', () => {
    const choice = pickTradePrice(
      [
        {
          date: '2026-09-16',
          kind: 'buy',
          unitsE8: 300_000_000,
          amountCents: 1,
          feeCents: 0,
          taxCents: 0,
        },
      ],
      '2026-09-17',
    );
    expect(choice).toBeDefined();
    if (!choice) throw new Error('Synthetic execution is required');
    expect(choice.price.priceMicro).toBe(3_333);
    // The exact gross ratio is half a cent after FX, rather than0.49995 cents.
    expect(valueAtPrice(100_000_000, choice, 1_500_000)).toBe(1);
    expect(valueAtPrice(-100_000_000, choice, 1_500_000)).toBe(-1);
  });

  it('excludes fees and taxes from the actual execution-price source', () => {
    const choice = pickTradePrice(
      [
        {
          date: '2026-09-16',
          kind: 'buy',
          unitsE8: 200_000_000,
          amountCents: 10_000,
          feeCents: 200,
          taxCents: 100,
        },
      ],
      '2026-09-17',
    );
    expect(choice).toBeDefined();
    if (!choice) throw new Error('Synthetic execution is required');
    expect(choice.price.priceMicro).toBe(50_000_000);
    expect(valueAtPrice(100_000_000, choice, 950_000)).toBe(4_750);
  });

  it('accepts a safe literal result even when its exact intermediate exceeds JS integer precision', () => {
    expect(marketValueCents(1_000_000_000_000, 9_007_199_254_740_991)).toBe(9_007_199_254_740_991);
    expect(marketValueEurCents(1_000_000_000_000, 9_007_199_254_740_991, 1_000_000)).toBe(
      9_007_199_254_740_991,
    );
  });

  it('preserves a maximum-safe identity cash conversion in both signs', () => {
    expect(toEurCents(9_007_199_254_740_991, 1_000_000)).toBe(9_007_199_254_740_991);
    expect(toEurCents(-9_007_199_254_740_991, 1_000_000)).toBe(-9_007_199_254_740_991);
  });

  it.each([
    ['native position cents', () => marketValueCents(1_000_000_000_000_000, 1_000_000_000_000_000)],
    [
      'EUR position cents',
      () => marketValueEurCents(1_000_000_000_000_000, 1_000_000_000_000_000, 1_000_000),
    ],
    ['cash conversion cents', () => toEurCents(9_007_199_254_740_991, 2_000_000)],
    ['purchased units', () => unitsFor(9_007_199_254_740_991, 1)],
  ] as const)('rejects an unsafe %s result despite safe integer operands', (_name, calculate) => {
    expect(calculate).toThrow(RangeError);
  });

  it('rejects an unsafe execution-valued result without rounding its source ratio first', () => {
    const choice = pickTradePrice(
      [
        {
          date: '2026-09-16',
          kind: 'buy',
          unitsE8: 100_000_000,
          amountCents: 1_000_000_000,
          feeCents: 0,
          taxCents: 0,
        },
      ],
      '2026-09-17',
    );
    expect(choice).toBeDefined();
    if (!choice) throw new Error('Synthetic execution is required');
    expect(choice.price.priceMicro).toBe(10_000_000_000_000);
    expect(() => valueAtPrice(1_000_000_000_000_000, choice, 1_000_000)).toThrow(RangeError);
  });

  it.each([
    ['units', () => marketValueCents(9_007_199_254_740_992, 1)],
    ['micro price', () => marketValueCents(1, 9_007_199_254_740_992)],
    ['micro FX', () => marketValueEurCents(1, 1, 9_007_199_254_740_992)],
    ['native cents', () => toEurCents(9_007_199_254_740_992, 1)],
    ['purchase cents', () => unitsFor(9_007_199_254_740_992, 100_000_000)],
  ] as const)(
    'rejects an already unsafe %s input instead of publishing a plausible amount',
    (_name, calculate) => {
      expect(calculate).toThrow(RangeError);
    },
  );
});

describe('#511 exact aggregate final boundary', () => {
  it('retains literal ±2 after intermediate magnitudes exceed the safe range', () => {
    expect(sumValuationCents([9007199254740991, 2, -9007199254740991])).toBe(2);
    expect(sumValuationCents([-9007199254740991, -2, 9007199254740991])).toBe(-2);
  });
  it.each([1, -1] as const)('retains the exact sign of an unsafe final result (%s)', (sign) => {
    let caught: unknown;
    try {
      sumValuationCents([sign * 9007199254740991, sign * 2]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValuationLimitError);
    if (!(caught instanceof ValuationLimitError)) throw new Error('Expected typed result limit');
    expect(caught.boundary).toBe('result');
    expect(caught.resultSign).toBe(sign);
    expect(caught.message).toBe('Valuation result exceeds safe integer range');
  });
  it('still rejects unsafe operands even if cancellation could hide them', () => {
    expect(() => sumValuationCents([9007199254740992, -9007199254740992])).toThrow(
      ValuationLimitError,
    );
    try {
      sumValuationCents([9007199254740992, -9007199254740992]);
      throw new Error('Expected an operand limit');
    } catch (error) {
      expect(error).toBeInstanceOf(ValuationLimitError);
      if (!(error instanceof ValuationLimitError)) throw error;
      expect(error.boundary).toBe('operand');
      expect(error).not.toHaveProperty('resultSign');
    }
  });
  it('retains seeded positive zero without changing the existing signed cash conversion', () => {
    expect(Object.is(sumValuationCents([]), 0)).toBe(true);
    expect(Object.is(sumValuationCents([-0, -0]), 0)).toBe(true);
    expect(Object.is(toEurCents(-1, 0), -0)).toBe(true);
    expect(Object.is(toEurCents(-1, 1), -0)).toBe(true);
  });
});
