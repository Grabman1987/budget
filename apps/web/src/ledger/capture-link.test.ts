import { expect, it } from 'vitest';
import { captureContinuation, capturePrefill, validateCaptureSearch } from './capture-link';

it('prefills cents and explicit income without creating a booking', () => {
  expect(
    capturePrefill(
      validateCaptureSearch({
        betrag: '+12,50',
        empfaenger: 'Beispielmarkt',
        konto: 'cash',
        kategorie: 'food',
      }),
      ['cash'],
      ['food'],
    ),
  ).toEqual({
    amount: '12,50',
    kind: 'income',
    payee: 'Beispielmarkt',
    accountId: 'cash',
    categoryId: 'food',
  });
});
it('rejects expressions, excess precision, non-finite numbers and stale ids', () => {
  for (const betrag of ['12+3', '0,001', '1e3', Infinity, '999999999999999999'])
    expect(validateCaptureSearch({ betrag }).betrag).toBeUndefined();
  expect(
    capturePrefill(
      validateCaptureSearch({ konto: 'old', kategorie: 'old', empfaenger: 'Test\nname' }),
      ['cash'],
      ['food'],
    ),
  ).toEqual({});
});
it('only continues to a bounded, validated capture URL after login', () => {
  expect(captureContinuation('https://example.invalid/erfassen')).toBeUndefined();
  expect(captureContinuation('//example.invalid/erfassen')).toBeUndefined();
  expect(captureContinuation('/erfassen?betrag=-12%2C50&konto=cash&extra=ignored')).toBe(
    '/erfassen?betrag=-12%2C50&konto=cash',
  );
});
