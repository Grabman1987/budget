import { addMonths } from '../date';
import { percentShares } from '../ledger/alloc';
import {
  overviewSavingsRate,
  overviewYearMonths,
  sumOverviewMonths,
  type OverviewCategory,
  type OverviewClass,
  type OverviewData,
  type OverviewFigures,
  type OverviewMonthFigures,
} from './figures';

/**
 * Jahresreport (report 5.1): one calendar year on two sheets, from the full months of the ledger
 * only (the running month is not in it). Pure: the net worth split and the twelfth-based class
 * amounts come from the same read models as Vermögen and the rules and are passed in.
 */

export interface YearNetWorth {
  /** Close of the day before the first month (or of the first ledger day). */
  startCents: number;
  endCents: number;
  /** Own contribution: income, spending, repayments (net worth change minus the market move). */
  ownCents: number;
  /** Market move of the positions. */
  marketCents: number;
  /** One entry per included month: the value at the month's end and its split. */
  months: ReadonlyArray<{
    month: string;
    endCents: number;
    ownCents: number;
    marketCents: number;
  }>;
}

export type YearFinding =
  | { kind: 'priciestMonth'; month: string; cents: number }
  | { kind: 'incomeChange'; deltaCents: number; previousCents: number }
  | { kind: 'special'; cents: number }
  | { kind: 'capital'; cents: number }
  | { kind: 'categoryRise'; categoryId: string; name: string; deltaCents: number }
  | { kind: 'categoryDrop'; categoryId: string; name: string; deltaCents: number }
  | { kind: 'marketBest'; month: string; cents: number }
  | { kind: 'marketWorst'; month: string; cents: number };

export interface YearCategoryRow {
  categoryId: string;
  name: string;
  class: OverviewClass;
  cents: number;
  /** Same months of the year before, `null` when none of them lies in the ledger. */
  previousCents: number | null;
  /** This year's amount over exactly the months that have a counterpart (for the change). */
  comparableCents: number | null;
  /** Change against the year before in basis points; `null` without a basis. */
  changeBp: number | null;
  /** Twelve slots January to December; `null` for months not in the report. */
  byMonth: ReadonlyArray<number | null>;
}

export interface YearMonthRow {
  month: string;
  incomeCents: number;
  capitalCents: number;
  consumptionCents: number;
  futureCents: number;
  needCents: number;
  wantCents: number;
  savingsRateBp: number | null;
  netWorthCents: number | null;
}

export interface YearReport {
  year: number;
  /** Included full months, ascending. Empty when the year has no full month with data. */
  months: string[];
  /** Fewer than twelve months: the report says "bis {Monat}". */
  partial: boolean;
  totals: {
    incomeCents: number;
    capitalCents: number;
    refundCents: number;
    consumptionCents: number;
    futureCents: number;
    savingsRateBp: number | null;
  };
  netWorth: YearNetWorth | null;
  rows: YearMonthRow[];
  /** Largest consumption categories first (at most ten). */
  categories: YearCategoryRow[];
  /** Months of the year before that pair with the included months (same calendar month). */
  comparedMonths: number;
  /** Whole percent of income, adding up to 100; the rest is negative when savings were used. */
  shares: { need: number; want: number; future: number; rest: number } | null;
  findings: YearFinding[];
}

export interface ClassAmounts {
  needCents: number;
  wantCents: number;
  futureCents: number;
}

export function yearReport(input: {
  year: number;
  ref: string;
  data: Pick<OverviewData, 'firstMonth'> & { categories: ReadonlyArray<OverviewCategory> };
  figures: ReadonlyMap<string, OverviewMonthFigures>;
  netWorth: YearNetWorth | null;
  /** 50/30/20 amounts in twelfths (as the rules count them); `null` falls back to actual spending. */
  classAmounts: ClassAmounts | null;
  specialIncomeTypeIds: ReadonlySet<string>;
}): YearReport {
  const { year, ref, data, figures, netWorth } = input;
  const months = overviewYearMonths(year, ref, data.firstMonth);
  const total = sumOverviewMonths(figures, months);
  const nwByMonth = new Map((netWorth?.months ?? []).map((m) => [m.month, m]));
  const rows = months.map((month): YearMonthRow => {
    const f = figures.get(month) as OverviewMonthFigures | undefined;
    const income = f?.incomeCents ?? 0;
    const consumption = f?.consumptionCents ?? 0;
    return {
      month,
      incomeCents: income,
      capitalCents: f?.capitalCents ?? 0,
      consumptionCents: consumption,
      futureCents: f?.futureCents ?? 0,
      needCents: f?.needCents ?? 0,
      wantCents: f?.wantCents ?? 0,
      savingsRateBp: overviewSavingsRate({ incomeCents: income, consumptionCents: consumption }),
      netWorthCents: nwByMonth.get(month)?.endCents ?? null,
    };
  });

  // The same calendar months of the year before that lie in the ledger.
  const pairs = months
    .map((m) => [m, addMonths(m, -12)] as const)
    .filter(([, p]) => data.firstMonth !== null && p >= data.firstMonth);
  const comparableNow = sumOverviewMonths(
    figures,
    pairs.map(([m]) => m),
  );
  const comparablePrev = sumOverviewMonths(
    figures,
    pairs.map(([, p]) => p),
  );

  const categories = data.categories
    .filter((c) => c.class !== 'future')
    .map((c): YearCategoryRow => {
      const cents = total.byCategory[c.id] ?? 0;
      const prev = pairs.length > 0 ? (comparablePrev.byCategory[c.id] ?? 0) : null;
      const comparable = pairs.length > 0 ? (comparableNow.byCategory[c.id] ?? 0) : null;
      return {
        categoryId: c.id,
        name: c.name,
        class: c.class,
        cents,
        previousCents: prev,
        comparableCents: comparable,
        changeBp:
          prev !== null && comparable !== null && prev > 0
            ? Math.round(((comparable - prev) * 10_000) / prev)
            : null,
        byMonth: Array.from({ length: 12 }, (_, i) => {
          const month = `${year}-${String(i + 1).padStart(2, '0')}`;
          return months.includes(month) ? (figures.get(month)?.byCategory[c.id] ?? 0) : null;
        }),
      };
    })
    .filter((c) => c.cents > 0)
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, 'de'))
    .slice(0, 10);

  const findings: YearFinding[] = [];
  const priciest = rows.reduce<YearMonthRow | null>(
    (best, r) => (best === null || r.consumptionCents > best.consumptionCents ? r : best),
    null,
  );
  if (priciest && priciest.consumptionCents > 0)
    findings.push({
      kind: 'priciestMonth',
      month: priciest.month,
      cents: priciest.consumptionCents,
    });
  if (pairs.length > 0 && comparablePrev.incomeCents > 0)
    findings.push({
      kind: 'incomeChange',
      deltaCents: comparableNow.incomeCents - comparablePrev.incomeCents,
      previousCents: comparablePrev.incomeCents,
    });
  const special = [...input.specialIncomeTypeIds].reduce(
    (s, id) => s + (total.incomeByType[id] ?? 0),
    0,
  );
  if (special !== 0) findings.push({ kind: 'special', cents: special });
  if (total.capitalCents !== 0) findings.push({ kind: 'capital', cents: total.capitalCents });
  const changed = categories
    .filter((c) => c.previousCents !== null && c.comparableCents !== null)
    .map((c) => ({ c, delta: (c.comparableCents as number) - (c.previousCents as number) }));
  const rise = changed.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta)[0];
  const drop = changed.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta)[0];
  if (rise)
    findings.push({
      kind: 'categoryRise',
      categoryId: rise.c.categoryId,
      name: rise.c.name,
      deltaCents: rise.delta,
    });
  if (drop)
    findings.push({
      kind: 'categoryDrop',
      categoryId: drop.c.categoryId,
      name: drop.c.name,
      deltaCents: drop.delta,
    });
  const market = netWorth?.months ?? [];
  if (market.some((m) => m.marketCents !== 0)) {
    const best = market.reduce((a, m) => (m.marketCents > a.marketCents ? m : a));
    const worst = market.reduce((a, m) => (m.marketCents < a.marketCents ? m : a));
    findings.push({ kind: 'marketBest', month: best.month, cents: best.marketCents });
    if (worst.month !== best.month)
      findings.push({ kind: 'marketWorst', month: worst.month, cents: worst.marketCents });
  }

  const amounts: ClassAmounts = input.classAmounts ?? {
    needCents: total.needCents,
    wantCents: total.wantCents,
    futureCents: total.futureCents,
  };
  return {
    year,
    months,
    partial: months.length < 12,
    totals: {
      incomeCents: total.incomeCents,
      capitalCents: total.capitalCents,
      refundCents: total.refundCents,
      consumptionCents: total.consumptionCents,
      futureCents: total.futureCents,
      savingsRateBp: overviewSavingsRate(total),
    },
    netWorth: months.length > 0 ? netWorth : null,
    rows,
    categories,
    comparedMonths: pairs.length,
    shares:
      months.length > 0 && total.incomeCents > 0
        ? percentShares({ ...amounts, incomeCents: total.incomeCents })
        : null,
    findings,
  };
}

/** Years that can be chosen: from the first data year up to the year of the last full month. */
export function reportYears(firstMonth: string | null, ref: string): number[] {
  if (firstMonth === null) return [];
  const years: number[] = [];
  for (let y = Number(ref.slice(0, 4)); y >= Number(firstMonth.slice(0, 4)); y--) years.push(y);
  return years;
}

export type { OverviewFigures };
