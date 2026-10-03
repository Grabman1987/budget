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
