import { describe, expect, it } from 'vitest';
import { payrollReport, payslipInput, projectResult } from './payroll-projects';

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
