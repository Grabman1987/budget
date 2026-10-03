import { describe, expect, it } from 'vitest';
import {
  payrollReport,
  payrollTotals,
  payslipInput,
  projectResult,
  isDuplicatePayslip,
  type PayslipInput,
} from './payroll-projects';

const slip = (month: string, kind: 'regular' | 'special' = 'regular') => ({
  id: month + kind,
  month,
  kind,
  specialType: kind === 'special' ? ('salary13' as const) : null,
  grossCents: 400000,
  svCents: 70000,
  taxCents: 50000,
  netCents: 281500,
  lines: [
    { section: 'earning' as const, label: 'Zulage', amountCents: 2000 },
    { section: 'deduction' as const, label: 'Umlage', amountCents: 500 },
  ],
  bookingId: null,
  receiptId: null,
});

describe('captured payroll', () => {
  it('separates reimbursements from salary, ratios and the prior-year comparison', () => {
    const reimbursed: PayslipInput = {
      ...slip('2026-01'),
      netCents: 291500,
      lines: [
        ...slip('2026-01').lines,
        { section: 'reimbursement', label: 'Telearbeit', amountCents: 2500 },
        { section: 'reimbursement', label: 'Fahrgeld', amountCents: 3000 },
        { section: 'reimbursement', label: 'Reisespesen', amountCents: 4500 },
      ],
    };
    expect(payslipInput.safeParse(reimbursed).success).toBe(true);
    expect(payslipInput.safeParse({ ...reimbursed, netCents: 291501 }).success).toBe(false);
    expect(payrollTotals([reimbursed])).toMatchObject({
      grossCents: 402000,
      reimbursementsCents: 10000,
      salaryNetCents: 281500,
      calculatedNetCents: 291500,
      deductionRatio: 120500 / 402000,
      svRatio: 70000 / 402000,
      taxRatio: 50000 / 402000,
      otherRatio: 500 / 402000,
    });
    const report = payrollReport([slip('2025-01'), { ...reimbursed, id: 'current' }], '2026-01');
    expect(report.years[1]).toMatchObject({
      reimbursementsCents: 10000,
      changeCents: 0,
      changeRatio: 0,
    });
    expect(report.salaries[0]).toMatchObject({
      netCents: 291500,
      salaryNetCents: 281500,
      reimbursementsCents: 10000,
    });
    expect(report.salaries[1]).toMatchObject({
      netCents: null,
      salaryNetCents: null,
      reimbursementsCents: null,
    });
  });
  it('accepts signed tax and SV corrections, with signed ratios and exact net equality', () => {
    const corrected = { ...slip('2026-01'), svCents: -2000, taxCents: -6000, netCents: 409500 };
    expect(payslipInput.safeParse(corrected).success).toBe(true);
    expect(payrollTotals([corrected])).toMatchObject({
      grossCents: 402000,
      svCents: -2000,
      taxCents: -6000,
      taxRefundCents: 6000,
      taxChargeCents: 0,
      calculatedNetCents: 409500,
      svRatio: -2000 / 402000,
      taxRatio: -6000 / 402000,
      deductionRatio: -7500 / 402000,
    });
    expect(payslipInput.safeParse({ ...corrected, netCents: 409501 }).success).toBe(false);
    const refundOnly = { ...corrected, grossCents: 0, svCents: 0, netCents: 6000, lines: [] };
    expect(payslipInput.safeParse(refundOnly).success).toBe(true);
    expect(payrollTotals([refundOnly])).toMatchObject({
      taxRatio: null,
      svRatio: null,
      deductionRatio: null,
    });
    expect(payrollTotals([slip('2026-01'), corrected])).toMatchObject({
      taxCents: 44000,
      taxChargeCents: 50000,
      taxRefundCents: 6000,
    });
    expect(payslipInput.safeParse({ ...corrected, taxCents: -100_000_000_001 }).success).toBe(
      false,
    );
    expect(payslipInput.safeParse({ ...corrected, grossCents: -1 }).success).toBe(false);
    expect(
      payslipInput.safeParse({
        ...corrected,
        lines: [{ section: 'reimbursement', label: 'Erstattung', amountCents: -1 }],
      }).success,
    ).toBe(false);
  });
  it('identifies live duplicate payment positions except other special payments', () => {
    const regular = slip('2026-01');
    const special = slip('2026-01', 'special');
    expect(isDuplicatePayslip([regular], { ...regular, id: 'second' })).toBe(true);
    expect(isDuplicatePayslip([regular], regular)).toBe(false);
    expect(isDuplicatePayslip([regular], special)).toBe(false);
    expect(isDuplicatePayslip([special], { ...special, id: 'second' })).toBe(true);
    expect(isDuplicatePayslip([special], { ...special, specialType: 'salary14' })).toBe(false);
    const other = { ...special, specialType: 'other' as const };
    expect(isDuplicatePayslip([other], { ...other, id: 'second' })).toBe(false);
  });
  it('checks cents and reconciles additions and deductions without calculating tax', () => {
    expect(payslipInput.safeParse(slip('2026-01')).success).toBe(true);
    expect(payslipInput.safeParse({ ...slip('2026-01'), netCents: 281501 }).success).toBe(false);
    expect(payslipInput.safeParse({ ...slip('2026-01'), svCents: 1.5 }).success).toBe(false);
    expect(payslipInput.safeParse({ ...slip('2026-01'), month: '2026-13' }).success).toBe(false);
    expect(payslipInput.safeParse({ ...slip('2026-01'), specialType: 'salary13' }).success).toBe(
      false,
    );
  });
  it('keeps missing salaries unknown and compares only the same months and payment kinds', () => {
    const report = payrollReport(
      [slip('2025-01'), slip('2026-01'), slip('2026-06', 'special')],
      '2026-01',
    );
    expect(report.month.netCents).toBe(281500);
    expect(report.years[1]?.netCents).toBe(563000);
    expect(report.years[1]?.changeCents).toBeNull(); // missing prior special payment
    expect(report.salaries[1]?.netCents).toBeNull();
    expect(report.salaries[12]?.netCents).toBe(281500);
    expect(report.salaries[13]?.netCents).toBeNull();
    expect(
      payrollReport([slip('2025-01'), { ...slip('2026-01'), grossCents: 410000 }], '2026-01')
        .years[1]?.changeCents,
    ).toBe(10000);
  });
});

describe('project profit and loss', () => {
  it('uses eligible split facts, signed refunds and no parent amount duplication', () => {
    expect(
      projectResult(
        [
          { month: '2026-01', amountCents: 50000, kind: 'income', bookingId: 'a' },
          { month: '2026-01', amountCents: -12000, kind: 'cost', bookingId: 'b' },
          { month: '2026-01', amountCents: 2000, kind: 'cost', bookingId: 'c' },
        ],
        ['2026-01', '2026-02'],
      ),
    ).toEqual({
      incomeCents: 50000,
      costCents: 10000,
      resultCents: 40000,
      perMonth: [40000, 0],
      bookingIds: ['a', 'b', 'c'],
    });
  });
});
