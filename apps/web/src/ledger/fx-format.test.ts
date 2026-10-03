import { afterEach, describe, expect, it } from 'vitest';
import { cashValuation } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { valuedCurrency, valuedCurrencyParts, valuedMovement } from './format';

afterEach(() => setAmountsHidden(false));

describe('native and EUR formatter', () => {
  it('shows booking-day EUR movement totals without inventing a single aggregate rate', () => {
    expect(valuedMovement(90, 'USD', 92).replaceAll('\u00a0', ' ')).toBe('+USD 0,90 · +0,92 €');
    expect(valuedMovement(90, 'USD', null)).toContain('EUR: Kurs fehlt');
    expect(valuedMovement(90, 'EUR', 90)).toBe('+0,90 €');
  });
  it('shows signed native amount, EUR amount, rate direction and stored date', () => {
    const valuation = cashValuation(-101, 'USD', '2026-10-02', {
      date: '2026-10-01',
      rateMicro: 500_000,
      source: 'ecb',
    });
    expect(valuedCurrency(-101, 'USD', valuation, true).replaceAll('\u00a0', ' ')).toBe(
      '−USD 1,01 · −0,51 € · EZB: 1 USD = 0,5 EUR · 01.10.2026',
    );
    expect(valuedCurrency(123_456, 'EUR')).toBe('1.234,56 €');
  });
  it('states missing EUR valuation without changing the native unit', () => {
    expect(valuedCurrency(0, 'CHF').replaceAll('\u00a0', ' ')).toBe('CHF 0,00 · EUR: Kurs fehlt');
    expect(valuedCurrency(100, 'USD', cashValuation(100, 'USD', '2026-10-02'))).toContain(
      'EUR: Kurs fehlt',
    );
  });
  it('keeps the compact figure and rate metadata consistent and hides both money values', () => {
    const valuation = cashValuation(201, 'USD', '2026-10-02', {
      date: '2026-10-01',
      rateMicro: 750_000,
      source: 'ecb',
    });
    const parts = valuedCurrencyParts(201, 'USD', valuation, true);
    expect(parts.amount.replaceAll('\u00a0', ' ')).toBe('+USD 2,01 · +1,51 €');
    expect(parts.rate).toBe('EZB: 1 USD = 0,75 EUR · 01.10.2026');
    expect(valuedCurrency(201, 'USD', valuation, true)).toBe(`${parts.amount} · ${parts.rate}`);
    setAmountsHidden(true);
    expect(valuedCurrencyParts(201, 'USD', valuation).amount).toBe('••• USD · ••• €');
  });
});
