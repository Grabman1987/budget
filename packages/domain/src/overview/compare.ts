import { addMonths, monthsBetween } from '../date';
import {
  overviewSavingsRate,
  sumOverviewMonths,
  type OverviewCategory,
  type OverviewClass,
  type OverviewMonthFigures,
} from './figures';

/**
 * Zeitraumvergleich (report 5.5): one period against an earlier one, month by month. Every month
 * of the current period is paired with the month `shift` months before it (1 for "gegen
 * Vormonat", 12 otherwise); a pair counts only when both months lie inside the ledger, so a
 * period is never compared with a stretch that has no data. Spending is Konsum (Bedarf and
 * Wunsch), Zukunft is left out.
 */

export const COMPARE_MODES = [
  { id: 'vm', label: 'Monat gegen Vormonat' },
  { id: 'vj', label: 'Monat gegen Vorjahresmonat' },
  { id: 'ytd', label: 'Jahr bis heute gegen Vorjahr' },
  { id: 'r12', label: '12 Monate gegen die 12 davor' },
] as const;
export type CompareMode = (typeof COMPARE_MODES)[number]['id'];

export const isCompareMode = (value: unknown): value is CompareMode =>
  COMPARE_MODES.some((m) => m.id === value);

export interface PeriodTotals {
  incomeCents: number;
  capitalCents: number;
  consumptionCents: number;
  /** Basis points; `null` without household income. */
  savingsRateBp: number | null;
}

export interface CompareRow {
  categoryId: string;
  name: string;
  class: OverviewClass;
  currentCents: number;
  previousCents: number;
  deltaCents: number;
}

export interface PeriodComparison {
  mode: CompareMode;
  /** Last full month. */
  ref: string;
  /** The months compared, aligned: `current[i]` against `previous[i]`. */
  current: string[];
  previous: string[];
  /** How many months the mode asks for; fewer pairs mean part of the period is outside the ledger. */
  requestedMonths: number;
  currentTotals: PeriodTotals;
  previousTotals: PeriodTotals;
  /** Consumption categories with a value in either period, largest change first. */
  rows: CompareRow[];
  /** Konsum vorher + mehr − weniger = Konsum jetzt. */
  chain: { previousCents: number; moreCents: number; lessCents: number; currentCents: number };
}

/** The months of the current period and the shift to the comparison period. */
export function comparePlan(mode: CompareMode, ref: string): { months: string[]; shift: number } {
  switch (mode) {
    case 'vm':
      return { months: [ref], shift: 1 };
    case 'vj':
      return { months: [ref], shift: 12 };
    case 'ytd':
      return { months: monthsBetween(`${ref.slice(0, 4)}-01`, ref), shift: 12 };
    case 'r12':
      return { months: monthsBetween(addMonths(ref, -11), ref), shift: 12 };
  }
}

export function comparePeriods(input: {
  mode: CompareMode;
  ref: string;
  firstMonth: string | null;
  figures: ReadonlyMap<string, OverviewMonthFigures>;
  categories: ReadonlyArray<OverviewCategory>;
}): PeriodComparison {
  const { mode, ref, firstMonth, figures, categories } = input;
  const plan = comparePlan(mode, ref);
  const pairs = plan.months
    .map((m) => [m, addMonths(m, -plan.shift)] as const)
    .filter(([a, b]) => firstMonth !== null && b >= firstMonth && a >= firstMonth);
  const current = pairs.map(([a]) => a);
  const previous = pairs.map(([, b]) => b);
  const a = sumOverviewMonths(figures, current);
  const b = sumOverviewMonths(figures, previous);
  const totals = (f: typeof a): PeriodTotals => ({
    incomeCents: f.incomeCents,
    capitalCents: f.capitalCents,
    consumptionCents: f.consumptionCents,
    savingsRateBp: overviewSavingsRate(f),
  });
  const rows = categories
    .filter((c) => c.class !== 'future')
    .map((c): CompareRow => {
      const cur = a.byCategory[c.id] ?? 0;
      const prev = b.byCategory[c.id] ?? 0;
      return {
        categoryId: c.id,
        name: c.name,
        class: c.class,
        currentCents: cur,
        previousCents: prev,
        deltaCents: cur - prev,
      };
    })
    .filter((r) => r.currentCents !== 0 || r.previousCents !== 0)
    .sort(
      (x, y) =>
        Math.abs(y.deltaCents) - Math.abs(x.deltaCents) || x.name.localeCompare(y.name, 'de'),
    );
  return {
    mode,
    ref,
    current,
    previous,
    requestedMonths: plan.months.length,
    currentTotals: totals(a),
    previousTotals: totals(b),
    rows,
    chain: {
      previousCents: b.consumptionCents,
      moreCents: rows.filter((r) => r.deltaCents > 0).reduce((s, r) => s + r.deltaCents, 0),
      lessCents: -rows.filter((r) => r.deltaCents < 0).reduce((s, r) => s + r.deltaCents, 0),
      currentCents: a.consumptionCents,
    },
  };
}
