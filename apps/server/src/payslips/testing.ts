import PDFDocument from 'pdfkit';

/** Synthetic document generated in memory; no external fixture, identity or provider content. */
export async function syntheticPayslipPdf(
  rows = syntheticWageRows,
  password: string | undefined = 'synthetic-pdf-password',
) {
  const pdf = new PDFDocument({
    pdfVersion: '1.7',
    ...(password ? { userPassword: password, ownerPassword: 'synthetic-owner-password' } : {}),
  });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  pdf.font('Helvetica').fontSize(12);
  for (const row of rows) pdf.text(row);
  pdf.end();
  return result;
}
export const syntheticWageRows = [
  'LGV / ZFA2 Lohnart Abrechnung',
  'Abrechnungsmonat: 09/2026',
  'Auszahlungsdatum: 30.09.2026',
  '810 Grundgehalt 4.000,00',
  '811 Telearbeit 25,00',
  '812 Fahrgeld 30,00',
  '813 Dienstreise-Auslagen und Diäten 45,00',
  'Brutto 4.000,00',
  'SV-DN laufend 700,00',
  'SV-DN SZ 0,00',
  'LSt laufend 500,00',
  'LSt SZ 0,00',
  'Aufrollung Lohnsteuer-Erstattung -60,00',
  'Aufrollung SV-DN -20,00',
  'Sonstige Abzüge 5,00',
  'Auszahlung 2.975,00',
];

type Cell = { x: number; text: string; right?: boolean };
/**
 * Synthetic payslip in the columnar form (wage-type block, sum row, deductions table, bank row),
 * every value invented. `x` is the left edge, or the right edge when `right` is set.
 */
export const syntheticColumnarRows: Cell[][] = (() => {
  const wage = (code: string, label: string, ...nums: [number, string][]): Cell[] => [
    { x: 130, text: code },
    { x: 165, text: label },
    ...nums.map(([x, text]) => ({ x, text, right: true })),
  ];
  return [
    [
      { x: 60, text: 'Lohn-/Gehaltsverrechnung' },
      { x: 400, text: 'Datum 12.04.2030' },
    ],
    [
      { x: 60, text: 'Muster Firma GmbH' },
      { x: 250, text: '100' },
      { x: 470, text: '04.2030' },
    ],
    [{ x: 470, text: 'Abrechnungsmonat:' }],
    [
      { x: 60, text: 'Monat' },
      { x: 130, text: 'Lohnart' },
      { x: 250, text: 'Menge' },
      { x: 330, text: 'Satz' },
      { x: 480, text: 'Betrag' },
    ],
    wage('105', 'Gehalt (All-in)', [540, '5.000,00']),
    [
      { x: 90, text: '32030' },
      ...wage('1260', 'Home Office Pauschale', [280, '4,00'], [360, '3,00'], [540, '12,00']).slice(
        0,
      ),
    ],
    wage('129', '*Bonus laufend', [540, '500,00']),
    wage('194', 'Tages-/Nächtig./Geld pfl', [360, '30,00']),
    wage('270', 'Fahrgeld-Zuschuss', [280, '10,00'], [360, '5,00'], [540, '50,00']),
    wage('503', 'Weihnachtsremuneration', [540, '5.000,00']),
    wage('599', 'Auszahlung Reisespesen', [540, '100,00']),
    [
      { x: 130, text: '______________________________' },
      { x: 140, text: 'Summe der Bezüge:' },
      { x: 540, text: '10.662,00', right: true },
    ],
    wage('860', '*Kantine April', [540, '20,00-']),
    wage('860', '*Gutschrift Kantine März', [540, '5,00']),
    wage('9602', 'Pendlereuro', [330, '7,17']),
    wage('9710', 'MA-Vorsorge Bem. lfd.', [330, '5.500,00']),
    wage('9770', 'MA-Vorsorge Beitrag', [330, '84,15']),
    [
      { x: 100, text: 'SVallgemein' },
      { x: 190, text: 'SVSonderzahlung' },
      { x: 280, text: 'Lohnsteuerlaufend' },
      { x: 380, text: 'LstSonstigeBezüge' },
      { x: 470, text: 'SummepersönlicheAbzüge' },
    ],
    [{ x: 540, text: '15,00', right: true }],
    [
      { x: 60, text: 'Bemessungen:' },
      { x: 158, text: '6.000,00', right: true },
      { x: 330, text: '4.800,00', right: true },
    ],
    [{ x: 470, text: 'SummegesetzlicheAbzüge' }],
    [
      { x: 60, text: 'Abzüge:' },
      { x: 158, text: '1.080,00', right: true },
      { x: 255, text: '800,00', right: true },
      { x: 330, text: '1.400,00', right: true },
      { x: 402, text: '700,00', right: true },
      { x: 540, text: '3.690,00', right: true },
    ],
    [
      { x: 158, text: '10,00', right: true },
      { x: 330, text: '300,00-', right: true },
    ],
    [{ x: 60, text: 'Aufrollungen:' }],
    [
      { x: 60, text: 'Bankverbindung' },
      { x: 470, text: 'Auszahlung' },
    ],
    [
      { x: 60, text: 'IBAN: XX00 0000 0000 0000 0000; BIC: TESTXXYYZZZ' },
      { x: 540, text: '6.957,00', right: true },
    ],
  ];
})();
/** Same document as `syntheticColumnarRows`, drawn with absolute positions. */
export async function syntheticColumnarPayslipPdf(
  rows = syntheticColumnarRows,
  password: string | undefined = 'synthetic-pdf-password',
) {
  const pdf = new PDFDocument({
    pdfVersion: '1.7',
    ...(password ? { userPassword: password, ownerPassword: 'synthetic-owner-password' } : {}),
  });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  pdf.font('Helvetica').fontSize(8);
  rows.forEach((row, i) => {
    const y = 40 + i * 12 + (row[0]?.text === '______________________________' ? 0 : 0);
    for (const cell of row)
      pdf.text(cell.text, cell.right ? cell.x - pdf.widthOfString(cell.text) : cell.x, y, {
        lineBreak: false,
      });
  });
  pdf.end();
  return result;
}
