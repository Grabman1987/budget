import { describe, expect, it } from 'vitest';
import { classifyWageLabel } from './payslip-text';
import {
  payrollNetComposition,
  payrollReport,
  runningNetAverage,
  payrollTotals,
  payslipPayNetCents,
  type CapturedPayslip,
} from './payroll-projects';
import { payrollCompositionFacts } from './payroll-source';
import type { SalaryPayslip, WageComponentRule } from '../salary/types';
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

describe('combined slip marked as containing a special payment (#1321)', () => {
  // Synthetic: gross 13.970,00 = 6.985,00 running + 6.985,00 special, net 8.000,00, never split.
  const line = (code: string, label: string, amountCents: number) => ({
    code,
    label,
    section: 'earning' as const,
    referenceMonth: null,
    amountCents,
  });
  const salarySlip = (
    id: string,
    month: string,
    gross: number,
    net: number,
    lines = [line('100', 'Synthetic base', gross)],
  ): SalaryPayslip => ({
    ...slip(id, month, 'regular', {
      grossCents: gross,
      svCents: gross - net,
      taxCents: 0,
      netCents: net,
    }),
    employerContactId: 'emp',
    wage: { lineCheck: 'ok', split: null, lines },
  });
  const earlier = ['2026-03', '2026-04', '2026-05'].map((m, i) =>
    salarySlip(`e${i}`, m, 698500, 400000),
  );
  const combinedSlip = salarySlip('c', '2026-06', 1397000, 800000, [
    line('100', 'Synthetic base', 698500),
    line('200', 'Synthetic bonus', 698500),
  ]);
  const mapped: WageComponentRule[] = [
    { employerContactId: null, wageCode: '100', labelNorm: null, component: 'base' },
    { employerContactId: null, wageCode: '200', labelNorm: null, component: 'special' },
  ];

  it('mapped special line: containsSpecial, special gross, unsplit running net', () => {
    const slips = [...earlier, combinedSlip];
    const facts = payrollCompositionFacts(slips, mapped);
    const row = payrollNetComposition(slips, '2026-06', facts);
    expect(row).toMatchObject({
      runningCents: 800000,
      specialCents: 0,
      totalCents: 800000,
      containsSpecial: true,
      specialGrossCents: 698500,
      openMappingSlipIds: [],
    });
  });

  it('unmapped line: not special, open mapping task, nothing guessed', () => {
    const slips = [...earlier, combinedSlip];
    const facts = payrollCompositionFacts(slips, mapped.slice(0, 1));
    const row = payrollNetComposition(slips, '2026-06', facts);
    expect(row).toMatchObject({
      runningCents: 800000,
      containsSpecial: false,
      specialGrossCents: null,
      openMappingSlipIds: ['c'],
    });
    // Without an earlier slip there is no baseline: nothing is flagged.
    expect(payrollCompositionFacts([combinedSlip], mapped.slice(0, 1)).get('c')).toEqual({
      specialGrossCents: 0,
      complete: false,
      openMappingTask: false,
    });
  });

  it('a separate special slip counts as containing a special payment', () => {
    const s = slip('s', '2026-06', 'special', { specialType: 'salary13' });
    expect(payrollNetComposition([s], '2026-06')).toMatchObject({
      containsSpecial: true,
      specialGrossCents: 300000,
    });
    expect(payrollNetComposition([slip('r', '2026-06', 'regular')], '2026-06')).toMatchObject({
      containsSpecial: false,
      specialGrossCents: null,
    });
  });

  it('running-pay average excludes the combined month and counts the exclusion', () => {
    const slips = [...earlier, combinedSlip];
    const facts = payrollCompositionFacts(slips, mapped);
    const rows = ['2026-03', '2026-04', '2026-05', '2026-06'].map((m) =>
      payrollNetComposition(slips, m, facts),
    );
    expect(runningNetAverage(rows)).toEqual({
      averageCents: 400000,
      months: 3,
      excludedMonths: 1,
      openMappingMonths: 0,
    });
    expect(runningNetAverage([])).toEqual({
      averageCents: null,
      months: 0,
      excludedMonths: 0,
      openMappingMonths: 0,
    });
  });

  it('running-pay average also leaves out months with an open mapping task and reports them', () => {
    const slips = [...earlier, combinedSlip];
    const facts = payrollCompositionFacts(slips, mapped.slice(0, 1));
    const rows = ['2026-03', '2026-04', '2026-05', '2026-06'].map((m) =>
      payrollNetComposition(slips, m, facts),
    );
    expect(runningNetAverage(rows)).toEqual({
      averageCents: 400000,
      months: 3,
      excludedMonths: 0,
      openMappingMonths: 1,
    });
  });

  it('year and month special gross come from the same derivation', () => {
    const slips = [...earlier, combinedSlip];
    const facts = payrollCompositionFacts(slips, mapped);
    const report = payrollReport(slips, '2026-06', new Map(), facts);
    expect(report.years[0]!.specialGrossCents).toBe(698500);
    expect(report.timeline.at(-1)!.composition.specialGrossCents).toBe(698500);
    // Unmapped line: month unknown (null), year unknown (null), never a guessed amount.
    const open = payrollReport(
      slips,
      '2026-06',
      new Map(),
      payrollCompositionFacts(slips, mapped.slice(0, 1)),
    );
    expect(open.years[0]!.specialGrossCents).toBeNull();
    expect(open.timeline.at(-1)!.composition.specialGrossCents).toBeNull();
  });
});
