import { monthsBetween } from '../date';
import { payrollTotals } from '../reports/payroll-projects';
import { classifyWageLine } from './classify';
import { changeBp } from './math';
import {
  developmentOf,
  SALARY_COMPONENTS,
  zeroComponents,
  type ComponentCents,
  type SalaryComponent,
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
/** A line paid in a later month for an earlier reference month (back pay, Nachzahlung). */
export interface BackPayItem {
  payslipId: string;
  referenceMonth: string;
  component: SalaryComponent;
  amountCents: number;
}
export interface SalaryMonth {
  month: string;
  /**
   * No regular payslip for this month: a gap for every comparison, never filled or extrapolated.
   * Special payslips of such a month are still reported in its components.
   */
  isGap: boolean;
  payslipIds: string[];
  /**
   * Components attributed to this month: back pay counts for its reference month. Used by every
   * comparison, step and index.
   */
  components: ComponentCents;
  /** Components as paid in this month (back pay included where it was paid). */
  paidComponents: ComponentCents;
  /** Back pay paid in this month for earlier months (shown as "Nachzahlung"). */
  backPay: BackPayItem[];
  /** Base + special + variable of `components` (benefits in kind, reimbursements outside). */
  developmentCents: number;
  hasSpecial: boolean;
  hasVariable: boolean;
  /** Some compensation is not assigned to a component: excluded from every comparison. */
  hasUnmapped: boolean;
  unmapped: UnmappedItem[];
  /**
   * Base below both adjacent months, each of them comparable (one on each side): an entry or
   * unpaid days, never a cut. With fewer than two such neighbours the level counts as real.
   */
  partialBase: boolean;
  /** Legacy totals of the month's payslips (`payrollTotals`), as paid. */
  grossCents: number;
  salaryNetCents: number;
  /** A regular payslip exists and everything is mapped. */
  comparable: boolean;
}

const addInto = (target: ComponentCents, source: ComponentCents, sign = 1) => {
  for (const key of SALARY_COMPONENTS) target[key] += sign * source[key];
};

/** Components (as paid), back pay and unassigned compensation of one payslip. */
export function payslipComponents(
  slip: SalaryPayslip,
  rules: readonly WageComponentRule[],
): { components: ComponentCents; unmapped: UnmappedItem[]; backPay: BackPayItem[] } {
  const components = zeroComponents(),
    unmapped: UnmappedItem[] = [],
    backPay: BackPayItem[] = [];
  const special =
    slip.kind === 'special' && (slip.specialType === 'salary13' || slip.specialType === 'salary14');
  if (!slip.wage) {
    // Legacy payslip without wage lines: only an explicit 13th/14th salary payslip is known.
    components.reimbursement = slip.lines
      .filter((l) => l.section === 'reimbursement')
      .reduce((n, l) => n + l.amountCents, 0);
    if (special) components.special = slip.grossCents;
    else
      unmapped.push({
        payslipId: slip.id,
        code: null,
        label: null,
        amountCents: slip.grossCents,
        reason: 'no_wage_lines',
      });
    return { components, unmapped, backPay };
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
    if (component === 'unmapped') {
      unmapped.push({
        payslipId: slip.id,
        code: line.code,
        label: line.label,
        amountCents: line.amountCents,
        reason: 'unmapped',
      });
      continue;
    }
    components[component] += line.amountCents;
    if (line.referenceMonth && line.referenceMonth < slip.month)
      backPay.push({
        payslipId: slip.id,
        referenceMonth: line.referenceMonth,
        component,
        amountCents: line.amountCents,
      });
  }
  return { components, unmapped, backPay };
}

/**
 * Monthly series per component from the first to the last month (or the given range), including
 * reference months of back pay. Payslips count in their billing month; back pay is attributed to
 * its reference month in `components` and kept where it was paid in `paidComponents`.
 */
export function salaryMonthlySeries(input: {
  payslips: readonly SalaryPayslip[];
  rules: readonly WageComponentRule[];
  from?: string;
  to?: string;
}): SalaryMonth[] {
  const slips = [...input.payslips].sort((a, b) => a.month.localeCompare(b.month));
  const read = new Map(slips.map((s) => [s.id, payslipComponents(s, input.rules)]));
  const referenced = [...read.values()].flatMap((r) => r.backPay.map((b) => b.referenceMonth));
  const from = input.from ?? [slips[0]?.month, ...referenced].filter(Boolean).sort()[0];
  const to = input.to ?? slips.at(-1)?.month;
  if (!from || !to || from > to) return [];
  const months: SalaryMonth[] = monthsBetween(from, to).map((month) => {
    const own = slips.filter((s) => s.month === month);
    const paid = zeroComponents(),
      unmapped: UnmappedItem[] = [],
      backPay: BackPayItem[] = [];
    for (const slip of own) {
      const r = read.get(slip.id)!;
      addInto(paid, r.components);
      unmapped.push(...r.unmapped);
      backPay.push(...r.backPay);
    }
    const totals = payrollTotals(own);
    const isGap = !own.some((s) => s.kind === 'regular');
    return {
      month,
      isGap,
      payslipIds: own.map((s) => s.id),
      components: { ...paid },
      paidComponents: paid,
      backPay,
      developmentCents: 0,
      hasSpecial: false,
      hasVariable: false,
      hasUnmapped: unmapped.length > 0,
      unmapped,
      partialBase: false,
      grossCents: totals.grossCents,
      salaryNetCents: totals.salaryNetCents,
      comparable: !isGap && unmapped.length === 0,
    };
  });
  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const m of months)
    for (const item of m.backPay) {
      m.components[item.component] -= item.amountCents;
      const target = byMonth.get(item.referenceMonth);
      // A reference month before the requested range keeps the amount where it was paid.
      if (target) target.components[item.component] += item.amountCents;
      else m.components[item.component] += item.amountCents;
    }
  for (const m of months) {
    m.developmentCents = developmentOf(m.components);
    m.hasSpecial = m.components.special !== 0;
    m.hasVariable = m.components.variable !== 0;
  }
  months.forEach((m, i) => {
    const before = months[i - 1],
      after = months[i + 1];
    m.partialBase =
      m.comparable &&
      m.components.base > 0 &&
      before?.comparable === true &&
      after?.comparable === true &&
      m.components.base < before.components.base &&
      m.components.base < after.components.base;
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
