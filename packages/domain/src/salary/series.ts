/**
 * Salary series (#1066), cash basis: every amount counts in the month it was paid in, for every
 * sum (year, year to date, same month of the previous year); money is never moved between months
 * and the series never extends to reference months. Back pay (a reference month other than the
 * payment month) is a "Nachzahlung" sub-component of its mapped component: part of the paid sums,
 * left out of the monthly base level that drives steps, partial months and the real index.
 *
 * Two layers: `paid` holds every cent of every payslip, anchored on its stored totals; the
 * development figures use comparable months only (a regular payslip with wage lines, every
 * compensation line assigned, lines reconciled with the gross). A line is special pay only by owner
 * mapping, or as the single earning line of a payslip explicitly marked 13th/14th salary (lines the
 * owner maps to a benefit in kind or a reimbursement do not count).
 */
import { addMonths, monthsBetween } from '../date';
import { payrollTotals } from '../reports/payroll-projects';
import { classifyWageLine, ownerRule } from './classify';
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

/**
 * `unmapped`: a compensation line without component (counted in `paid.unmapped`).
 * `unknown_line` / `memo_line`: lines the parser could not place or memo lines, listed with their
 * printed amount for review; they are no compensation and are not counted as such (an unknown
 * line inside the gross shows up as `paid.unreconciled`).
 */
export type UnmappedReason = 'unmapped' | 'unknown_line' | 'memo_line';
/** Why a month is not comparable apart from being a gap. */
export type MonthIssue = 'unmapped' | 'line_check' | 'gross_unknown' | 'no_wage_lines';
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
/**
 * Paid layer, anchored on each payslip's own stored totals: the buckets of a payslip always sum to
 * its gross plus its reimbursements.
 * - components: lines assigned to a component (a legacy 13th/14th payslip: its gross as special);
 * - `unmapped`: compensation lines without a component;
 * - `unreconciled`: gross − all compensation lines (may be negative; non-zero blocks the month);
 * - `undecomposed`: the gross of a payslip without wage lines (except a 13th/14th payslip).
 */
export type PaidCents = ComponentCents & {
  unmapped: number;
  unreconciled: number;
  undecomposed: number;
};
const PAID_KEYS = [...SALARY_COMPONENTS, 'unmapped', 'unreconciled', 'undecomposed'] as const;
export const zeroPaid = (): PaidCents => ({
  ...zeroComponents(),
  unmapped: 0,
  unreconciled: 0,
  undecomposed: 0,
});
export const addPaid = (target: PaidCents, source: PaidCents) => {
  for (const key of PAID_KEYS) target[key] += source[key];
  return target;
};
/** Sum of every bucket: what the payslips paid (gross plus reimbursements). */
export const paidTotal = (p: PaidCents) => PAID_KEYS.reduce((n, key) => n + p[key], 0);

export interface SalaryMonth {
  month: string;
  /** Paid layer: every cent of every payslip of the month (see `PaidCents`). */
  paid: PaidCents;
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
  /** Unmapped compensation lines and, for review, unknown and memo lines. */
  unmapped: UnmappedItem[];
  /** Everything that keeps the month out of comparisons apart from a gap. */
  issues: MonthIssue[];
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
  /** A regular payslip exists and there is no issue. */
  comparable: boolean;
}

const addInto = (target: ComponentCents, source: ComponentCents) => {
  for (const key of SALARY_COMPONENTS) target[key] += source[key];
};

/**
 * Paid buckets, back pay and issues of one payslip. Development needs wage lines: a payslip without
 * a wage reading contributes to the paid layer only and blocks its month (`no_wage_lines`) until
 * the owner's re-read fills it.
 */
export function payslipComponents(
  slip: SalaryPayslip,
  rules: readonly WageComponentRule[],
): {
  paid: PaidCents;
  components: ComponentCents;
  backPayCents: ComponentCents;
  unmapped: UnmappedItem[];
  backPay: BackPayItem[];
  baseCodes: string[];
  issues: MonthIssue[];
} {
  const paid = zeroPaid(),
    backPayCents = zeroComponents(),
    unmapped: UnmappedItem[] = [],
    backPay: BackPayItem[] = [],
    baseCodes: string[] = [],
    issues = new Set<MonthIssue>();
  const result = () => {
    const components = zeroComponents();
    for (const key of SALARY_COMPONENTS) components[key] = paid[key];
    return { paid, components, backPayCents, unmapped, backPay, baseCodes, issues: [...issues] };
  };
  if (!slip.wage) {
    paid.reimbursement = slip.lines
      .filter((l) => l.section === 'reimbursement')
      .reduce((n, l) => n + l.amountCents, 0);
    const special =
      slip.kind === 'special' &&
      (slip.specialType === 'salary13' || slip.specialType === 'salary14');
    if (special) paid.special = slip.grossCents;
    else paid.undecomposed = slip.grossCents;
    issues.add('no_wage_lines');
    return result();
  }
  // Earning lines that could be pay: lines the owner maps to a benefit in kind or a
  // reimbursement do not count, so such mappings never change the special-pay rule.
  const earningLines = slip.wage.lines.filter((l) => {
    if (l.section !== 'earning') return false;
    const owner = ownerRule(l, slip.employerContactId, rules)?.component;
    return owner !== 'benefit_in_kind' && owner !== 'reimbursement';
  }).length;
  let compensation = 0;
  for (const line of slip.wage.lines) {
    if (line.section === 'unknown' || line.section === 'memo') {
      unmapped.push({
        payslipId: slip.id,
        code: line.code,
        label: line.label,
        amountCents: line.amountCents,
        reason: line.section === 'unknown' ? 'unknown_line' : 'memo_line',
      });
      continue;
    }
    const component = classifyWageLine(line, slip, rules, {
      singleEarningLine: earningLines === 1,
    });
    if (component === 'none') continue;
    if (line.section !== 'reimbursement') compensation += line.amountCents;
    if (component === 'unmapped') {
      paid.unmapped += line.amountCents;
      issues.add('unmapped');
      unmapped.push({
        payslipId: slip.id,
        code: line.code,
        label: line.label,
        amountCents: line.amountCents,
        reason: 'unmapped',
      });
      continue;
    }
    paid[component] += line.amountCents;
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
  if (slip.wage.lineCheck === 'no_gross') issues.add('gross_unknown');
  else {
    paid.unreconciled = slip.grossCents - compensation;
    if (slip.wage.lineCheck !== 'ok' || paid.unreconciled !== 0) issues.add('line_check');
  }
  return result();
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
      paid = zeroPaid(),
      unmapped: UnmappedItem[] = [],
      backPay: BackPayItem[] = [],
      baseCodes: string[] = [],
      issues: MonthIssue[] = [];
    for (const slip of own) {
      const r = payslipComponents(slip, input.rules);
      addPaid(paid, r.paid);
      addInto(components, r.components);
      addInto(backPayCents, r.backPayCents);
      unmapped.push(...r.unmapped);
      backPay.push(...r.backPay);
      for (const code of r.baseCodes) if (!baseCodes.includes(code)) baseCodes.push(code);
      for (const issue of r.issues) if (!issues.includes(issue)) issues.push(issue);
    }
    const totals = payrollTotals(own);
    const isGap = !own.some((s) => s.kind === 'regular');
    return {
      month,
      paid,
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
      hasUnmapped: issues.includes('unmapped'),
      unmapped,
      issues,
      partialBase: false,
      edgeLevel: false,
      grossCents: totals.grossCents,
      salaryNetCents: totals.salaryNetCents,
      comparable: !isGap && issues.length === 0,
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
  for (const run of baseLevelRuns(months))
    if (run.edge) for (const m of run.months) m.edgeLevel = true;
  return months;
}

const isLevel = (m: SalaryMonth) => m.comparable && !m.partialBase && m.baseLevelCents > 0;
/**
 * Runs of calendar-consecutive level months with the same base level. A run of one month whose
 * calendar neighbour is missing (series start/end, gap, unmapped) is an `edge` run.
 */
export function baseLevelRuns(months: readonly SalaryMonth[]) {
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
  const runs = baseLevelRuns(series);
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
  return baseLevelRuns(series).find((r) => r.months.length >= 2)?.months[0]?.month ?? null;
}
