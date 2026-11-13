/**
 * Salary series (#1066), cash basis: every amount counts in the month it was paid in, for every
 * sum (year, year to date, same month of the previous year); money is never moved between months
 * and the series never extends to reference months. Back pay (a reference month other than the
 * payment month) is a "Nachzahlung" sub-component of its mapped component: part of the paid sums,
 * left out of the monthly base level that drives steps, partial months and the real index.
 */
import { addMonths, monthsBetween } from '../date';
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
/**
 * A line printed with a reference month other than its payment month (back pay, Nachzahlung).
 * It stays in its payment month for every sum; it is only left out of the base salary level.
 */
export interface BackPayItem {
  payslipId: string;
  code: string | null;
  referenceMonth: string;
  component: SalaryComponent;
  amountCents: number;
}
/**
 * One payment month. Cash basis: every amount stays in the month it was paid in, for all sums
 * (year, year to date, same month); money is never moved between months and the series never
 * extends to reference months. Back pay is a sub-component of its mapped component
 * (`backPayCents`, shown as "Nachzahlung"): included in `components`, excluded from
 * `baseLevelCents`, the monthly base level used for steps, partial months and real development.
 */
export interface SalaryMonth {
  month: string;
  /** No regular payslip for this month: a gap for every comparison, never filled or extrapolated. */
  isGap: boolean;
  payslipIds: string[];
  /** Components as paid in this month, back pay included. */
  components: ComponentCents;
  /** The back-pay part of each component (included in `components`). */
  backPayCents: ComponentCents;
  backPay: BackPayItem[];
  /** Base without back pay: the monthly base salary level. */
  baseLevelCents: number;
  /** Codes of the month's base lines that are not back pay. */
  baseCodes: string[];
  /** Base + special + variable as paid (benefits in kind and reimbursements outside). */
  developmentCents: number;
  hasSpecial: boolean;
  hasVariable: boolean;
  hasBackPay: boolean;
  /** Some compensation is not assigned to a component: excluded from every comparison. */
  hasUnmapped: boolean;
  unmapped: UnmappedItem[];
  /**
   * Base level below both adjacent months, each of them comparable (one on each side): an entry
   * or unpaid days, never a cut. With fewer than two such neighbours the level counts as real.
   */
  partialBase: boolean;
  /**
   * The month's base level rests on this single month at the start or end of the series or
   * directly beside a gap/unmapped month: amounts cannot tell it from a real change.
   */
  edgeLevel: boolean;
  /** Legacy totals of the month's payslips (`payrollTotals`), as paid. */
  grossCents: number;
  salaryNetCents: number;
  /** A regular payslip exists and everything is mapped. */
  comparable: boolean;
}

const addInto = (target: ComponentCents, source: ComponentCents) => {
  for (const key of SALARY_COMPONENTS) target[key] += source[key];
};

/** Components (as paid), back pay and unassigned compensation of one payslip. */
export function payslipComponents(
  slip: SalaryPayslip,
  rules: readonly WageComponentRule[],
): {
  components: ComponentCents;
  backPayCents: ComponentCents;
  unmapped: UnmappedItem[];
  backPay: BackPayItem[];
  baseCodes: string[];
} {
  const components = zeroComponents(),
    backPayCents = zeroComponents(),
    unmapped: UnmappedItem[] = [],
    backPay: BackPayItem[] = [],
    baseCodes: string[] = [];
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
    return { components, backPayCents, unmapped, backPay, baseCodes };
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
    if (line.referenceMonth && line.referenceMonth !== slip.month) {
      backPayCents[component] += line.amountCents;
      backPay.push({
        payslipId: slip.id,
        code: line.code,
        referenceMonth: line.referenceMonth,
        component,
        amountCents: line.amountCents,
      });
    } else if (component === 'base' && line.code && !baseCodes.includes(line.code))
      baseCodes.push(line.code);
  }
  return { components, backPayCents, unmapped, backPay, baseCodes };
}

/** Monthly series per component (cash basis) from the first to the last payslip month. */
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
      backPayCents = zeroComponents(),
      unmapped: UnmappedItem[] = [],
      backPay: BackPayItem[] = [],
      baseCodes: string[] = [];
    for (const slip of own) {
      const r = payslipComponents(slip, input.rules);
      addInto(components, r.components);
      addInto(backPayCents, r.backPayCents);
      unmapped.push(...r.unmapped);
      backPay.push(...r.backPay);
      for (const code of r.baseCodes) if (!baseCodes.includes(code)) baseCodes.push(code);
    }
    const totals = payrollTotals(own);
    const isGap = !own.some((s) => s.kind === 'regular');
    return {
      month,
      isGap,
      payslipIds: own.map((s) => s.id),
      components,
      backPayCents,
      backPay,
      baseLevelCents: components.base - backPayCents.base,
      baseCodes,
      developmentCents: developmentOf(components),
      hasSpecial: components.special !== 0,
      hasVariable: components.variable !== 0,
      hasBackPay: backPay.length > 0,
      hasUnmapped: unmapped.length > 0,
      unmapped,
      partialBase: false,
      edgeLevel: false,
      grossCents: totals.grossCents,
      salaryNetCents: totals.salaryNetCents,
      comparable: !isGap && unmapped.length === 0,
    };
  });
  months.forEach((m, i) => {
    const before = months[i - 1],
      after = months[i + 1];
    m.partialBase =
      m.comparable &&
      m.baseLevelCents > 0 &&
      before?.comparable === true &&
      after?.comparable === true &&
      m.baseLevelCents < before.baseLevelCents &&
      m.baseLevelCents < after.baseLevelCents;
  });
  for (const run of levelRuns(months)) if (run.edge) for (const m of run.months) m.edgeLevel = true;
  return months;
}

const isLevel = (m: SalaryMonth) => m.comparable && !m.partialBase && m.baseLevelCents > 0;
/**
 * Runs of calendar-consecutive level months with the same base level. A run of one month whose
 * calendar neighbour is missing (series start/end, gap, unmapped) is an `edge` run.
 */
function levelRuns(months: readonly SalaryMonth[]) {
  const runs: { months: SalaryMonth[]; edge: boolean }[] = [];
  months.forEach((m, i) => {
    if (!isLevel(m)) return;
    const previous = months[i - 1];
    const last = runs.at(-1);
    if (
      last &&
      previous &&
      last.months.at(-1) === previous &&
      previous.baseLevelCents === m.baseLevelCents
    )
      last.months.push(m);
    else runs.push({ months: [m], edge: false });
  });
  const index = new Map(months.map((m, i) => [m, i]));
  for (const run of runs) {
    if (run.months.length !== 1) continue;
    const i = index.get(run.months[0]!)!;
    run.edge = [months[i - 1], months[i + 1]].some((n) => !n || !n.comparable);
  }
  return runs;
}

export interface BaseStep {
  /** First month at the new level. */
  effectiveMonth: string;
  /** Last month at the old level. */
  previousMonth: string;
  oldCents: number;
  newCents: number;
  deltaCents: number;
  deltaBp: number;
  /**
   * `edge`: the old or new level rests on one month at the series start/end or beside a gap or
   * unmapped month. Reported, but left out of raise statistics and anchors.
   */
  uncertain: 'edge' | null;
  /**
   * Information only: the earliest reference month of back pay on a base code of the new level,
   * paid within the effective month and the three months after it.
   */
  retroactiveFrom: string | null;
}
/** Months that carry a reliable base salary level (comparable, not partial, base > 0). */
export const baseLevelMonths = (series: readonly SalaryMonth[]) => series.filter(isLevel);

/** Every change of the monthly base level between consecutive level runs. */
export function baseSalarySteps(series: readonly SalaryMonth[]): BaseStep[] {
  const runs = levelRuns(series);
  const steps: BaseStep[] = [];
  for (let i = 1; i < runs.length; i++) {
    const before = runs[i - 1]!,
      after = runs[i]!;
    const old = before.months.at(-1)!,
      next = after.months[0]!;
    if (old.baseLevelCents === next.baseLevelCents) continue;
    const window = series.filter(
      (m) => m.month >= next.month && m.month <= addMonths(next.month, 3),
    );
    const retro = window
      .flatMap((m) => m.backPay)
      .filter(
        (b) =>
          b.component === 'base' &&
          b.code !== null &&
          next.baseCodes.includes(b.code) &&
          b.referenceMonth < next.month,
      )
      .map((b) => b.referenceMonth)
      .sort()[0];
    steps.push({
      effectiveMonth: next.month,
      previousMonth: old.month,
      oldCents: old.baseLevelCents,
      newCents: next.baseLevelCents,
      deltaCents: next.baseLevelCents - old.baseLevelCents,
      deltaBp: changeBp(old.baseLevelCents, next.baseLevelCents)!,
      uncertain: before.edge || after.edge ? 'edge' : null,
      retroactiveFrom: retro ?? null,
    });
  }
  return steps;
}

/** First month of the first base level supported by at least two months (real-index anchor). */
export function baseSalaryAnchor(series: readonly SalaryMonth[]): string | null {
  return levelRuns(series).find((r) => r.months.length >= 2)?.months[0]?.month ?? null;
}
