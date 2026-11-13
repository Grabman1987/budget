import { monthsBetween } from '../date';
import { payrollTotals } from '../reports/payroll-projects';
import { classifyWageLine } from './classify';
import { changeBp } from './math';
import {
  developmentOf,
  zeroComponents,
  type ComponentCents,
  type SalaryPayslip,
  type WageComponentRule,
} from './types';

export type UnmappedReason = 'unmapped' | 'no_wage_lines' | 'line_check';
export interface UnmappedItem {
  payslipId: string;
  code: string | null;
  label: string | null;
  amountCents: number;
  reason: UnmappedReason;
}
export interface SalaryMonth {
  month: string;
  /** No payslip for this month: shown as a gap, never filled or extrapolated. */
  isGap: boolean;
  payslipIds: string[];
  components: ComponentCents;
  /** Base + special + variable (benefits in kind and reimbursements stay outside). */
  developmentCents: number;
  hasSpecial: boolean;
  hasVariable: boolean;
  /** Some compensation is not assigned to a component: excluded from every comparison. */
  hasUnmapped: boolean;
  unmapped: UnmappedItem[];
  /** Base below every adjacent comparable month (entry, unpaid days): flagged, never a cut. */
  partialBase: boolean;
  /** Legacy totals of the month's payslips (`payrollTotals`). */
  grossCents: number;
  salaryNetCents: number;
  /** Not a gap and fully mapped. */
  comparable: boolean;
}

/** Components and unassigned compensation of one payslip. */
export function payslipComponents(
  slip: SalaryPayslip,
  rules: readonly WageComponentRule[],
): { components: ComponentCents; unmapped: UnmappedItem[] } {
  const components = zeroComponents(),
    unmapped: UnmappedItem[] = [];
  const special =
    slip.kind === 'special' && (slip.specialType === 'salary13' || slip.specialType === 'salary14');
  if (!slip.wage) {
    // Legacy payslip without wage lines: only the unambiguous whole-payslip cases are known.
    components.reimbursement = slip.lines
      .filter((l) => l.section === 'reimbursement')
      .reduce((n, l) => n + l.amountCents, 0);
    if (special) components.special = slip.grossCents;
    else if (slip.documentType === 'bonus') components.variable = slip.grossCents;
    else
      unmapped.push({
        payslipId: slip.id,
        code: null,
        label: null,
        amountCents: slip.grossCents,
        reason: 'no_wage_lines',
      });
    return { components, unmapped };
  }
  if (slip.wage.lineCheck !== 'ok')
    unmapped.push({
      payslipId: slip.id,
      code: null,
      label: null,
      amountCents: slip.grossCents,
      reason: 'line_check',
    });
  for (const line of slip.wage.lines) {
    const component = classifyWageLine(line, slip, rules);
    if (component === 'none') continue;
    if (component === 'unmapped')
      unmapped.push({
        payslipId: slip.id,
        code: line.code,
        label: line.label,
        amountCents: line.amountCents,
        reason: 'unmapped',
      });
    else components[component] += line.amountCents;
  }
  return { components, unmapped };
}

/**
 * Monthly series per component from the first to the last payslip month (or the given range).
 * Payslips count in their billing month; a back payment printed for an earlier reference month
 * stays in the month it was paid.
 */
export function salaryMonthlySeries(input: {
  payslips: readonly SalaryPayslip[];
  rules: readonly WageComponentRule[];
  from?: string;
  to?: string;
}): SalaryMonth[] {
  const slips = [...input.payslips].sort((a, b) => a.month.localeCompare(b.month));
  const from = input.from ?? slips[0]?.month;
  const to = input.to ?? slips.at(-1)?.month;
  if (!from || !to || from > to) return [];
  const months: SalaryMonth[] = monthsBetween(from, to).map((month) => {
    const own = slips.filter((s) => s.month === month);
    const components = zeroComponents(),
      unmapped: UnmappedItem[] = [];
    for (const slip of own) {
      const read = payslipComponents(slip, input.rules);
      for (const key of Object.keys(components) as (keyof ComponentCents)[])
        components[key] += read.components[key];
      unmapped.push(...read.unmapped);
    }
    const totals = payrollTotals(own);
    const isGap = own.length === 0;
    return {
      month,
      isGap,
      payslipIds: own.map((s) => s.id),
      components,
      developmentCents: developmentOf(components),
      hasSpecial: components.special !== 0,
      hasVariable: components.variable !== 0,
      hasUnmapped: unmapped.length > 0,
      unmapped,
      partialBase: false,
      grossCents: totals.grossCents,
      salaryNetCents: totals.salaryNetCents,
      comparable: !isGap && unmapped.length === 0,
    };
  });
  months.forEach((m, i) => {
    if (!m.comparable || m.components.base <= 0) return;
    const neighbours = [months[i - 1], months[i + 1]].filter(
      (n): n is SalaryMonth => n !== undefined && n.comparable,
    );
    m.partialBase =
      neighbours.length > 0 && neighbours.every((n) => m.components.base < n.components.base);
  });
  return months;
}

export interface BaseStep {
  effectiveMonth: string;
  /** Last comparable month before the step. */
  previousMonth: string;
  oldCents: number;
  newCents: number;
  deltaCents: number;
  deltaBp: number;
}
/** Months that carry a reliable base salary level. */
export const baseLevelMonths = (series: readonly SalaryMonth[]) =>
  series.filter((m) => m.comparable && !m.partialBase && m.components.base > 0);

/** Every change of the monthly base salary between consecutive reliable months. */
export function baseSalarySteps(series: readonly SalaryMonth[]): BaseStep[] {
  const levels = baseLevelMonths(series);
  const steps: BaseStep[] = [];
  for (let i = 1; i < levels.length; i++) {
    const before = levels[i - 1]!,
      after = levels[i]!;
    if (before.components.base === after.components.base) continue;
    steps.push({
      effectiveMonth: after.month,
      previousMonth: before.month,
      oldCents: before.components.base,
      newCents: after.components.base,
      deltaCents: after.components.base - before.components.base,
      deltaBp: changeBp(before.components.base, after.components.base)!,
    });
  }
  return steps;
}
