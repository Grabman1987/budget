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
  /** Calendar months (MM) compared: comparable in both years, up to the last one of `year`. */
  months: string[];
  current: ComponentCents;
  previous: ComponentCents;
  change: ComponentDeltas;
}
/**
 * Year to date like for like: the same calendar months of `year` and the year before, restricted
 * to months that are comparable in both. Null when no such month exists.
 */
export function yearToDate(series: readonly SalaryMonth[], year: string): YearToDate | null {
  const prior = String(Number(year) - 1);
  const byMonth = new Map(series.map((m) => [m.month, m]));
  const current = series.filter((m) => yearOf(m.month) === year && m.comparable);
  const last = current.at(-1)?.month.slice(5);
  if (!last) return null;
  const pairs = current
    .map((m) => [m, byMonth.get(`${prior}-${m.month.slice(5)}`)] as const)
    .filter((p): p is readonly [SalaryMonth, SalaryMonth] => p[1]?.comparable === true);
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
   * SV and wage tax on the variable pay, only when every variable amount of the year was paid on
   * payslips carrying nothing but variable pay; otherwise the slip does not separate them: null.
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
  return salaryYears(series)
    .filter((y) => y.components.variable !== 0)
    .map((y) => {
      const slips = payslips.filter(
        (s) => yearOf(s.month) === y.year && (componentsBySlip.get(s.id)?.variable ?? 0) !== 0,
      );
      const separated = slips.every((s) => {
        const c = componentsBySlip.get(s.id)!;
        return c.base === 0 && c.special === 0 && c.benefit_in_kind === 0;
      });
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

export interface RaiseNetEffect {
  effectiveMonth: string;
  beforeMonths: string[];
  afterMonths: string[];
  /** Sums over the three months after minus the three months before. */
  deltaGrossCents: number;
  deltaNetCents: number;
  /** Additional net per additional gross unit, in basis points (5 500 = 0,55 € per €). */
  netPerGrossBp: number;
}
/**
 * Net per additional gross unit of the last base step: three like-for-like months before and after
 * it (comparable, no special or variable pay, no partial base, base at the old/new level). Null
 * when there is no step, too few such months, or the gross did not rise.
 */
export function lastRaiseNetEffect(series: readonly SalaryMonth[]): RaiseNetEffect | null {
  const step = baseSalarySteps(series).at(-1);
  if (!step) return null;
  const plain = baseLevelMonths(series).filter((m) => !m.hasSpecial && !m.hasVariable);
  const before = plain
    .filter((m) => m.month < step.effectiveMonth && m.components.base === step.oldCents)
    .slice(-3);
  const after = plain
    .filter((m) => m.month >= step.effectiveMonth && m.components.base === step.newCents)
    .slice(0, 3);
  if (before.length < 3 || after.length < 3) return null;
  const sum = (ms: SalaryMonth[], read: (m: SalaryMonth) => number) =>
    ms.reduce((n, m) => n + read(m), 0);
  const deltaGrossCents = sum(after, (m) => m.grossCents) - sum(before, (m) => m.grossCents);
  const deltaNetCents = sum(after, (m) => m.salaryNetCents) - sum(before, (m) => m.salaryNetCents);
  if (deltaGrossCents <= 0) return null;
  return {
    effectiveMonth: step.effectiveMonth,
    beforeMonths: before.map((m) => m.month),
    afterMonths: after.map((m) => m.month),
    deltaGrossCents,
    deltaNetCents,
    netPerGrossBp: ratioBp(deltaNetCents, deltaGrossCents)!,
  };
}
