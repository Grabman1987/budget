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
    currency: 'EUR',
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
  expect(extractReceiptProposal(text)).toEqual({
    totalCents: null,
    currency: 'EUR',
    date: null,
    payee: null,
  });
});

it('never takes amounts, dates, contact lines or labels as the payee', () => {
  const text = '12,50\n07.10.2026\nwww.muster.example\nRechnung\nMuster Werkstatt\nGesamt 12,50';
  expect(extractReceiptProposal(text).payee).toBe('Muster Werkstatt');
});

it('returns nothing for empty text', () => {
  expect(extractReceiptProposal('')).toEqual({
    totalCents: null,
    currency: 'EUR',
    date: null,
    payee: null,
  });
});

it('prefers the gross total over a net "Summe", even when it mentions MwSt', () => {
  const text = 'Muster GmbH\nSumme 10,33\nMwSt 20 % 2,07\nGesamtbetrag inkl. MwSt 12,40';
  expect(extractReceiptProposal(text).totalCents).toBe(1240);
});

it('does not decide between a plain "Summe" and a visible tax line', () => {
  expect(extractReceiptProposal('Summe 10,33\nMwSt 20 % 2,07').totalCents).toBeNull();
  expect(extractReceiptProposal('Summe 10,33').totalCents).toBe(1033);
});

it('does not read "August" as tax or "zahlbar" as cash', () => {
  expect(extractReceiptProposal('Rechnung August\nGesamt 12,40').totalCents).toBe(1240);
  expect(extractReceiptProposal('zahlbar bis 30.10.2026\nGesamt 12,40').totalCents).toBe(1240);
});

it('keeps the sign of a credit note', () => {
  expect(extractReceiptProposal('Gutschrift\nGesamtbetrag -12,40 EUR').totalCents).toBe(-1240);
  expect(extractReceiptProposal('Gesamt 12,40-').totalCents).toBe(-1240);
  expect(extractReceiptProposal('Gesamt \u221212,40').totalCents).toBe(-1240);
});

it('reads ISO dates, rejects two-digit years and ignores "Update" as a label', () => {
  expect(extractReceiptProposal('Datum 2026-10-07').date).toBe('2026-10-07');
  expect(extractReceiptProposal('07.10.26').date).toBeNull();
  expect(extractReceiptProposal('Update 01.01.2026\nDatum 07.10.2026').date).toBe('2026-10-07');
});

it('reports a printed foreign currency', () => {
  expect(extractReceiptProposal('Total USD 12,40').currency).toBe('USD');
});

it('skips very long lines instead of running regexes over them', () => {
  const long = 'Gesamt ' + '1'.repeat(50000) + ',00';
  const started = Date.now();
  expect(extractReceiptProposal(long + '\nGesamt 12,40').totalCents).toBe(1240);
  expect(Date.now() - started).toBeLessThan(500);
});
