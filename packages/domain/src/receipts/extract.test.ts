import { expect, it } from 'vitest';
import { extractReceiptProposal } from './extract';

// Every name, date and amount below is invented.
const slip = [
  'Muster Markt GmbH',
  'Teststraße 1',
  'Datum: 07.10.2026',
  'Artikel A 3,20',
  'Zwischensumme 12,40',
  'MwSt 20 % 2,07',
  'Gesamt 12,40 EUR',
  'Danke',
].join('\n');

it('reads total, date and payee from a till slip', () => {
  expect(extractReceiptProposal(slip)).toEqual({
    totalCents: 1240,
    date: '2026-10-07',
    payee: 'Muster Markt GmbH',
  });
});

it('prefers the strongest total label and handles thousands separators', () => {
  const text = [
    'Beispiel AG',
    'Rechnungsdatum 01.09.2026',
    'Summe 1.100,00',
    'Zu zahlen 1.234,56 EUR',
  ].join('\n');
  expect(extractReceiptProposal(text)).toMatchObject({ totalCents: 123456, date: '2026-09-01' });
});

it('leaves conflicting totals empty instead of guessing', () => {
  expect(extractReceiptProposal('Gesamt 10,00\nGesamt 12,00').totalCents).toBeNull();
});

it('ignores subtotals, tax lines and impossible dates', () => {
  const text = 'Zwischensumme 5,00\nMwSt 1,00\n31.02.2026';
  expect(extractReceiptProposal(text)).toEqual({ totalCents: null, date: null, payee: null });
});

it('never takes amounts, dates, contact lines or labels as the payee', () => {
  const text = '12,50\n07.10.2026\nwww.muster.example\nRechnung\nMuster Werkstatt\nGesamt 12,50';
  expect(extractReceiptProposal(text).payee).toBe('Muster Werkstatt');
});

it('returns nothing for empty text', () => {
  expect(extractReceiptProposal('')).toEqual({ totalCents: null, date: null, payee: null });
});
