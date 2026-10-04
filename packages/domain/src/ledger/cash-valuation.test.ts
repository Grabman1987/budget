import { describe, expect, it } from 'vitest';
import { cashValuation, convertCashCents } from './cash-valuation';

describe('cash display valuation', () => {
  const rate = { date: '2026-10-01', rateMicro: 500_000, source: 'ecb' };
  it('retains stored rate provenance and rounds signed cent boundaries', () => {
    expect(cashValuation(-101, 'USD', '2026-10-02', rate)).toEqual({
      currency: 'USD',
      asOf: '2026-10-02',
      eurCents: -51,
      rateMicro: 500_000,
      rateDate: '2026-10-01',
      rateSource: 'ecb',
    });
    expect(cashValuation(101, 'USD', '2026-10-02', rate).eurCents).toBe(51);
  });
  it('never uses a future or missing rate, including zero native cash', () => {
    expect(cashValuation(10_000, 'USD', '2026-09-30', rate).eurCents).toBeNull();
    expect(cashValuation(0, 'USD', '2026-10-02').eurCents).toBeNull();
    expect(cashValuation(123, 'EUR', '2026-10-02').eurCents).toBe(123);
  });
});

it('converts cash between native currencies with one exact rounding', () => {
  expect(convertCashCents(-1001, 900000, 1000000)).toBe(-901);
  expect(convertCashCents(1001, 900000, 1200000)).toBe(751);
  expect(convertCashCents(-1, 500000, 1000000)).toBe(-1);
  expect(convertCashCents(0, 500000, 1000000)).toBe(0);
  expect(() => convertCashCents(1.5, 900000, 1000000)).toThrow();
  expect(() => convertCashCents(1, 0, 1000000)).toThrow();
});
