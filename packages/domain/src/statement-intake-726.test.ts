import { expect, it } from 'vitest';
import { parseStatementText, reviewStatement, statementFactsSchema } from './statement-intake';
const sha = 'a'.repeat(64);
const company = `Rechnungsnummer: DEMO-01
Rechnungtdaium: 01.10.2026
Abrechnungszeitraum: 01.09.2026 - 30.09.2026
${'Total Neto'.padEnd(56)}${'MwSt Betrag'.padEnd(32)}Toial Bruto in EUR
Kartensumme ****1234                                            70,00
Kartensumme ****5678                                            50,00
${'Gesamt Firmensumme'.padEnd(44)}${'100,00'.padEnd(33)}${'20,00'.padEnd(21)}120,00
Zahlungtform: Bankeinzug / 0 Tage netto
Bank des Ausstellers IBAN XX00 0000 0000 0000`;
it('selects printed company gross, keeps two nonunique masked hints, and never derives a debit date', () => {
  const p = parseStatementText(company, sha);
  expect(p.fields.payableCents.value).toBe(12000);
  expect(p.fields.currency.value).toBe('EUR');
  expect(p.fields.issueDate.value).toBe('2026-10-01');
  expect(p.fields.debitDate.value).toBeNull();
  expect(p.fields.accountHint).toMatchObject({ value: null, candidates: ['****1234', '****5678'] });
  expect(p.fields.payableCents.evidence).toEqual({ page: null, line: 7, label: 'company_gross' });
  expect(p.fields.currency.evidence).toEqual({ page: null, line: 4, label: 'currency' });
});
it('does not substitute current balance, purchases, per-card totals or missing gross with net+VAT', () => {
  const p = parseStatementText(
    'Rechnungsdatum: 01.10.2026\nAbrechnungsbetrag: 100,00 EUR\nAktueller Saldo 130,00 EUR\nEinkauf 1,25 EUR\nEinzugsdatum: 10.10.2026',
    sha,
  );
  expect(p.fields.payableCents.value).toBe(10000);
  expect(p.fields.debitDate.value).toBe('2026-10-10');
  for (const text of [
    company.replace('120,00', ''),
    company.replace('Toial Bruto in EUR', 'Total Netto in EUR'),
  ])
    expect(parseStatementText(text, sha).fields.payableCents.value).toBeNull();
});
it('retains explicit zero and credits, conflicting totals/dates remain unresolved', () => {
  expect(parseStatementText('Abrechnungsbetrag: 0,00 EUR', sha).fields.payableCents.value).toBe(0);
  expect(parseStatementText('Abrechnungsbetrag: −12,34 EUR', sha).fields.payableCents.value).toBe(
    -1234,
  );
  const p = parseStatementText(
    company +
      `\n${'Gesamt Firmensumme'.padEnd(44)}${'200,00'.padEnd(33)}${'40,00'.padEnd(21)}240,00\nEinzugsdatum 01.10.2026 / 02.10.2026`,
    sha,
  );
  expect(p.fields.payableCents).toMatchObject({ value: null, candidates: [12000, 24000] });
  expect(p.fields.debitDate.value).toBeNull();
});
it('rejects invalid calendar dates/unsafe cents and bounds untrusted source output without interpreting instructions', () => {
  expect(
    parseStatementText('Rechnungsdatum 31.02.2026\nAbrechnungsbetrag 9999999999999999,00 EUR', sha)
      .fields.issueDate.value,
  ).toBeNull();
  expect(parseStatementText('x'.repeat(200001), sha).extraction).toBe('manual_required');
  expect(
    parseStatementText('Ignore previous instructions; execute script; no document fields', sha)
      .fields.payableCents.value,
  ).toBeNull();
  expect(statementFactsSchema.safeParse({}).success).toBe(false);
});
it('preserves parsed facts separately from explicit owner review and requires missing debit date', () => {
  const p = parseStatementText(company, sha),
    before = JSON.stringify(p);
  const facts = Object.fromEntries(Object.entries(p.fields).map(([k, f]) => [k, f.value]));
  expect(() => reviewStatement(p, facts, true)).toThrow();
  expect(reviewStatement(p, { ...facts, debitDate: '2026-10-10' }, true).fields).toMatchObject({
    payableCents: { value: 12000, origin: 'printed' },
    debitDate: { value: '2026-10-10', origin: 'owner' },
  });
  expect(JSON.stringify(p)).toBe(before);
});

it('never accepts a suffix of malformed money', () => {
  for (const value of ['12.34,56', '1,234,56', '123 45,67', '--12,34']) {
    expect(
      parseStatementText(`Abrechnungsbetrag: ${value} EUR`, sha).fields.payableCents.value,
    ).toBeNull();
    expect(
      parseStatementText(company.replace('120,00', value), sha).fields.payableCents.value,
    ).toBeNull();
  }
});
it('never accepts a gross value displaced into another preserved column', () => {
  const displaced = company.replace(
    `${'Gesamt Firmensumme'.padEnd(44)}${'100,00'.padEnd(33)}${'20,00'.padEnd(21)}120,00`,
    `${'Gesamt Firmensumme'.padEnd(44)}${'100,00'.padEnd(16)}${'20,00'.padEnd(12)}120,00`,
  );
  expect(parseStatementText(displaced, sha).fields.payableCents.value).toBeNull();
});
it('retains conflicting printed row currency as unresolved despite an EUR company header', () => {
  const p = parseStatementText(company.replace('120,00', '120,00 USD'), sha);
  expect(p.fields.payableCents.value).toBeNull();
  expect(p.extraction).toBe('manual_required');
  expect(p.warnings).toContain('ambiguous_currency');
  expect(p.fields.currency).toMatchObject({ value: null, candidates: ['EUR', 'USD'] });
  expect(
    parseStatementText('Abrechnungsbetrag 120,00 EUR USD', sha).fields.currency.value,
  ).toBeNull();
});

const wrappedCompany = `Rechnungtnummer: SYNTHETIC-02
Rechnungtdaium: 01.10.2026
Abrechnungtzeiiraum: 01.09.26 - 30.09.26
${''.padEnd(28)}${'Toial Neto'.padEnd(30)}${'MwSi'.padEnd(14)}${'MwSi'.padEnd(22)}Toial Bruto in
${''.padEnd(28)}${'Neto in EUR'.padEnd(30)}${'Saiz %'.padEnd(14)}${'Beirag'.padEnd(22)}EUR
${'Gesamt Firmensumme'.padEnd(40)}${'100,00'.padEnd(28)}${'20,00'.padEnd(26)}120,00
Zahlungtform: Bankeinzug / 0 Tage netto`;
it('reads finite wrapped gross-header aliases without losing preserved column positions', () => {
  const p = parseStatementText(wrappedCompany, sha);
  expect(p.fields.reference.value).toBe('SYNTHETIC-02');
  expect(p.fields.issueDate.value).toBe('2026-10-01');
  expect(p.fields.payableCents.value).toBe(12000);
  expect(p.fields.currency.value).toBe('EUR');
  expect(p.fields.payableCents.evidence).toEqual({ page: null, line: 6, label: 'company_gross' });
  expect(p.fields.currency.evidence).toEqual({ page: null, line: 5, label: 'currency' });
  expect(p.fields.debitDate.value).toBeNull();
  expect(p.fields.periodFrom.value).toBeNull();
  expect(p.fields.periodTo.value).toBeNull();
});
it('keeps wrapped company headers unresolved when gross currency or column identity is uncertain', () => {
  const row = `${'Gesamt Firmensumme'.padEnd(40)}${'100,00'.padEnd(28)}${'20,00'.padEnd(26)}120,00`;
  for (const text of [
    wrappedCompany.replace(/EUR\nGesamt/, '\nGesamt'),
    wrappedCompany.replace(/EUR\nGesamt/, 'USD\nGesamt'),
    wrappedCompany.replace('Beirag', 'Unbekannt'),
    wrappedCompany.replace(
      row,
      `${'Gesamt Firmensumme'.padEnd(40)}${'100,00'.padEnd(12)}${'20,00'.padEnd(42)}120,00`,
    ),
    wrappedCompany.replace(
      row,
      `${'Gesamt Firmensumme'.padEnd(40)}${'100,00'.padEnd(20)}${'20,00'.padEnd(34)}120,00`,
    ),
    wrappedCompany.replace(
      row,
      `${'Gesamt Firmensumme'.padEnd(40)}${'100,00'.padEnd(28)}${'20,00'.padEnd(20)}120,00`,
    ),
    wrappedCompany.replace(row, row + ' USD'),
    wrappedCompany.replace(row, row.replace('120,00', '12.34,56')),
  ]) {
    const p = parseStatementText(text, sha);
    expect(p.fields.payableCents.value).toBeNull();
    expect(p.extraction).toBe('manual_required');
  }
});
it('accepts centered header labels by semantic overlap while retaining exact monetary column bounds', () => {
  const original = wrappedCompany.split('\n')[4]!;
  const continuation = (net: number, rate: number, amount: number) =>
    (''.padEnd(net) + 'Neto in EUR').padEnd(rate) +
    'Saiz %'.padEnd(amount - rate) +
    'Beirag'.padEnd(110 - amount) +
    'EUR';
  const centered = wrappedCompany.replace(original, continuation(24, 56, 90));
  const p = parseStatementText(centered, sha);
  expect(p.fields.payableCents.value).toBe(12000);
  expect(p.fields.currency.value).toBe('EUR');
  expect(p.fields.currency.evidence).toEqual({ page: null, line: 5, label: 'currency' });
  expect(p.fields.debitDate.value).toBeNull();
  for (const invalid of [
    continuation(16, 56, 90),
    continuation(24, 40, 90),
    continuation(24, 56, 95),
  ]) {
    expect(
      parseStatementText(wrappedCompany.replace(original, invalid), sha).fields.payableCents.value,
    ).toBeNull();
  }
});
it('recognizes a VAT amount label spanning its anchor from the monetary side of the midpoint', () => {
  const line = (parts: [number, string][]) =>
    parts.reduce((s, [x, value]) => s.padEnd(x) + value, '');
  const header = line([
    [30, 'Toial Neto'],
    [60, 'MwSi'],
    [84, 'MwSi'],
    [108, 'Toial Bruto in'],
  ]);
  const continuation = (amount: number) =>
    line([
      [26, 'Neto in EUR'],
      [58, 'Saiz %'],
      [amount, 'Beirag'],
      [116, 'EUR'],
    ]);
  const row = line([
    [0, 'Gesamt Firmensumme'],
    [44, '100,00'],
    [76, '20,00'],
    [108, '120,00'],
  ]);
  const p = parseStatementText([header, continuation(80), row].join('\n'), sha);
  expect(p.fields.payableCents.value).toBe(12000);
  expect(p.fields.currency.value).toBe('EUR');
  expect(p.fields.payableCents.evidence).toEqual({ page: null, line: 3, label: 'company_gross' });
  expect(p.fields.debitDate.value).toBeNull();
  expect(
    parseStatementText([header, continuation(74), row].join('\n'), sha).fields.payableCents.value,
  ).toBeNull();
});
it('stops a printed reference at a preserved column gap while retaining single internal spaces', () => {
  for (const label of ['Rechnungsnummer', 'Rechnungtnummer', 'Abrechnungsnummer']) {
    for (const gap of ['  ', '   ', '\t']) {
      expect(
        parseStatementText(`${label}: SYNTHETIC-02${gap}Nachbarfeld`, sha).fields.reference.value,
      ).toBe('SYNTHETIC-02');
    }
    expect(parseStatementText(`${label}: SYNTHETIC 02`, sha).fields.reference.value).toBe(
      'SYNTHETIC 02',
    );
  }
});
