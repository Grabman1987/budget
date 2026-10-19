import { expect, it } from 'vitest';
import { contactBalanceLine, contactBalanceWords, receivableDelta } from './contact-balance';

it('says a positive balance as "Schuldet dir" in the plus role', () => {
  expect(contactBalanceWords(4500)).toEqual({
    tone: 'plus',
    words: 'Schuldet dir',
    amount: '45,00 €',
  });
  expect(contactBalanceLine(4500)).toBe('Schuldet dir 45,00 €');
});

it('says a negative balance as "Du schuldest" in the minus role without a minus sign', () => {
  expect(contactBalanceWords(-1200)).toEqual({
    tone: 'minus',
    words: 'Du schuldest',
    amount: '12,00 €',
  });
  expect(contactBalanceLine(-1200)).toBe('Du schuldest 12,00 €');
  expect(contactBalanceLine(-1200)).not.toContain('−');
});

it('says a zero balance as settled', () => {
  expect(contactBalanceWords(0)).toEqual({ tone: 'zero', words: 'Ausgeglichen', amount: '0,00 €' });
  expect(contactBalanceLine(0)).toBe('Ausgeglichen');
});

it('keeps cents exact at the edges', () => {
  expect(contactBalanceLine(1)).toBe('Schuldet dir 0,01 €');
  expect(contactBalanceLine(-123456)).toBe('Du schuldest 1.234,56 €');
});

it('shows history in the receivable view: Auslage plus, Rückzahlung minus', () => {
  expect(receivableDelta(-3000)).toBe(3000);
  expect(receivableDelta(1000)).toBe(-1000);
});
