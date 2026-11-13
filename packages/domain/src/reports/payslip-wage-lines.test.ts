import { describe, expect, it } from 'vitest';
import { parsePayrollDocument, type ParsedPayrollDocument } from './payslip-intake';
import {
  columnarText,
  labelBenefitText,
  labelBonusRunText,
  labelText,
  rightAt,
  wageRow,
} from './payslip-wage-fixtures';

const empty = { salaryAccountId: null, wageTypes: {} };
const line = (
  order: number,
  code: string | null,
  label: string,
  section: string,
  amountCents: number,
  extra: Partial<{ referenceMonth: string; quantity: string; rate: string }> = {},
) => ({
  order,
  code,
  label,
  section,
  referenceMonth: extra.referenceMonth ?? null,
  quantity: extra.quantity ?? null,
  rate: extra.rate ?? null,
  amountCents,
});
/** Payout identity of the wage lines: gross − SV − tax + every other payout effect = net. */
const payoutOf = (p: ParsedPayrollDocument) =>
  p.draft!.grossCents -
  p.draft!.svCents -
  p.draft!.taxCents +
  p
    .wageLines!.filter(
      (l) => !['earning', 'benefit_in_kind', 'memo', 'unknown'].includes(l.section),
    )
    .reduce((n, l) => n + l.amountCents, 0);

describe('wage lines of the columnar layout (#1066)', () => {
  it('emits every wage line with code, reference month, quantity/rate and payout sign', () => {
    const parsed = parsePayrollDocument(columnarText(), 'synthetic.pdf', empty);
    expect(parsed.wageLines).toEqual([
      line(0, '105', 'Gehalt (All-in)', 'earning', 500_000),
      line(1, '1260', 'Home Office Pauschale', 'reimbursement', 1_200, {
        referenceMonth: '2030-03',
        quantity: '4,00',
        rate: '3,00',
      }),
      line(2, '129', 'Bonus laufend', 'earning', 50_000),
      line(3, '194', 'Tages-/Nächtig./Geld pfl', 'memo', 3_000),
      line(4, '270', 'Fahrgeld-Zuschuss', 'reimbursement', 5_000, {
        quantity: '10,00',
        rate: '5,00',
      }),
      line(5, '503', 'Weihnachtsremuneration', 'earning', 500_000),
      line(6, '599', 'Auszahlung Reisespesen', 'reimbursement', 10_000),
      line(7, '860', 'Kantine April', 'deduction', -2_000),
      line(8, '860', 'Gutschrift Kantine März', 'deduction', 500),
      line(9, '9602', 'Pendlereuro', 'memo', 717),
      line(10, '9770', 'MA-Vorsorge Beitrag', 'memo', 8_415),
      line(11, null, 'Aufrollung Sozialversicherung', 'sv_adjustment', -1_000),
      line(12, null, 'Aufrollung Lohnsteuer', 'tax_adjustment', 30_000),
    ]);
    expect(parsed.statutorySplit).toEqual({
      svCurrentCents: 108_000,
      svSpecialCents: 80_000,
      taxCurrentCents: 140_000,
      taxOtherCents: 70_000,
    });
    expect(parsed.wageLineIssue).toBeUndefined();
    // Earnings 5.000 + 500 + 5.000 equal the gross (10.662 printed − 162 reimbursements).
    expect(parsed.draft?.grossCents).toBe(1_050_000);
    expect(payoutOf(parsed)).toBe(parsed.draft?.netCents);
  });

  it('flags an unknown wage type inside the printed sum instead of failing', () => {
    const parsed = parsePayrollDocument(
      columnarText({ extra: wageRow('777', 'Sondervergütung X', rightAt(82, '100,00')) }),
      'synthetic.pdf',
      empty,
    );
    expect(parsed.draft?.grossCents).toBe(1_060_000);
    expect(parsed.wageLines?.find((l) => l.code === '777')).toMatchObject({
      section: 'unknown',
      amountCents: 10_000,
    });
    expect(parsed.wageLineIssue).toBe('gross_mismatch');
  });

  it('follows the owner section mapping and marks a benefit in kind', () => {
    const parsed = parsePayrollDocument(
      columnarText({
        extra: wageRow('777', 'Sachbezug Wohnung', rightAt(82, '100,00')),
        below: wageRow('870', 'Sachbezug Abzug', rightAt(82, '100,00-')),
      }),
      'synthetic.pdf',
      { salaryAccountId: null, wageTypes: { '777': 'earning' } },
    );
    expect(parsed.wageLines?.find((l) => l.code === '777')).toMatchObject({
      section: 'benefit_in_kind',
      amountCents: 10_000,
    });
    expect(parsed.wageLines?.find((l) => l.code === '870')).toMatchObject({
      section: 'deduction',
      amountCents: -10_000,
    });
    expect(parsed.wageLineIssue).toBeUndefined();
  });

  it('keeps the split unknown when the deduction columns are not readable', () => {
    const parsed = parsePayrollDocument(
      columnarText().replace(
        /^ *SVallgemein.*$/m,
        '                    SVallgemein SVSonderzahlung Lohnsteuerlaufend LstSonstigeBezüge',
      ),
      'synthetic.pdf',
      empty,
    );
    expect(parsed.statutorySplit).toBeNull();
    expect(parsed.wageLineIssue).toBe('no_gross');
  });
});

describe('wage lines of the label layout (#1066)', () => {
  it('emits earnings, reimbursements, corrections and the split statutory rows', () => {
    const parsed = parsePayrollDocument(labelText(), 'synthetic.pdf', empty);
    expect(parsed.wageLines).toEqual([
      line(0, '810', 'Grundgehalt', 'earning', 400_000),
      line(1, '811', 'Telearbeit', 'reimbursement', 2_500),
      line(2, '812', 'Fahrgeld', 'reimbursement', 3_000),
      line(3, '813', 'Dienstreise-Auslagen und Diäten', 'reimbursement', 4_500),
      line(4, null, 'Aufrollung Lohnsteuer-Erstattung', 'tax_adjustment', 6_000),
      line(5, null, 'Aufrollung SV-DN', 'sv_adjustment', 2_000),
      line(6, null, 'Sonstige Abzüge', 'deduction', -500),
    ]);
    expect(parsed.statutorySplit).toEqual({
      svCurrentCents: 70_000,
      svSpecialCents: 0,
      taxCurrentCents: 50_000,
      taxOtherCents: 0,
    });
    expect(parsed.wageLineIssue).toBeUndefined();
    expect(payoutOf(parsed)).toBe(297_500);
  });

  it('separates a benefit in kind inside the gross', () => {
    const parsed = parsePayrollDocument(labelBenefitText(), 'synthetic.pdf', empty);
    expect(parsed.wageLines?.map((l) => [l.code, l.section, l.amountCents])).toEqual([
      ['810', 'earning', 300_000],
      ['820', 'benefit_in_kind', 20_000],
      ['830', 'earning', 30_000],
      [null, 'deduction', -20_000],
    ]);
    expect(parsed.wageLineIssue).toBeUndefined();
    expect(payoutOf(parsed)).toBe(230_000);
  });

  it('reads a bonus run with special-payment statutory rows', () => {
    const parsed = parsePayrollDocument(labelBonusRunText(), 'synthetic.pdf', empty);
    expect(parsed.wageLines).toEqual([line(0, null, 'Mitarbeiterbonus', 'earning', 100_000)]);
    expect(parsed.statutorySplit).toEqual({
      svCurrentCents: 0,
      svSpecialCents: 17_000,
      taxCurrentCents: 0,
      taxOtherCents: 6_000,
    });
  });

  it('marks unknown lines and an unreadable split instead of guessing', () => {
    const parsed = parsePayrollDocument(
      labelText(['840 Sonderleistung Y 50,00']).replace('SV-DN laufend', 'SV-DN'),
      'synthetic.pdf',
      empty,
    );
    expect(parsed.wageLines?.find((l) => l.code === '840')?.section).toBe('unknown');
    expect(parsed.statutorySplit).toBeNull();
    // The unknown line lies outside the printed gross here; the earnings still reconcile.
    expect(parsed.wageLineIssue).toBeUndefined();
  });

  it('adds nothing to letters without a payroll run', () => {
    const parsed = parsePayrollDocument('Pensionskasse 2030\nEUR 1,00', 'synthetic.pdf', empty);
    expect(parsed).not.toHaveProperty('wageLines');
    expect(parsed).not.toHaveProperty('statutorySplit');
  });
});
