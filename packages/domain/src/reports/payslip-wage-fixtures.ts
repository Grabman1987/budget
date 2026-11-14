/**
 * Synthetic payroll texts for parser tests (#1066). Every company, wage type and amount is invented;
 * the layouts follow the label-driven and the columnar form the parsers support.
 */

/** One text row from [column, text] cells; right-aligned amounts end at their column. */
export const cellRow = (...cells: [number, string][]) => {
  let line = '';
  for (const [column, text] of cells) line += ' '.repeat(Math.max(0, column - line.length)) + text;
  return line;
};
export const rightAt = (end: number, text: string): [number, string] => [end - text.length, text];
export const wageRow = (code: string, label: string, ...rest: [number, string][]) =>
  cellRow([20, code], [26, label], ...rest);

/** Columnar form; `overrides` replace single rows (same keys as the layout test). */
export const columnarText = (overrides: Partial<Record<string, string>> = {}) =>
  [
    cellRow([4, 'Lohn-/Gehaltsverrechnung'], [60, 'Datum 12.04.2030']),
    cellRow([4, 'Muster Firma GmbH'], [40, '100'], [70, '04.2030']),
    cellRow([70, 'Abrechnungsmonat:']),
    cellRow([4, 'Monat'], [20, 'Lohnart'], [44, 'Menge'], [56, 'Satz'], [76, 'Betrag']),
    wageRow('105', 'Gehalt (All-in)', rightAt(82, '5.000,00')),
    cellRow(
      [10, '32030'],
      [20, '1260'],
      [26, 'Home Office Pauschale'],
      rightAt(50, '4,00'),
      rightAt(62, '3,00'),
      rightAt(82, '12,00'),
    ),
    wageRow('129', '*Bonus laufend', rightAt(82, '500,00')),
    wageRow('194', 'Tages-/Nächtig./Geld pfl', rightAt(62, '30,00')),
    wageRow(
      '270',
      'Fahrgeld-Zuschuss',
      rightAt(50, '10,00'),
      rightAt(62, '5,00'),
      rightAt(82, '50,00'),
    ),
    wageRow('503', 'Weihnachtsremuneration', rightAt(82, '5.000,00')),
    overrides['extra'] ?? wageRow('599', 'Auszahlung Reisespesen', rightAt(82, '100,00')),
    overrides['sum'] ??
      cellRow([20, '_____________________'], [28, 'Summe der Bezüge:'], rightAt(82, '10.662,00')),
    wageRow('860', '*Kantine April', rightAt(82, '20,00-')),
    wageRow('860', '*Gutschrift Kantine März', rightAt(82, '5,00')),
    overrides['below'] ?? wageRow('9602', 'Pendlereuro', rightAt(50, '7,17')),
    wageRow('9770', 'MA-Vorsorge Beitrag', rightAt(50, '84,15')),
    cellRow(
      [20, 'SVallgemein'],
      [38, 'SVSonderzahlung'],
      [58, 'Lohnsteuerlaufend'],
      [78, 'LstSonstigeBezüge'],
      [100, 'SummepersönlicheAbzüge'],
    ),
    cellRow(rightAt(110, '15,00')),
    cellRow([4, 'Bemessungen:'], rightAt(30, '6.000,00'), rightAt(66, '4.800,00')),
    cellRow([92, 'SummegesetzlicheAbzüge']),
    cellRow(
      [4, 'Abzüge:'],
      rightAt(30, '1.080,00'),
      rightAt(48, '800,00'),
      rightAt(66, '1.400,00'),
      rightAt(80, '700,00'),
      rightAt(110, '3.690,00'),
    ),
    cellRow(rightAt(30, '10,00'), rightAt(66, '300,00-')),
    cellRow([4, 'Aufrollungen:']),
    cellRow([4, 'Bankverbindung'], [92, 'Auszahlung']),
    overrides['payout'] ??
      cellRow([4, 'IBAN: XX00 0000 0000 0000 0000; BIC: TESTXXYYZZZ'], rightAt(110, '6.957,00')),
  ].join('\n');

/** Label-driven form with reimbursements outside the gross and signed corrections. */
export const labelText = (rows: string[] = []) =>
  [
    'LGV / ZFA2 Lohnart Abrechnung',
    'Abrechnungsmonat: 09/2026',
    'Auszahlungsdatum: 30.09.2026',
    '810 Grundgehalt 4.000,00',
    '811 Telearbeit 25,00',
    '812 Fahrgeld 30,00',
    '813 Dienstreise-Auslagen und Diäten 45,00',
    ...rows,
    'Brutto 4.000,00',
    'SV-DN laufend 700,00',
    'SV-DN SZ 0,00',
    'LSt laufend 500,00',
    'LSt SZ 0,00',
    'Aufrollung Lohnsteuer-Erstattung -60,00',
    'Aufrollung SV-DN -20,00',
    'Sonstige Abzüge 5,00',
    'Auszahlung 2.975,00',
  ].join('\n');

/** Label-driven form with a benefit in kind inside the gross and its offset below. */
export const labelBenefitText = () =>
  [
    'Lohnart Abrechnung',
    'Abrechnungsmonat: 03/2027',
    '810 Grundgehalt 3.000,00',
    '820 Sachbezug Dienstwagen 200,00',
    '830 Überstundenpauschale 300,00',
    'Brutto 3.500,00',
    'SV-DN laufend 600,00',
    'LSt laufend 400,00',
    'Sonstige Abzüge 200,00',
    'Auszahlung 2.300,00',
  ].join('\n');

/** Label-driven payroll run of a bonus payment (special payslip). */
export const labelBonusRunText = () =>
  [
    'Lohnart Abrechnung',
    'Abrechnungsmonat: 06/2027',
    'Mitarbeiterbonus 1.000,00',
    'Brutto 1.000,00',
    'SV-DN SZ 170,00',
    'LSt SZ 60,00',
    'Auszahlung 770,00',
  ].join('\n');
