import { describe, expect, it } from 'vitest';
import { invertRateMicro, parseMicro, parseScaledDecimal } from './scaled';

describe('parseScaledDecimal / parseMicro', () => {
  it('reads decimals exactly, without floats', () => {
    expect(parseMicro('85.12')).toBe(85_120_000);
    expect(parseMicro('0.000001')).toBe(1);
    expect(parseMicro('1234')).toBe(1_234_000_000);
    expect(parseMicro('  27000.5 ')).toBe(27_000_500_000);
    // A value that a float cannot hold exactly.
    expect(parseMicro('9007199.254740993')).toBe(9_007_199_254_741);
    expect(parseScaledDecimal('0.1', 2)).toBe(10);
  });

  it('rounds half away from zero once when there are more decimals than the scale', () => {
    expect(parseMicro('85.1200004')).toBe(85_120_000);
    expect(parseMicro('85.1200005')).toBe(85_120_001);
    expect(parseMicro('-85.1200005')).toBe(-85_120_001);
    expect(parseMicro('85.12000274658203')).toBe(85_120_003);
  });

  it('understands exponents and signs', () => {
    expect(parseMicro('1e-05')).toBe(10);
    expect(parseMicro('1.5E3')).toBe(1_500_000_000);
    expect(parseMicro('+2')).toBe(2_000_000);
    expect(parseMicro('-0')).toBe(0);
  });

  it('refuses text that is not a plain decimal and numbers beyond safe integers', () => {
    for (const bad of ['', 'abc', '1,5', '1.', '.5', 'NaN', '1e', '--1', '1 2'])
      expect(() => parseMicro(bad), bad).toThrow(RangeError);
    expect(() => parseMicro('9007199254.740993')).toThrow(RangeError);
    expect(() => parseMicro('1e99')).toThrow(RangeError);
  });
});

describe('invertRateMicro (ECB units per EUR to EUR per unit)', () => {
  it('inverts on integers and rounds half up once', () => {
    // 1 / 1,0852 = 0,9214891...
    expect(invertRateMicro(1_085_200)).toBe(921_489);
    // 1 / 1,25 = 0,8 exactly
    expect(invertRateMicro(1_250_000)).toBe(800_000);
    // 1 / 3 = 0,333333 (rounds down), 1 / 1,5 = 0,666667 (rounds up)
    expect(invertRateMicro(3_000_000)).toBe(333_333);
    expect(invertRateMicro(1_500_000)).toBe(666_667);
    expect(invertRateMicro(1_000_000)).toBe(1_000_000);
  });

  it('refuses quotations that cannot be stored', () => {
    expect(() => invertRateMicro(0)).toThrow(RangeError);
    expect(() => invertRateMicro(-1)).toThrow(RangeError);
    expect(() => invertRateMicro(1.5)).toThrow(RangeError);
    expect(() => invertRateMicro(10 ** 12 * 3)).toThrow(RangeError);
  });
});
