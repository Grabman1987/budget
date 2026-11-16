import { describe, expect, it } from 'vitest';
import { classifyWageLabel } from './payslip-text';
import {
  payrollNetComposition,
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
      splitUnclear: false,
      specialSlipIds: ['s'],
    });
  });

  it('marks a regular slip with net above gross as unclear but counts it in the total', () => {
    const mixed = slip('m', '2026-06', 'regular', {
      svCents: 0,
      taxCents: -20000,
      netCents: 320000,
    });
    const row = payrollNetComposition([mixed], '2026-06');
    expect(row).toMatchObject({
      runningCents: null,
      specialCents: 0,
      totalCents: 320000,
      splitUnclear: true,
    });
  });

  it('marks an earning line or a source-flagged slip as unclear and tolerates missing months', () => {
    const earning = slip('e', '2026-07', 'regular', {
      grossCents: 300000,
      netCents: 210000 + 5000,
      lines: [{ section: 'earning', label: 'Bonus', amountCents: 5000 }],
    });
    expect(payrollNetComposition([earning], '2026-07').splitUnclear).toBe(true);
    const flagged = slip('f', '2026-08', 'regular');
    expect(payrollNetComposition([flagged], '2026-08', new Set(['f']))).toMatchObject({
      splitUnclear: true,
      totalCents: 210000,
    });
    expect(payrollNetComposition([flagged], '2026-09')).toMatchObject({
      recorded: false,
      totalCents: null,
    });
  });
});
