import { describe, expect, it } from 'vitest';
import { parsePayrollDocument } from './payslip-intake';
import { planWageReread } from './payslip-wage-reread';
import { labelText } from './payslip-wage-fixtures';

// Synthetic only: the stored payslip equals the document unless a test changes it.
const parsed = parsePayrollDocument(labelText(), 'synthetic.pdf', {
  salaryAccountId: null,
  wageTypes: {},
});
const stored = { ...parsed.draft!, id: 'p1', receiptId: 'r1' };
const source = { status: 'parsed' as const, parsed };

describe('re-read planner (#1066)', () => {
  it('adds the lines when every legacy field matches', () => {
    expect(planWageReread(stored, false, source)).toEqual({
      payslipId: 'p1',
      month: '2026-09',
      outcome: 'add',
      lineCount: 7,
      lineCheck: 'ok',
      differences: [],
    });
  });

  it('reports kind, deduction and correction differences and adds nothing', () => {
    const changed = {
      ...stored,
      kind: 'special' as const,
      specialType: 'salary14' as const,
      lines: stored.lines.map((l) =>
        l.section === 'deduction'
          ? { ...l, amountCents: l.amountCents + 1 }
          : l.section === 'tax_adjustment'
            ? { ...l, amountCents: l.amountCents - 1 }
            : l,
      ),
    };
    expect(planWageReread(changed, false, source)).toMatchObject({
      outcome: 'totals_differ',
      lineCount: 0,
      differences: ['kind', 'deductions', 'adjustments'],
    });
  });

  it('never opens or adds for a read, document-less or unreadable payslip', () => {
    expect(planWageReread(stored, true, source).outcome).toBe('already_read');
    expect(planWageReread({ ...stored, receiptId: null }, false, null).outcome).toBe('no_document');
    expect(planWageReread(stored, false, { status: 'password' }).outcome).toBe('password');
  });
});
