import { addMonths } from '../date';
import { payrollTotals } from '../reports/payroll-projects';
import { changeBp, ratioBp } from './math';
import {
  addPaid,
  baseLevelRuns,
  baseSalarySteps,
  payslipComponents,
  zeroPaid,
  type PaidCents,
  type SalaryMonth,
} from './series';
import {
  SALARY_COMPONENTS,
  zeroComponents,
  type ComponentCents,
  type SalaryPayslip,
  type WageComponentRule,
} from './types';

/**
 * Two layers in every money result (#1066):
 * - `paid`: as-paid totals that contain every cent of every payslip of the period, per component
 *   including `unmapped` and the back-pay sub-components (cash basis: the month it was paid in);
 * - `development`: base, special and variable only, from like-for-like months only; every month
 *   left out is listed in `excluded` with its reasons and its paid amounts. Development figures
 *   never contain unmapped, benefit-in-kind or reimbursement cents.
 */
export interface ComponentDelta {
  deltaCents: number;
  /** Null when the earlier value is zero or negative. */
  deltaBp: number | null;
}
export interface DevelopmentCents {
  base: number;
  special: number;
  variable: number;
  /** base + special + variable */
  total: number;
}
export type DevelopmentDeltas = Record<keyof DevelopmentCents, ComponentDelta>;
export type ExcludedReason =
  | 'gap'
  | 'unmapped'
  | 'line_check'
  | 'gross_unknown'
  | 'no_wage_lines'
  | 'partial'
  | 'edge'
  | 'no_counterpart';
export interface ExcludedMonth {
  month: string;
  reasons: ExcludedReason[];
  /** The month's paid amounts, so excluded money stays visible. */
  cents: PaidCents;
}

const developmentOfMonths = (months: readonly SalaryMonth[]): DevelopmentCents => {
  const out = { base: 0, special: 0, variable: 0, total: 0 };
  for (const m of months) {
    out.base += m.components.base;
    out.special += m.components.special;
    out.variable += m.components.variable;
  }
  out.total = out.base + out.special + out.variable;
  return out;
};
const paidOf = (months: readonly SalaryMonth[]) =>
  months.reduce((sum, m) => addPaid(sum, m.paid), zeroPaid());
const backPayOf = (months: readonly SalaryMonth[]) => {
  const out = zeroComponents();
  for (const m of months) for (const key of SALARY_COMPONENTS) out[key] += m.backPayCents[key];
  return out;
};
const developmentDeltas = (from: DevelopmentCents, to: DevelopmentCents): DevelopmentDeltas => {
  const one = (a: number, b: number) => ({ deltaCents: b - a, deltaBp: changeBp(a, b) });
  return {
    base: one(from.base, to.base),
    special: one(from.special, to.special),
    variable: one(from.variable, to.variable),
    total: one(from.total, to.total),
  };
};
const yearOf = (month: string) => month.slice(0, 4);
/** Why a month is not comparable (empty when it is). */
const baseReasons = (m: SalaryMonth): ExcludedReason[] => [
  ...(m.isGap ? (['gap'] as const) : []),
  ...m.issues,
];
/** Like for like: comparable, not partial, not an edge level. */
const likeReasons = (m: SalaryMonth): ExcludedReason[] => [
  ...baseReasons(m),
  ...(m.partialBase ? (['partial'] as const) : []),
  ...(m.edgeLevel ? (['edge'] as const) : []),
];
const excludedOf = (m: SalaryMonth, reasons: ExcludedReason[]): ExcludedMonth => ({
  month: m.month,
  reasons,
  cents: { ...m.paid },
});

export interface SalaryYear {
  year: string;
  /** Every cent paid in the year's months of the series. */
  paid: PaidCents;
  /** Back-pay part of `paid` per component ("Nachzahlung"). */
  paidBackPay: ComponentCents;
  development: {
    /** All twelve months of the year are in the series and comparable. */
    complete: boolean;
    /** Sums over the comparable months (partial months included: they are real pay). */
    cents: DevelopmentCents;
    excluded: ExcludedMonth[];
    /** Change against the previous calendar year; only when both years are complete. */
    change: DevelopmentDeltas | null;
  };
}

/** Calendar years: paid totals and the development of complete years. */
export function salaryYears(series: readonly SalaryMonth[]): SalaryYear[] {
  const years = [...new Set(series.map((m) => yearOf(m.month)))].sort();
  const rows = years.map((year) => {
    const months = series.filter((m) => yearOf(m.month) === year);
    const included = months.filter((m) => m.comparable);
    return {
      year,
      paid: paidOf(months),
      paidBackPay: backPayOf(months),
      development: {
        complete: included.length === 12,
        cents: developmentOfMonths(included),
        excluded: months.filter((m) => !m.comparable).map((m) => excludedOf(m, baseReasons(m))),
        change: null as DevelopmentDeltas | null,
      },
    };
  });
  rows.forEach((row, i) => {
    const previous = rows[i - 1];
    if (
      previous &&
      row.development.complete &&
      previous.development.complete &&
      Number(previous.year) + 1 === Number(row.year)
    )
      row.development.change = developmentDeltas(previous.development.cents, row.development.cents);
  });
  return rows;
}

export interface YearToDate {
  year: string;
  /** Calendar months (MM) of `year` in the series, up to its last one. */
  months: string[];
  /** Every cent of those months, in `year` and in the same months a year before. */
  paid: { current: PaidCents; previous: PaidCents };
  development: {
    /** Calendar months (MM) like for like in both years. */
    months: string[];
    current: DevelopmentCents;
    previous: DevelopmentCents;
    /** Null without a like-for-like month. */
    change: DevelopmentDeltas | null;
    excluded: ExcludedMonth[];
  };
}
/**
 * Year to date: paid totals of the year's months and the same months a year before; development
 * like for like only on months that are comparable, not partial and not an edge level in both
 * years. Null when the year has no month in the series.
 */
export function yearToDate(series: readonly SalaryMonth[], year: string): YearToDate | null {
  const prior = String(Number(year) - 1);
  const byMonth = new Map(series.map((m) => [m.month, m]));
  const current = series.filter((m) => yearOf(m.month) === year);
  if (!current.length) return null;
  const previous = current
    .map((m) => byMonth.get(`${prior}-${m.month.slice(5)}`))
    .filter((m): m is SalaryMonth => m !== undefined);
  const pairs: [SalaryMonth, SalaryMonth][] = [];
  const excluded: ExcludedMonth[] = [];
  for (const m of current) {
    const p = byMonth.get(`${prior}-${m.month.slice(5)}`);
    const own = likeReasons(m),
      other = p ? likeReasons(p) : (['gap'] as ExcludedReason[]);
    if (!own.length && !other.length) {
      pairs.push([m, p!]);
      continue;
    }
    excluded.push(excludedOf(m, own.length ? own : ['no_counterpart']));
    if (p) excluded.push(excludedOf(p, other.length ? other : ['no_counterpart']));
  }
  const now = developmentOfMonths(pairs.map((p) => p[0])),
    before = developmentOfMonths(pairs.map((p) => p[1]));
  return {
    year,
    months: current.map((m) => m.month.slice(5)),
    paid: { current: paidOf(current), previous: paidOf(previous) },
    development: {
      months: pairs.map((p) => p[0].month.slice(5)),
      current: now,
      previous: before,
      change: pairs.length ? developmentDeltas(before, now) : null,
      excluded,
    },
  };
}

export interface MonthComparison {
  month: string;
  previousMonth: string;
  /** Both months like for like (comparable, not partial, not an edge level). */
  comparable: boolean;
  paid: { current: PaidCents; previous: PaidCents | null };
  /** Development change; null unless `comparable`. */
  change: DevelopmentDeltas | null;
  /** Reasons that keep either month out (empty when comparable). */
  reasons: { current: ExcludedReason[]; previous: ExcludedReason[] };
  hasSpecial: boolean;
  hasVariable: boolean;
  hasBackPay: boolean;
  previousHasSpecial: boolean;
  previousHasVariable: boolean;
  previousHasBackPay: boolean;
}
/** Each month against the same month of the previous year (December → December, January → January). */
export function sameMonthPreviousYear(series: readonly SalaryMonth[]): MonthComparison[] {
  const byMonth = new Map(series.map((m) => [m.month, m]));
  return series.map((m) => {
    const previousMonth = addMonths(m.month, -12);
    const p = byMonth.get(previousMonth);
    const reasons = {
      current: likeReasons(m),
      previous: p ? likeReasons(p) : (['gap'] as ExcludedReason[]),
    };
    const comparable = !reasons.current.length && !reasons.previous.length;
    return {
      month: m.month,
      previousMonth,
      comparable,
      paid: { current: { ...m.paid }, previous: p ? { ...p.paid } : null },
      change: comparable
        ? developmentDeltas(developmentOfMonths([p!]), developmentOfMonths([m]))
        : null,
      reasons,
      hasSpecial: m.hasSpecial,
      hasVariable: m.hasVariable,
      hasBackPay: m.hasBackPay,
      previousHasSpecial: p?.hasSpecial ?? false,
      previousHasVariable: p?.hasVariable ?? false,
      previousHasBackPay: p?.hasBackPay ?? false,
    };
  });
}

export interface VariablePayYear {
  year: string;
  /** Variable pay paid in the year, every month included. */
  paidVariableCents: number;
  /** Development: all twelve months comparable. */
  complete: boolean;
  /** Variable pay of the comparable months. */
  grossCents: number;
  /** Base of the comparable months. */
  annualBaseCents: number;
  /** Variable pay as a share of that base, in basis points; null without base. */
  shareOfBaseBp: number | null;
  /**
   * SV and wage tax on the variable pay of the comparable months, only when every such amount was
   * paid on payslips carrying nothing but variable pay; otherwise the slip does not separate
   * them: null.
   */
  attributable: { svCents: number; taxCents: number; netCents: number } | null;
  excluded: ExcludedMonth[];
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
    .filter((y) => y.paid.variable !== 0)
    .map((y) => {
      const d = y.development;
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
        slips.reduce((n, s) => n + componentsBySlip.get(s.id)!.variable, 0) === d.cents.variable;
      const totals = payrollTotals(slips);
      return {
        year: y.year,
        paidVariableCents: y.paid.variable,
        complete: d.complete,
        grossCents: d.cents.variable,
        annualBaseCents: d.cents.base,
        shareOfBaseBp: ratioBp(d.cents.variable, d.cents.base),
        attributable:
          separated && slips.length
            ? {
                svCents: totals.svCents,
                taxCents: totals.taxCents,
                netCents: d.cents.variable - totals.svCents - totals.taxCents,
              }
            : null,
        excluded: d.excluded,
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
 * three level months of the adjacent runs before and after it without special pay, variable pay or back pay, and only
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
  // Only the two runs adjacent to the step: the old level up to it, the new level from it.
  const runs = baseLevelRuns(series);
  const plain = (m: SalaryMonth) => !m.hasSpecial && !m.hasVariable && !m.hasBackPay;
  const oldRun = runs.find((r) => r.months.at(-1)?.month === step.previousMonth)?.months ?? [];
  const newRun = runs.find((r) => r.months[0]?.month === step.effectiveMonth)?.months ?? [];
  const before = oldRun.filter(plain).slice(-3);
  const after = newRun.filter(plain).slice(0, 3);
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
