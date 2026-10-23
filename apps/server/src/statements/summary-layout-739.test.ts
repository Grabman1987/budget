import { expect, it } from 'vitest';
import { syntheticColumnarPayslipPdf } from '../payslips/testing';
import { extractStatement } from './service';

const rows = [
  [
    { x: 40, text: 'Datum' },
    { x: 300, text: '04.06.2031' },
  ],
  [
    { x: 40, text: 'Datum nächste Umsatznachricht' },
    { x: 300, text: '04.07.2031' },
  ],
  [
    { x: 40, text: 'Wird eingezogen am' },
    { x: 300, text: '12.06.2031' },
  ],
  [
    { x: 40, text: 'Saldo' },
    { x: 300, text: '120,00-' },
  ],
  [
    { x: 40, text: 'Karte Umsatz Buchung Buchungstext Betrag Kurs' },
    { x: 300, text: 'EUR Betrag' },
  ],
  [
    { x: 40, text: '01.06.2031 Einkauf A' },
    { x: 300, text: '70,00-' },
  ],
  [
    { x: 40, text: '02.06.2031 Einkauf B USD 600,00-' },
    { x: 300, text: '50,00-' },
  ],
];

it('reconstructs real synthetic PDF summary cells through the app worker before proposing facts', async () => {
  const pdf = await syntheticColumnarPayslipPdf(rows, '');
  const p = await extractStatement(pdf);
  expect(p.extraction).toBe('parsed');
  expect(p.fields.issueDate.value).toBe('2031-06-04');
  expect(p.fields.debitDate.value).toBe('2031-06-12');
  expect(p.fields.payableCents.value).toBe(12000);
  expect(p.fields.currency).toMatchObject({ value: 'EUR', candidates: ['EUR'] });
  expect(p.fields.reference.value).toBeNull();
  expect(p.fields.periodFrom.value).toBeNull();
  expect(p.fields.periodTo.value).toBeNull();
  expect(p.fields.payableCents.evidence).toEqual({ page: null, line: 4, label: 'payable' });
});

it('keeps unknown debit dates and explicit summary credits distinct after PDF extraction', async () => {
  const altered = rows.map((row, i) =>
    i === 2
      ? [{ x: 40, text: 'Wird eingezogen am' }]
      : i === 3
        ? [
            { x: 40, text: 'Saldo' },
            { x: 300, text: '12,34+' },
          ]
        : row,
  );
  const p = await extractStatement(await syntheticColumnarPayslipPdf(altered, ''));
  expect(p.fields.payableCents.value).toBe(-1234);
  expect(p.fields.debitDate.value).toBeNull();
  expect(p.warnings).toContain('debit_date_required');
});
