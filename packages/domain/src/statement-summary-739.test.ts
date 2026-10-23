import { expect, it } from 'vitest';
import { parseStatementText, reviewStatement } from './statement-intake';
import { statementPayableState } from './statement-settlement';

const sha = 'b'.repeat(64);
const summary = `Datum                            04.06.2031
Datum nächste Umsatznachricht    04.07.2031
Wird eingezogen am               12.06.2031
Saldo                           120,00-
Karte Umsatz Buchung Buchungstext Betrag Kurs EUR Betrag
01.06.2031 Einkauf A             70,00-
02.06.2031 Einkauf B             50,00-`;

it('proposes only explicit issued-summary facts, with no fabricated reference or period', () => {
  const p = parseStatementText(summary, sha);
  expect(p.extraction).toBe('parsed');
  expect(p.fields.issueDate.value).toBe('2031-06-04');
  expect(p.fields.debitDate.value).toBe('2031-06-12');
  expect(p.fields.payableCents.value).toBe(12000);
  expect(p.fields.currency.value).toBe('EUR');
  expect(p.fields.reference.value).toBeNull();
  expect(p.fields.periodFrom.value).toBeNull();
  expect(p.fields.periodTo.value).toBeNull();
  expect(p.fields.issueDate.evidence).toEqual({ page: null, line: 1, label: 'issue_date' });
  expect(p.fields.payableCents.evidence).toEqual({ page: null, line: 4, label: 'payable' });
  expect(p.fields.currency.evidence).toEqual({ page: null, line: 5, label: 'currency' });
  expect(p.fields.payableCents.origin).toBe('printed');
  expect(p.sha256).toBe(sha);
  expect(
    parseStatementText(summary.replace('nächste', 'n ä chste'), sha).fields.issueDate.value,
  ).toBe('2031-06-04');
});

it('maps explicit summary debt, credit and zero signs without taking an absolute value', () => {
  for (const [printed, expected, state] of [
    ['120,00-', 12000, 'open'],
    ['120,00−', 12000, 'open'],
    ['12,34+', -1234, 'credit_manual'],
    ['0,00-', 0, 'zero'],
    ['0,00+', 0, 'zero'],
  ] as const) {
    const p = parseStatementText(summary.replace('120,00-', printed), sha);
    expect(p.fields.payableCents.value).toBe(expected);
    expect(statementPayableState(p.fields.payableCents.value)).toBe(state);
  }
  expect(parseStatementText('Abrechnungsbetrag: -12,34 EUR', sha).fields.payableCents.value).toBe(
    -1234,
  );
});

it('never derives the issued amount from purchases, payments, refunds or foreign originals', () => {
  const p = parseStatementText(
    summary +
      '\n03.06.2031 Fremdwährungsumsatz USD 600,00- EUR Endbetrag 550,00-' +
      '\n03.06.2031 Zahlung 400,00+\n03.06.2031 Erstattung 25,00+\nAktueller Saldo 999,00-',
    sha,
  );
  expect(p.fields.payableCents).toMatchObject({ value: 12000, candidates: [12000] });
  expect(p.fields.currency).toMatchObject({ value: 'EUR', candidates: ['EUR'] });
  for (const text of [
    'Datum 04.06.2031\nSaldo 120,00-\nEUR Betrag',
    summary.replace('Datum nächste Umsatznachricht', 'Datum der Buchung'),
    summary.replace('Saldo                           120,00-', 'Aktueller Saldo 120,00-'),
  ]) {
    expect(parseStatementText(text, sha).fields.payableCents.value).toBeNull();
  }
});

it('keeps invalid or conflicting dates unknown and never uses the next-notice date as fallback', () => {
  for (const debit of ['', '31.02.2031', '12.06.2031 / 13.06.2031']) {
    const p = parseStatementText(summary.replace('12.06.2031', debit), sha);
    expect(p.fields.issueDate.value).toBe('2031-06-04');
    expect(p.fields.debitDate.value).toBeNull();
    expect(p.warnings).toContain('debit_date_required');
  }
  const p = parseStatementText(summary.replace('04.06.2031', '31.02.2031'), sha);
  expect(p.fields.issueDate.value).toBeNull();
  expect(p.fields.periodFrom.value).toBeNull();
  expect(p.fields.periodTo.value).toBeNull();
  const conflict = parseStatementText(
    summary + '\n' + summary.replace('04.06.2031', '05.06.2031'),
    sha,
  );
  expect(conflict.fields.issueDate.value).toBeNull();
  expect(conflict.warnings).toContain('ambiguous_issueDate');
});

it('requires explicit final-column currency and rejects ambiguous totals or malformed money', () => {
  for (const amount of ['12.34,56-', '123 45,67-', '--12,34-', '12,34', '9999999999999999,00-']) {
    expect(
      parseStatementText(summary.replace('120,00-', amount), sha).fields.payableCents.value,
    ).toBeNull();
  }
  for (const currencyHeader of ['Endbetrag', 'XXX Betrag', 'EUR Betrag USD Betrag']) {
    const p = parseStatementText(summary.replace('EUR Betrag', currencyHeader), sha);
    expect(p.fields.currency.value).toBeNull();
    expect(p.extraction).toBe('manual_required');
  }
  for (const merchantRow of [
    '03.06.2031 Umsatz EUR Betrag 999,00-',
    '03.06.2031 Umsatz Buchung EUR Betrag 999,00-',
    'Umsatz EUR Betrag',
    'Hinweis Umsatz Buchung EUR Betrag',
    'Hinweis Karte Umsatz Buchung Buchungstext Betrag Kurs EUR Betrag',
  ]) {
    const merchant = parseStatementText(
      summary.replace('EUR Betrag', 'Endbetrag') + '\n' + merchantRow,
      sha,
    );
    expect(merchant.fields.currency.value).toBeNull();
    expect(merchant.extraction).toBe('manual_required');
  }
  const misordered = parseStatementText(
    summary.replace('Karte Umsatz Buchung', 'Karte Buchung Umsatz'),
    sha,
  );
  expect(misordered.fields.currency.value).toBeNull();
  const conflictingHeader = parseStatementText(
    summary + '\nKarte Umsatz Buchung Buchungstext Betrag Kurs USD Betrag',
    sha,
  );
  expect(conflictingHeader.fields.currency.value).toBeNull();
  expect(conflictingHeader.warnings).toContain('ambiguous_currency');
  const p = parseStatementText(summary + '\n' + summary.replace('120,00-', '140,00-'), sha);
  expect(p.fields.payableCents.value).toBeNull();
  expect(p.warnings).toContain('ambiguous_payableCents');
});

it('retains printed proposals separately from manual corrections and requires a real identity', () => {
  const proposal = parseStatementText(summary, sha),
    before = JSON.stringify(proposal);
  const facts = Object.fromEntries(
    Object.entries(proposal.fields).map(([key, field]) => [key, field.value]),
  );
  expect(() => reviewStatement(proposal, facts, true)).toThrow();
  const review = reviewStatement(
    proposal,
    { ...facts, reference: 'SYNTHETIC-739', debitDate: '2031-06-13' },
    true,
  );
  expect(review.fields.reference.origin).toBe('owner');
  expect(review.fields.debitDate).toMatchObject({ value: '2031-06-13', origin: 'owner' });
  expect(review.fields.payableCents).toMatchObject({ value: 12000, origin: 'printed' });
  expect(JSON.stringify(proposal)).toBe(before);
});
