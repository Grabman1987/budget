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

/**
 * #1066 legacy equality: the wage-line extension must not change one byte of the fields the parsers
 * produced before it. The snapshots (__snapshots__) were recorded with the parsers of main e496fe6 (before
 * the extension) and are compared against the legacy view of today's result.
 */
const LEGACY_KEYS = [
  'documentType',
  'periodSource',
  'payoutDate',
  'draft',
  'differenceCents',
  'warnings',
  'unmappedWageTypes',
  'parserVersion',
] as const;
const legacy = (parsed: ParsedPayrollDocument) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(parsed).filter(([key]) => (LEGACY_KEYS as readonly string[]).includes(key)),
    ),
  );
const empty = { salaryAccountId: null, wageTypes: {} };

const cases: [string, () => ParsedPayrollDocument][] = [
  ['label layout', () => parsePayrollDocument(labelText(), 'synthetic-202609.pdf', empty)],
  [
    'label layout with an unmapped wage type',
    () => parsePayrollDocument(labelText(['840 Sonderleistung Y 50,00']), 'synthetic.pdf', empty),
  ],
  [
    'label layout with an owner mapping',
    () =>
      parsePayrollDocument(labelText(['840 Sonderleistung Y 50,00']), 'synthetic.pdf', {
        salaryAccountId: null,
        wageTypes: { '840': 'reimbursement' },
      }),
  ],
  [
    'label layout with a benefit in kind',
    () => parsePayrollDocument(labelBenefitText(), 'synthetic.pdf', empty),
  ],
  [
    'label layout bonus run',
    () => parsePayrollDocument(labelBonusRunText(), 'synthetic.pdf', empty),
  ],
  ['columnar layout', () => parsePayrollDocument(columnarText(), 'synthetic.pdf', empty)],
  [
    'columnar layout with an unmapped wage type',
    () =>
      parsePayrollDocument(
        columnarText({ extra: wageRow('777', 'Sondervergütung X', rightAt(82, '100,00')) }),
        'synthetic.pdf',
        empty,
      ),
  ],
  [
    'columnar layout with owner mappings',
    () =>
      parsePayrollDocument(
        columnarText({ extra: wageRow('777', 'Sondervergütung X', rightAt(82, '100,00')) }),
        'synthetic.pdf',
        { salaryAccountId: null, wageTypes: { '777': 'reimbursement', '105': 'earning' } },
      ),
  ],
  [
    'columnar layout with a deduction mapped below the sum',
    () =>
      parsePayrollDocument(
        columnarText({ below: wageRow('870', 'Sachbezug Abzug', rightAt(82, '40,00-')) }),
        'synthetic.pdf',
        empty,
      ),
  ],
  [
    'pension letter',
    () =>
      parsePayrollDocument(
        'Pensionskasse 2030\nEUR 1 234,56 (inkl. 1 % Auszahlungskosten)',
        'synthetic.pdf',
        empty,
      ),
  ],
];

describe('legacy parser fields stay byte-identical (#1066)', () => {
  it.each(cases)('%s', (_name, run) => {
    expect(legacy(run())).toMatchSnapshot();
  });
});
