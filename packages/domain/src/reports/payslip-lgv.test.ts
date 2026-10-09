import { describe, expect, it } from 'vitest';
import { PAYSLIP_PARSER_VERSION, parsePayrollDocument } from './payslip-intake';

// Synthetic text only: invented company, wage types and amounts in the layout of a columnar form.
const config = { salaryAccountId: null, wageTypes: {} };
/** One text row from [column, text] cells; right-aligned amounts end at their column. */
const row = (...cells: [number, string][]) => {
  let line = '';
  for (const [column, text] of cells) line += ' '.repeat(Math.max(0, column - line.length)) + text;
  return line;
};
const amount = (end: number, text: string): [number, string] => [end - text.length, text];
const wage = (code: string, label: string, ...rest: [number, string][]) =>
  row([20, code], [26, label], ...rest);

const rows = (overrides: Partial<Record<string, string>> = {}) =>
  [
    row([4, 'Lohn-/Gehaltsverrechnung'], [60, 'Datum 12.04.2030']),
    row([4, 'Muster Firma GmbH'], [40, '100'], [70, '04.2030']),
    row([70, 'Abrechnungsmonat:']),
    row([4, 'Monat'], [20, 'Lohnart'], [44, 'Menge'], [56, 'Satz'], [76, 'Betrag']),
    wage('105', 'Gehalt (All-in)', amount(82, '5.000,00')),
    row(
      [10, '32030'],
      [20, '1260'],
      [26, 'Home Office Pauschale'],
      amount(50, '4,00'),
      amount(62, '3,00'),
      amount(82, '12,00'),
    ),
    wage('129', '*Bonus laufend', amount(82, '500,00')),
    wage('194', 'Tages-/Nächtig./Geld pfl', amount(62, '30,00')),
    wage('270', 'Fahrgeld-Zuschuss', amount(50, '10,00'), amount(62, '5,00'), amount(82, '50,00')),
    wage('503', 'Weihnachtsremuneration', amount(82, '5.000,00')),
    overrides['extra'] ?? wage('599', 'Auszahlung Reisespesen', amount(82, '100,00')),
    row([20, '_____________________'], [28, 'Summe der Bezüge:'], amount(82, '10.662,00')),
    wage('860', '*Kantine April', amount(82, '20,00-')),
    wage('860', '*Gutschrift Kantine März', amount(82, '5,00')),
    wage('9602', 'Pendlereuro', amount(50, '7,17')),
    wage('9770', 'MA-Vorsorge Beitrag', amount(50, '84,15')),
    overrides['header'] ??
      row(
        [20, 'SVallgemein'],
        [38, 'SVSonderzahlung'],
        [58, 'Lohnsteuerlaufend'],
        [78, 'LstSonstigeBezüge'],
        [100, 'SummepersönlicheAbzüge'],
      ),
    row(amount(110, '15,00')),
    row([4, 'Bemessungen:'], amount(30, '6.000,00'), amount(66, '4.800,00')),
    row([92, 'SummegesetzlicheAbzüge']),
    row(
      [4, 'Abzüge:'],
      amount(30, '1.080,00'),
      amount(48, '800,00'),
      amount(66, '1.400,00'),
      amount(80, '700,00'),
      amount(110, '3.690,00'),
    ),
    overrides['corrections'] ?? row(amount(30, '10,00'), amount(66, '300,00-')),
    row([4, 'Aufrollungen:']),
    row([4, 'Bankverbindung'], [92, 'Auszahlung']),
    row([4, 'IBAN: XX00 0000 0000 0000 0000; BIC: TESTXXYYZZZ'], amount(110, '6.957,00')),
  ].join('\n');

describe('columnar payslip layout', () => {
  it('reads totals, columns, corrections and splits tax-free reimbursements from the gross', () => {
    const parsed = parsePayrollDocument(rows(), 'synthetic.pdf', config);
    expect(parsed).toMatchObject({
      documentType: 'payslip',
      periodSource: 'content',
      differenceCents: 0,
      warnings: [],
      parserVersion: PAYSLIP_PARSER_VERSION,
    });
    expect(parsed.draft).toEqual({
      month: '2030-04',
      kind: 'regular',
      specialType: null,
      // 10.662,00 printed minus 12,00 + 50,00 + 100,00 reimbursements.
      grossCents: 1_050_000,
      svCents: 188_000,
      taxCents: 210_000,
      netCents: 695_700,
      bookingId: null,
      receiptId: null,
      lines: [
        { section: 'reimbursement', label: 'Home Office Pauschale', amountCents: 1_200 },
        { section: 'reimbursement', label: 'Fahrgeld-Zuschuss', amountCents: 5_000 },
        { section: 'reimbursement', label: 'Auszahlung Reisespesen', amountCents: 10_000 },
        // A trailing minus is a deduction, a plain amount on the same wage type is a credit.
        { section: 'deduction', label: 'Kantine April', amountCents: 2_000 },
        { section: 'deduction', label: 'Gutschrift Kantine März', amountCents: -500 },
        { section: 'sv_adjustment', label: 'Aufrollung Sozialversicherung', amountCents: 1_000 },
        { section: 'tax_adjustment', label: 'Aufrollung Lohnsteuer', amountCents: -30_000 },
      ],
    });
  });

  it('does not mistake the issue date for the billing month', () => {
    const text = rows().replace(
      row([4, 'Muster Firma GmbH'], [40, '100'], [70, '04.2030']),
      row([4, 'Muster Firma GmbH']),
    );
    const parsed = parsePayrollDocument(text, 'synthetic-202912.pdf', config);
    expect(parsed.draft?.month).toBe('2029-12');
    expect(parsed.periodSource).toBe('filename');
  });

  it('reads corrections printed beside the label as well', () => {
    const beside = row([4, 'Aufrollungen:'], amount(30, '10,00'), amount(66, '300,00-'));
    const text = rows({ corrections: beside }).replace(row([4, 'Aufrollungen:']) + '\n', '');
    const parsed = parsePayrollDocument(text, 'synthetic.pdf', config);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.draft?.lines.slice(-2)).toEqual([
      { section: 'sv_adjustment', label: 'Aufrollung Sozialversicherung', amountCents: 1_000 },
      { section: 'tax_adjustment', label: 'Aufrollung Lohnsteuer', amountCents: -30_000 },
    ]);
  });

  it('keeps an unknown wage type as a warning until the owner maps it', () => {
    const text = rows({ extra: wage('777', 'Sondervergütung X', amount(82, '100,00')) });
    const parsed = parsePayrollDocument(text, 'synthetic.pdf', config);
    expect(parsed.warnings).toContain('Unbekannte Lohnart oder Aufrollung: Zuordnung prüfen.');
    const mapped = parsePayrollDocument(text, 'synthetic.pdf', {
      salaryAccountId: null,
      wageTypes: { '777': 'reimbursement' },
    });
    expect(mapped.warnings).toEqual([]);
    expect(mapped.draft?.lines).toContainEqual({
      section: 'reimbursement',
      label: 'Sondervergütung X',
      amountCents: 10_000,
    });
  });

  it('refuses to guess when the deduction columns cannot be told apart', () => {
    const merged = row([20, 'SVallgemein SVSonderzahlung Lohnsteuerlaufend LstSonstigeBezüge']);
    const parsed = parsePayrollDocument(rows({ header: merged }), 'synthetic.pdf', config);
    expect(parsed.draft).toBeNull();
    expect(parsed.warnings).toContain('Tabelle der Abzüge (SV, Lohnsteuer) nicht erkannt.');
  });

  it('flags columns that do not add up to the printed statutory total', () => {
    const wrong = rows().replace('3.690,00', '3.691,00');
    const parsed = parsePayrollDocument(wrong, 'synthetic.pdf', config);
    expect(parsed.warnings).toContain(
      'Summe der gesetzlichen Abzüge stimmt nicht mit den Spalten überein.',
    );
  });

  it('reads a sum row whose letters and digits are spaced apart', () => {
    const spaced = rows()
      .replace('Summe der Bezüge:', 'S u m m e  d e r  B e z ü g e :')
      .replace('10.662,00', '1 0 . 6 6 2 , 0 0');
    expect(parsePayrollDocument(spaced, 'synthetic.pdf', config).draft?.grossCents).toBe(1_050_000);
  });
});

describe('other payroll documents', () => {
  it('recognizes a company pension letter even though it mentions payout costs', () => {
    const text = [
      'Pensionskasse 2030',
      'Zu Ihrer Zukunftsvorsorge wird per 31.12.2030 folgender Betrag einbezahlt:',
      'EUR 1 234,56 (inkl. 2,5 % Versicherungssteuer und 1 % Auszahlungskosten)',
    ].join('\n');
    expect(parsePayrollDocument(text, 'synthetic.pdf', config)).toMatchObject({
      documentType: 'pension',
      draft: null,
      warnings: ['Pensionskassen-Mitteilung: kein Gehaltszettel.'],
    });
  });

  it.each([
    ['dein Bonus in Summe', 'EUR brutto 7,000 beträgt'],
    ['your bonus will total', 'EUR 8,000 gross'],
  ])('files a bonus letter without a draft (%s)', (lead, amount) => {
    const text = ['Danke für 2030', lead, amount].join('\n');
    expect(parsePayrollDocument(text, 'synthetic.pdf', config)).toMatchObject({
      documentType: 'bonus',
      draft: null,
      warnings: ['Bonus-Mitteilung: kein Gehaltszettel.'],
    });
  });

  it('classifies generic pay supplements as part of the printed gross', () => {
    const text = [
      'Abrechnungsmonat: 09/2030',
      '810 Überstundenzuschlag 50% 120,00',
      '811 Fahrtkostenersatz Kilometergeld 30,00',
      'Brutto 1.000,00',
      'SV-DN laufend 100,00',
      'LSt laufend 150,00',
      'Auszahlung 780,00',
    ].join('\n');
    const parsed = parsePayrollDocument(text, 'synthetic.pdf', config);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.draft?.lines).toEqual([
      { section: 'reimbursement', label: 'Fahrtkostenersatz Kilometergeld', amountCents: 3_000 },
    ]);
  });
});
