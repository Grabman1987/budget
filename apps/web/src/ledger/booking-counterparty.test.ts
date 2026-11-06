import { expect, it } from 'vitest';
import { bookingCounterparty } from './booking-counterparty';

const booking = { payeeName: null, memo: null, amountCents: -1234 };

it('prefers the named payee over transfer and memo information', () => {
  expect(
    bookingCounterparty({ ...booking, payeeName: 'Musterladen', transferId: 't', memo: 'Text' }),
  ).toBe('Musterladen');
});

it('shows transfers in both directions and handles a missing counter account', () => {
  const transfer = { ...booking, transferId: 't', transferAccountName: 'Sparkonto', memo: 'Text' };
  expect(bookingCounterparty(transfer)).toBe('Umbuchung nach Sparkonto');
  expect(bookingCounterparty({ ...transfer, amountCents: 1234 })).toBe('Umbuchung von Sparkonto');
  expect(bookingCounterparty({ ...transfer, transferAccountName: null })).toBe('Umbuchung');
});

it('falls back to booking text and only then to the empty payee label', () => {
  expect(bookingCounterparty({ ...booking, memo: '  Musterzinsen  ' })).toBe('Musterzinsen');
  expect(bookingCounterparty({ ...booking, payeeName: ' ', memo: 'Mustertext' })).toBe(
    'Mustertext',
  );
  expect(bookingCounterparty(booking)).toBe('Ohne Empfänger');
  expect(bookingCounterparty({ ...booking, memo: '  ' })).toBe('Ohne Empfänger');
});
