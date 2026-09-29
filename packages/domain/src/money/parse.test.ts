import { describe, expect, it } from 'vitest';
import { hasOperator, parseAmount, type AmountError } from './parse';

const ok = (raw: string): number => {
  const r = parseAmount(raw);
  if (!r.ok) throw new Error(`"${raw}" failed with ${r.error}`);
  return r.cents;
};
const fail = (raw: string): AmountError => {
  const r = parseAmount(raw);
  if (r.ok) throw new Error(`"${raw}" unexpectedly parsed to ${r.cents}`);
  return r.error;
};

describe('parseAmount: single numbers (finance-hub money-input)', () => {
  it('parses Austrian input exactly in cents', () => {
    expect(ok('1.234,56 €')).toBe(123456);
    expect(ok('1234,56')).toBe(123456);
    expect(ok('1234.56')).toBe(123456);
    expect(ok('-0,01')).toBe(-1);
    expect(ok('+12,5')).toBe(1250);
    expect(ok('  12 € ')).toBe(1200);
  });

  it('treats a dot with exactly three digits as thousands separator', () => {
    expect(ok('1.576')).toBe(157600);
    expect(ok('1.576,40')).toBe(157640);
    expect(ok('12.345.678')).toBe(1234567800);
  });

  it('treats a dot with one or two digits as decimal separator', () => {
    expect(ok('12.5')).toBe(1250);
    expect(ok('12.50')).toBe(1250);
  });

  it('rejects ambiguous or over-precise money', () => {
    expect(fail('1,234')).toBe('precision');
    expect(fail('12.34,56')).toBe('syntax');
    expect(fail('1e4')).toBe('syntax');
    expect(fail('1.234.56')).toBe('syntax');
    expect(fail('1234.567')).toBe('precision');
  });

  it('rejects empty input', () => {
    expect(fail('')).toBe('empty');
    expect(fail('   ')).toBe('empty');
    expect(fail('+')).toBe('empty');
  });

  it('rejects values beyond the safe integer range', () => {
    expect(fail('99999999999999999')).toBe('too-large');
  });
});

describe('parseAmount: arithmetic (prototype amount field)', () => {
  it('adds and subtracts', () => {
    expect(ok('12,50+8,20')).toBe(2070);
    expect(ok('100-0,01')).toBe(9999);
    expect(ok('1.000 + 576')).toBe(157600);
  });

  it('accepts the typographic operators × ÷ − and x : as well as * /', () => {
    expect(ok('3×4,50')).toBe(1350);
    expect(ok('3*4,50')).toBe(1350);
    expect(ok('3x4,50')).toBe(1350);
    expect(ok('9÷2')).toBe(450);
    expect(ok('9/2')).toBe(450);
    expect(ok('9:2')).toBe(450);
    expect(ok('10−3')).toBe(700);
    expect(ok('10–3')).toBe(700);
  });

  it('applies multiplication and division before addition and subtraction', () => {
    expect(ok('2+3×4')).toBe(1400);
    expect(ok('10-6÷3')).toBe(800);
    expect(ok('2×3+4×5')).toBe(2600);
  });

  it('evaluates left to right within one precedence level', () => {
    expect(ok('100÷4×3')).toBe(7500);
    expect(ok('10-3-2')).toBe(500);
  });

  it('computes exactly and rounds half away from zero only at the end', () => {
    // 0,1 + 0,2 must be exactly 0,30 (no float drift)
    expect(ok('0,1+0,2')).toBe(30);
    expect(ok('10÷3')).toBe(333);
    expect(ok('20÷3')).toBe(667);
    expect(ok('-10÷3')).toBe(-333);
    expect(ok('-20÷3')).toBe(-667);
    // intermediate results are not rounded: 1 ÷ 3 × 3 = 1
    expect(ok('1÷3×3')).toBe(100);
    expect(ok('0,005×1')).toBe(1);
    expect(ok('-0,005×1')).toBe(-1);
  });

  it('allows more decimals on factors, e.g. VAT or unit prices', () => {
    expect(ok('100×1,075')).toBe(10750);
    expect(ok('12×0,125')).toBe(150);
  });

  it('supports a leading sign on the first term', () => {
    expect(ok('-12,50+2')).toBe(-1050);
    expect(ok('+5')).toBe(500);
  });

  it('ignores trailing operators while typing', () => {
    expect(ok('12,50+')).toBe(1250);
    expect(ok('12,50+8,20×')).toBe(2070);
  });

  it('rejects a leading multiplication or division and doubled operators', () => {
    expect(fail('×5')).toBe('syntax');
    expect(fail('5++3')).toBe('syntax');
    expect(fail('5×÷3')).toBe('syntax');
  });

  it('rejects division by zero', () => {
    expect(fail('5÷0')).toBe('divide-by-zero');
    expect(fail('5÷0,00')).toBe('divide-by-zero');
  });

  it('rejects anything that is not a number or an operator (no eval surface)', () => {
    expect(fail('12+abc')).toBe('syntax');
    expect(fail('alert(1)')).toBe('syntax');
    expect(fail('1;2')).toBe('syntax');
    expect(fail('(1+2)')).toBe('syntax');
    expect(fail('2**3')).toBe('syntax');
    expect(fail('0b1')).toBe('syntax');
    expect(fail('Infinity')).toBe('syntax');
    expect(fail('1_000')).toBe('syntax');
  });
});

describe('hasOperator', () => {
  it('detects an operator between two numbers', () => {
    expect(hasOperator('12,50+8,20')).toBe(true);
    expect(hasOperator('3×4')).toBe(true);
    expect(hasOperator('9 ÷ 3')).toBe(true);
    expect(hasOperator('12,50')).toBe(false);
    expect(hasOperator('-12,50')).toBe(false);
    expect(hasOperator('12+')).toBe(false);
    expect(hasOperator('')).toBe(false);
  });
});
