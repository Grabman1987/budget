import { expect, it } from 'vitest';
import { payrollSource, payrollPayoutDifference } from './payroll-source';
import { payrollReport } from './payroll-projects';
import type { SalaryPayslip, WageComponentRule } from '../salary/types';

export const combined: SalaryPayslip = {
  id: 'synthetic-combined',
  month: '2026-11',
  kind: 'regular',
  specialType: null,
  grossCents: 800000,
  svCents: 120000,
  taxCents: 100000,
  netCents: 590000,
  bookingId: null,
  receiptId: null,
  employerContactId: null,
  lines: [{ section: 'reimbursement', label: 'Synthetic expenses', amountCents: 10000 }],
  wage: {
    lineCheck: 'ok',
    split: null,
    lines: [
      {
        code: '100',
        label: 'Synthetic base',
        section: 'earning',
        referenceMonth: null,
        amountCents: 400000,
      },
      {
        code: '200',
        label: 'Synthetic special',
        section: 'earning',
        referenceMonth: null,
        amountCents: 400000,
      },
      {
        code: '300',
        label: 'Synthetic expenses',
        section: 'reimbursement',
        referenceMonth: null,
        amountCents: 10000,
      },
    ],
  },
};
export const rules: WageComponentRule[] = [
  { employerContactId: null, wageCode: '100', labelNorm: null, component: 'base' },
  { employerContactId: null, wageCode: '200', labelNorm: null, component: 'special' },
];
it('keeps equal regular and special gross, expenses and shared charges without inventing net', () => {
  const source = payrollSource(combined, rules);
  expect(source.paid).toMatchObject({ base: 400000, special: 400000, reimbursement: 10000 });
  expect(source.sharedDeductions).toEqual({ svCents: 120000, taxCents: 100000, otherCents: 0 });
  expect(source.netSplitUnknown).toBe(true);
  expect(source.statutorySplit).toBeNull();
  const report = payrollReport([combined], '2026-11');
  expect(report.month.netCents).toBe(590000);
  expect(report.salaries[10]).toMatchObject({ netCents: 590000, reimbursementsCents: 10000 });
  expect(report.timeline[0]?.composition.totalCents).toBe(report.timeline[0]?.payNetCents);
});
it('names the exact unmapped original position and preserves back pay separately', () => {
  const source = payrollSource(combined, rules.slice(0, 1));
  expect(source.unmapped).toContainEqual({
    payslipId: combined.id,
    code: '200',
    label: 'Synthetic special',
    amountCents: 400000,
    reason: 'unmapped',
  });
  const back = payrollSource(
    {
      ...combined,
      wage: {
        ...combined.wage!,
        lines: combined.wage!.lines.map((l) =>
          l.code === '100' ? { ...l, referenceMonth: '2026-10' } : l,
        ),
      },
    },
    rules,
  );
  expect(back.backPayCents.base).toBe(400000);
  expect(back.components.base).toBe(400000);
  expect(back.netSplitUnknown).toBe(true);
});
it('does not allocate a shared deduction even when statutory tax and SV parts exist', () => {
  const source = payrollSource(
    {
      ...combined,
      wage: {
        ...combined.wage!,
        split: {
          svCurrentCents: 70000,
          svSpecialCents: 50000,
          taxCurrentCents: 80000,
          taxOtherCents: 20000,
        },
      },
    },
    rules,
  );
  expect(source.netSplitUnknown).toBe(true);
  expect(source.statutorySplit?.taxOtherCents).toBe(20000);
});

it('keeps a separately captured special payment net known and out of the regular curve', () => {
  const special: SalaryPayslip = {
    ...combined,
    id: 'synthetic-special',
    kind: 'special',
    specialType: 'salary13',
    grossCents: 400000,
    svCents: 50000,
    taxCents: 20000,
    netCents: 330000,
    lines: [],
    wage: {
      lineCheck: 'ok',
      split: { svCurrentCents: 0, svSpecialCents: 50000, taxCurrentCents: 0, taxOtherCents: 20000 },
      lines: [combined.wage!.lines[1]!],
    },
  };
  expect(payrollSource(special, rules).netSplitUnknown).toBe(false);
  expect(payrollReport([special], '2026-11').salaries[12]?.netCents).toBe(330000);
  const report = payrollReport([combined, special], '2026-11');
  expect(report.timeline[0]?.composition.specialSlipIds).toEqual([special.id]);
});
it('does not call a sole mapped special or variable component regular net', () => {
  for (const component of ['special', 'variable'] as const) {
    const source = payrollSource(
      {
        ...combined,
        wage: {
          ...combined.wage!,
          lines: [{ ...combined.wage!.lines[0]!, amountCents: 800000 }, combined.wage!.lines[2]!],
        },
      },
      [{ employerContactId: null, wageCode: '100', labelNorm: null, component }],
    );
    expect(source.netSplitUnknown).toBe(true);
  }
});

it('detects a one-cent expense payout mismatch even when the salary part is correct', () => {
  expect(
    payrollPayoutDifference(
      { netCents: 289500, salaryNetCents: 279500 },
      {
        payoutCents: 289499,
        salaryCents: 279500,
        completePayout: true,
        hasRefundParts: true,
      },
    ),
  ).toBe(-1);
});
