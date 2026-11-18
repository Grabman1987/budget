import { expect, it } from 'vitest';
import { parseCardDocument } from './statement-automation';
const text = [
  'Datum 19.01.2031',
  'Datum nächste Umsatznachricht 19.02.2031',
  'Wird eingezogen am 25.01.2031',
  'Saldo 9,23-',
  'Karte Umsatz Buchung Buchungstext Branche Betrag Kurs EUR Betrag',
  ' 1 19.12. 20.12. Synthetic overseas shop     10,00 USD 1,0834 9,23- 9,23-',
].join('\n');
it('resolves transaction before cycle start while matching the booked EUR column inside the cycle', () => {
  const doc = parseCardDocument(text, 'a'.repeat(64), {
    accountId: 'card',
    currency: 'EUR',
    mappingKey: 'read-only',
    mappedCardAccounts: {},
    period: { from: '2030-12-20', to: '2031-01-19' },
  });
  expect(
    doc.rows.map((r) => [r.transactionDate, r.bookingDate, r.amountCents, r.currency]),
  ).toEqual([['2030-12-19', '2030-12-20', -923, 'EUR']]);
  expect(doc.reasons).not.toContain('row_year_unavailable');
});
it('keeps a non-unique year unresolved for a cycle exceeding one year', () => {
  const doc = parseCardDocument(text, 'a'.repeat(64), {
    accountId: 'card',
    currency: 'EUR',
    mappingKey: 'read-only',
    mappedCardAccounts: {},
    period: { from: '2029-12-20', to: '2031-01-19' },
  });
  expect(doc.rows[0]?.bookingDate).toBeNull();
  expect(doc.reasons).toContain('row_year_unavailable');
});
