import { describe, expect, it } from 'vitest';
import { classifyWageLabel } from './payslip-text';
import {
  payrollNetComposition,
  payrollReport,
  payrollTotals,
  payslipPayNetCents,
  type CapturedPayslip,
} from './payroll-projects';
import { isSalaryAllowanceLabel } from './wage-label-rules';

const slip = (
  id: string,
  month: string,
  kind: 'regular' | 'special',
  over: Partial<CapturedPayslip> = {},
): CapturedPayslip => ({
  id,
  month,
  kind,
  specialType: kind === 'special' ? 'other' : null,
  grossCents: 300000,
  svCents: 50000,
  taxCents: 40000,
  netCents: 210000,
  lines: [],
  bookingId: null,
  receiptId: null,
  ...over,
});

describe('payroll net composition', () => {
  it('keeps one allowance rule: Telearbeit/Fahrgeld are pay, travel expenses are not', () => {
    expect(isSalaryAllowanceLabel('Telearbeitspauschale')).toBe(true);
    expect(isSalaryAllowanceLabel('Fahrgeld')).toBe(true);
    expect(isSalaryAllowanceLabel('Reisespesen')).toBe(false);
    for (const l of ['telearbeit', 'fahrgeld', 'reisespesen'])
      expect(classifyWageLabel(l)).toBe('reimbursement');
    const s = slip('a', '2026-01', 'regular', {
      netCents: 210000 + 1000 + 2000 + 3000,
      lines: [
        { section: 'reimbursement', label: 'Telearbeit', amountCents: 1000 },
        { section: 'reimbursement', label: 'Fahrgeld', amountCents: 2000 },
        { section: 'reimbursement', label: 'Reisespesen', amountCents: 3000 },
      ],
    });
    expect(payslipPayNetCents(s)).toBe(213000);
  });

  it('shows running and special pay separately and adds them in the monthly total', () => {
    const slips = [
      slip('r', '2026-03', 'regular'),
      slip('s', '2026-03', 'special', {
        grossCents: 200000,
        svCents: 30000,
        taxCents: 20000,
        netCents: 150000,
      }),
    ];
    expect(payrollNetComposition(slips, '2026-03')).toMatchObject({
      runningCents: 210000,
      specialCents: 150000,
      totalCents: 360000,
      specialSlipIds: ['s'],
    });
  });

  it('never splits a combined slip: its full pay stays in its month', () => {
    // regular 3.000 gross + bonus line 2.000 earning: SV 700, tax 900 -> net 3.400 (all synthetic)
    const combined = slip('c', '2026-06', 'regular', {
      grossCents: 300000,
      svCents: 70000,
      taxCents: 90000,
      netCents: 340000,
      lines: [{ section: 'earning', label: 'Bonus', amountCents: 200000 }],
    });
    const row = payrollNetComposition([combined], '2026-06');
    expect(row).toMatchObject({ runningCents: 340000, specialCents: 0, totalCents: 340000 });
    expect(row).not.toHaveProperty('splitUnclear');
    const t = payrollTotals([combined]);
    expect(t.grossCents).toBe(500000);
    expect(t.grossCents - t.svCents - t.taxCents).toBe(340000);
    expect(t.salaryNetCents).toBe(combined.netCents);
  });

  it('tolerates missing months', () => {
    expect(payrollNetComposition([slip('f', '2026-08', 'regular')], '2026-09')).toMatchObject({
      recorded: false,
      totalCents: null,
    });
  });

  it('timeline carries special payments and salary allowances in the same month', () => {
    const regular = slip('r', '2026-03', 'regular', {
      netCents: 210000 + 1000 + 3000,
      lines: [
        { section: 'reimbursement', label: 'Telearbeit', amountCents: 1000 },
        { section: 'reimbursement', label: 'Reisespesen', amountCents: 3000 },
      ],
    });
    const special = slip('s', '2026-03', 'special', {
      grossCents: 200000,
      svCents: 30000,
      taxCents: 20000,
      netCents: 150000,
    });
    const row = payrollReport([regular, special], '2026-03').timeline[0]!;
    expect(row).toMatchObject({
      recorded: true,
      grossCents: 500000,
      svCents: 80000,
      taxCents: 60000,
      payGrossCents: 501000,
      payNetCents: 361000,
    });
    expect(row.payGrossCents - row.svCents - row.taxCents).toBe(row.payNetCents);
    expect(row.composition.totalCents).toBe(row.payNetCents);
  });
});
