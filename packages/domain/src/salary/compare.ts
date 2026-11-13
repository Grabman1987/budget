import { addMonths } from '../date';
import { payrollTotals } from '../reports/payroll-projects';
import { changeBp, ratioBp } from './math';
import { baseLevelMonths, baseSalarySteps, payslipComponents, type SalaryMonth } from './series';
import {
  developmentOf,
  SALARY_COMPONENTS,
  zeroComponents,
  type ComponentCents,
  type SalaryPayslip,
  type WageComponentRule,
} from './types';

export interface ComponentDelta {
  deltaCents: number;
  /** Null when the earlier value is zero. */
  deltaBp: number | null;
}
export type ComponentDeltas = Record<keyof ComponentCents | 'development', ComponentDelta>;

const sumMonths = (months: readonly SalaryMonth[]) => {
  const out = zeroComponents();
  for (const m of months) for (const key of SALARY_COMPONENTS) out[key] += m.components[key];
  return out;
};
const deltas = (from: ComponentCents, to: ComponentCents): ComponentDeltas => {
  const one = (a: number, b: number) => ({ deltaCents: b - a, deltaBp: changeBp(a, b) });
  return {
    base: one(from.base, to.base),
    special: one(from.special, to.special),
    variable: one(from.variable, to.variable),
    benefit_in_kind: one(from.benefit_in_kind, to.benefit_in_kind),
    reimbursement: one(from.reimbursement, to.reimbursement),
    development: one(developmentOf(from), developmentOf(to)),
  };
};
const yearOf = (month: string) => month.slice(0, 4);

export interface SalaryYear {
  year: string;
  /** All twelve months present and fully mapped. */
  complete: boolean;
  /** Gap or unmapped months of the year (left out of the sums). */
  excludedMonths: string[];
  /** Sums over the comparable months; benefits in kind and reimbursements reported separately. */
  components: ComponentCents;
  /** Base + special + variable. */
  developmentCents: number;
  /** Change against the previous calendar year; only when both years are complete. */
  change: ComponentDeltas | null;
}

/** Calendar years of the series with sums per component and the change between complete years. */
export function salaryYears(series: readonly SalaryMonth[]): SalaryYear[] {
  const years = [...new Set(series.map((m) => yearOf(m.month)))].sort();
  const rows = years.map((year) => {
    const months = series.filter((m) => yearOf(m.month) === year);
    const included = months.filter((m) => m.comparable);
    const components = sumMonths(included);
    return {
      year,
      complete: included.length === 12,
      excludedMonths: months.filter((m) => !m.comparable).map((m) => m.month),
      components,
      developmentCents: developmentOf(components),
      change: null as ComponentDeltas | null,
    };
  });
  rows.forEach((row, i) => {
    const previous = rows[i - 1];
    if (
      previous &&
      row.complete &&
      previous.complete &&
      Number(previous.year) + 1 === Number(row.year)
    )
      row.change = deltas(previous.components, row.components);
  });
  return rows;
}

export interface YearToDate {
  year: string;
  /** Calendar months (MM) compared: like for like in both years. */
  months: string[];
  current: ComponentCents;
  previous: ComponentCents;
  change: ComponentDeltas;
}
/** Comparable, not a partial month and not resting on a single edge month. */
const likeForLike = (m: SalaryMonth) => m.comparable && !m.partialBase && !m.edgeLevel;
/**
 * Year to date like for like: the same calendar months of `year` and the year before, restricted
 * to months that are like for like in both (comparable, not partial, not an edge level). Null when
 * no such month exists. Amounts are as paid (cash basis).
 */
export function yearToDate(series: readonly SalaryMonth[], year: string): YearToDate | null {
  const prior = String(Number(year) - 1);
  const byMonth = new Map(series.map((m) => [m.month, m]));
  const current = series.filter((m) => yearOf(m.month) === year && likeForLike(m));
  const last = current.at(-1)?.month.slice(5);
  if (!last) return null;
  const pairs = current
    .map((m) => [m, byMonth.get(`${prior}-${m.month.slice(5)}`)] as const)
    .filter(
      (p): p is readonly [SalaryMonth, SalaryMonth] =>
        p[1] !== undefined && likeForLike(p[0]) && likeForLike(p[1]),
    );
  if (!pairs.length) return null;
  const now = sumMonths(pairs.map((p) => p[0])),
    before = sumMonths(pairs.map((p) => p[1]));
  return {
    year,
    months: pairs.map((p) => p[0].month.slice(5)),
    current: now,
    previous: before,
    change: deltas(before, now),
  };
}

export interface MonthComparison {
  month: string;
  previousMonth: string;
  /** Both months present and fully mapped. */
  comparable: boolean;
  current: ComponentCents | null;
  previous: ComponentCents | null;
  change: ComponentDeltas | null;
  /** Markers for months that include special payments or variable pay. */
  hasSpecial: boolean;
  hasVariable: boolean;
  previousHasSpecial: boolean;
  previousHasVariable: boolean;
}
/** Each month against the same month of the previous year (December → December, January → January). */
export function sameMonthPreviousYear(series: readonly SalaryMonth[]): MonthComparison[] {
  const byMonth = new Map(series.map((m) => [m.month, m]));
  return series.map((m) => {
    const previousMonth = addMonths(m.month, -12);
    const p = byMonth.get(previousMonth);
    const comparable = m.comparable && p?.comparable === true;
    return {
      month: m.month,
      previousMonth,
      comparable,
      current: m.isGap ? null : m.components,
      previous: p && !p.isGap ? p.components : null,
      change: comparable ? deltas(p!.components, m.components) : null,
      hasSpecial: m.hasSpecial,
      hasVariable: m.hasVariable,
      previousHasSpecial: p?.hasSpecial ?? false,
      previousHasVariable: p?.hasVariable ?? false,
    };
  });
}

export interface VariablePayYear {
  year: string;
  /** Variable pay may be incomplete when months of the year are excluded. */
  complete: boolean;
  grossCents: number;
  /** Sum of base over the year's comparable months. */
  annualBaseCents: number;
  /** Variable pay as a share of that base, in basis points; null without base. */
  shareOfBaseBp: number | null;
  /**
   * SV and wage tax on the variable pay of the comparable months, only when every such amount was
   * paid on payslips carrying nothing but variable pay; otherwise the slip does not separate
   * them: null.
   */
  attributable: { svCents: number; taxCents: number; netCents: number } | null;
}
export function variablePayByYear(
  series: readonly SalaryMonth[],
  payslips: readonly SalaryPayslip[],
  rules: readonly WageComponentRule[],
): VariablePayYear[] {
  const componentsBySlip = new Map(
    payslips.map((s) => [s.id, payslipComponents(s, rules).components]),
  );
  const comparable = new Set(series.filter((m) => m.comparable).map((m) => m.month));
  return salaryYears(series)
    .filter((y) => y.components.variable !== 0)
    .map((y) => {
      // Only payslips of the year's comparable months, the same population as the gross.
      const slips = payslips.filter(
        (s) =>
          yearOf(s.month) === y.year &&
          comparable.has(s.month) &&
          (componentsBySlip.get(s.id)?.variable ?? 0) !== 0,
      );
      const separated =
        slips.every((s) => {
          const c = componentsBySlip.get(s.id)!;
          return c.base === 0 && c.special === 0 && c.benefit_in_kind === 0;
        }) &&
        slips.reduce((n, s) => n + componentsBySlip.get(s.id)!.variable, 0) ===
          y.components.variable;
      const totals = payrollTotals(slips);
      return {
        year: y.year,
        complete: y.complete,
        grossCents: y.components.variable,
        annualBaseCents: y.components.base,
        shareOfBaseBp: ratioBp(y.components.variable, y.components.base),
        attributable:
          separated && slips.length
            ? {
                svCents: totals.svCents,
                taxCents: totals.taxCents,
                netCents: y.components.variable - totals.svCents - totals.taxCents,
              }
            : null,
      };
    });
}

export interface DeductionRateYear {
  year: string;
  grossCents: number;
  svCents: number;
  taxCents: number;
  otherCents: number;
  /** (SV + wage tax) / gross in basis points; statutory corrections included. */
  statutoryRateBp: number | null;
  /** (SV + wage tax + other deductions) / gross in basis points. */
  totalRateBp: number | null;
}
/** Deduction rate per calendar year from the legacy payslip totals. */
export function deductionRateByYear(payslips: readonly SalaryPayslip[]): DeductionRateYear[] {
  const years = [...new Set(payslips.map((p) => yearOf(p.month)))].sort();
  return years.map((year) => {
    const t = payrollTotals(payslips.filter((p) => yearOf(p.month) === year));
    return {
      year,
      grossCents: t.grossCents,
      svCents: t.svCents,
      taxCents: t.taxCents,
      otherCents: t.otherCents,
      statutoryRateBp: ratioBp(t.svCents + t.taxCents, t.grossCents),
      totalRateBp: ratioBp(t.deductionsCents, t.grossCents),
    };
  });
}

export type RaiseNetReason = 'no_step' | 'too_few_months' | 'components_differ' | 'no_increase';
export interface RaiseNetEffect {
  /** The last certain base step; null without one. */
  effectiveMonth: string | null;
  beforeMonths: string[];
  afterMonths: string[];
  /** Base level over the three months after minus the three months before. */
  deltaGrossCents: number | null;
  /** Net salary (without reimbursements) over the same months, after minus before. */
  deltaNetCents: number | null;
  /** Additional net per additional gross unit, in basis points (5 500 = 0,55 € per €). */
  netPerGrossBp: number | null;
  /** Why no figure could be derived; null when it could. */
  reason: RaiseNetReason | null;
}
/**
 * Net per additional gross unit of the last certain base step (never an `edge` step). Uses the
 * three level months before and after it without special pay, variable pay or back pay, and only
 * when their benefits in kind and reimbursements are identical: then the gross difference is the
 * base difference and the net difference belongs to it. Otherwise no figure, with a reason.
 */
export function lastRaiseNetEffect(series: readonly SalaryMonth[]): RaiseNetEffect {
  const step = baseSalarySteps(series)
    .filter((s) => s.uncertain === null)
    .at(-1);
  const none = (reason: RaiseNetReason): RaiseNetEffect => ({
    effectiveMonth: step?.effectiveMonth ?? null,
    beforeMonths: [],
    afterMonths: [],
    deltaGrossCents: null,
    deltaNetCents: null,
    netPerGrossBp: null,
    reason,
  });
  if (!step) return none('no_step');
  const plain = baseLevelMonths(series).filter(
    (m) => !m.hasSpecial && !m.hasVariable && !m.hasBackPay,
  );
  const before = plain
    .filter((m) => m.month < step.effectiveMonth && m.baseLevelCents === step.oldCents)
    .slice(-3);
  const after = plain
    .filter((m) => m.month >= step.effectiveMonth && m.baseLevelCents === step.newCents)
    .slice(0, 3);
  if (before.length < 3 || after.length < 3) return none('too_few_months');
  const months = [...before, ...after];
  const same = (read: (m: SalaryMonth) => number) =>
    months.every((m) => read(m) === read(months[0]!));
  if (!same((m) => m.components.benefit_in_kind) || !same((m) => m.components.reimbursement))
    return none('components_differ');
  const sum = (ms: SalaryMonth[], read: (m: SalaryMonth) => number) =>
    ms.reduce((n, m) => n + read(m), 0);
  const deltaGrossCents =
    sum(after, (m) => m.baseLevelCents) - sum(before, (m) => m.baseLevelCents);
  const deltaNetCents = sum(after, (m) => m.salaryNetCents) - sum(before, (m) => m.salaryNetCents);
  if (deltaGrossCents <= 0) return none('no_increase');
  return {
    effectiveMonth: step.effectiveMonth,
    beforeMonths: before.map((m) => m.month),
    afterMonths: after.map((m) => m.month),
    deltaGrossCents,
    deltaNetCents,
    netPerGrossBp: ratioBp(deltaNetCents, deltaGrossCents)!,
    reason: null,
  };
}
