// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { cents, formatEuro } from '@budget/domain';
import { AmountInput } from './components/amount-input';
import { DimensionChain } from './components/dimension-chain';
import { Graticule } from './charts/frame';
import {
  AMOUNT_PRIVACY_KEY,
  formatPrivateEuro,
  initAmountPrivacy,
  maskMoneyText,
  setAmountsHidden,
} from './amount-privacy';

afterEach(() => {
  cleanup();
  setAmountsHidden(false);
  localStorage.clear();
});
it('masks visible money, axes and inputs without changing data or losing the draft', () => {
  const value = cents(-12345);
  render(
    <>
      <DimensionChain terms={[{ label: 'Rest', value }]} label="Aufteilung" precision="cent" />
      <svg>
        <Graticule x1={10} x2={100} lines={[{ y: 20, label: '1.000' }]} />
      </svg>
      <AmountInput label="Betrag" value="12,50" error="Höchstens 123,45 €" onChange={() => {}} />
    </>,
  );
  expect(screen.getByText('−123,45 €')).toBeTruthy();
  act(() => setAmountsHidden(true));
  expect(screen.queryByText('−123,45 €')).toBeNull();
  expect(screen.queryByText('1.000')).toBeNull();
  expect(screen.queryByText('Höchstens 123,45 €')).toBeNull();
  expect(screen.getByLabelText('Betrag').getAttribute('type')).toBe('password');
  expect((screen.getByLabelText('Betrag') as HTMLInputElement).value).toBe('12,50');
  expect(formatEuro(value)).toBe('−123,45 €');
  expect(formatPrivateEuro(value)).toBe('••• €');
  expect(maskMoneyText('Saldo −123,45 €; Rate 45,00 USD; 3 Buchungen')).toBe(
    'Saldo ••• €; Rate ••• USD; 3 Buchungen',
  );
  act(() => setAmountsHidden(false));
  expect(screen.getByText('−123,45 €')).toBeTruthy();
});
it('restores the preference per device', () => {
  localStorage.setItem(AMOUNT_PRIVACY_KEY, '1');
  initAmountPrivacy();
  expect(formatPrivateEuro(cents(1))).toBe('••• €');
});
it('masks native amounts for every three-letter currency code accepted by accounts', () => {
  setAmountsHidden(true);
  expect(maskMoneyText('Probe · −1.234,56 NOK · 0,01 CZK · +12,34 EUR')).toBe(
    'Probe · ••• NOK · ••• CZK · ••• EUR',
  );
  expect(maskMoneyText('17.09.2026 · Muster · 25 %')).toBe('17.09.2026 · Muster · 25 %');
});
