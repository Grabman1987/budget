import { describe, expect, it } from 'vitest';
import { quoteText, unitsText } from './portfolio-format';

describe('exact portfolio edge formatting', () => {
  it('keeps one micro and all safe-integer quote digits with the currency after the amount', () => {
    const quote = { date: '2026-09-17', currency: 'EUR', source: 'manual' };
    expect(quoteText({ ...quote, priceMicro: 1 })).toBe('0,000001 €');
    expect(quoteText({ ...quote, priceMicro: 9_007_199_254_740_991 })).toBe(
      '9.007.199.254,740991 €',
    );
    expect(quoteText({ ...quote, currency: 'CHF', priceMicro: 60_250_001 })).toBe('60,250001 CHF');
    expect(quoteText({ ...quote, priceMicro: 50_000_000 })).toBe('50,00 €');
    expect(unitsText(9_007_199_254_740_991)).toBe('90.071.992,54740991');
    expect(unitsText(-1)).toBe('−0,00000001');
  });
});
