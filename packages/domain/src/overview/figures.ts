import { addMonths, monthOf, monthsBetween } from '../date';
import { ratioBp } from '../kpi/ratios';

/**
 * OverviewFigures of the Überblick reports (5.1 Jahresreport, 5.3 Explorer, 5.5 Zeitraumvergleich): the
 * live ledger's income and spending splits, folded per month. One definition for all three:
 *
 * - Einkommen (household income) = positive income splits on budget accounts, without
 *   Kapitalerträge and without Erstattungen. Dividends and interest are shown separately
 *   (decision 02.10.2026); transfers, refunds and repayments of contacts are never income.
 * - Konsum = spending in the classes Bedarf and Wunsch, Zukunft = spending in class Zukunft.
 *   Refunds booked into a spending category reduce that category.
 * - Sparquote = (Einkommen − Konsum) / Einkommen; `null` without income.
 *
 * Money is integer cents; spending is a positive number.
 */

export type OverviewClass = 'need' | 'want' | 'future';
export type IncomeGroup = 'household' | 'capital' | 'refund' | 'unclassified';

/** One household-income definition for reports and rules: only typed household inflows count. */
export function householdIncomeCents(
  amountCents: number,
  typeId: string | null,
  group: IncomeGroup | null,
): number {
  return typeId !== null && group === 'household' ? amountCents : 0;
}

export interface OverviewCategory {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  class: OverviewClass;
}

export interface OverviewIncomeType {
  id: string;
  name: string;
  group: IncomeGroup;
  /** Sonderzahlung: counts as income, listed apart in the Jahresreport. */
  special: boolean;
}

export interface OverviewSplit {
  bookingId: string;
  /** `YYYY-MM-DD` */
  date: string;
  kind: 'income' | 'spend';
  /** Income: money in. Spend: money out (positive), a refund in the category is negative. */
  amountCents: number;
  /** Spend: the category; `null` is spending without a category (still in the Posteingang). */
  categoryId: string | null;
  /** Income only; `null` is income without a type. */
  incomeTypeId: string | null;
  incomeGroup: IncomeGroup | null;
  payeeId: string | null;
  payeeName: string | null;
}

export interface OverviewData {
  categories: ReadonlyArray<OverviewCategory>;
  incomeTypes: ReadonlyArray<OverviewIncomeType>;
  splits: ReadonlyArray<OverviewSplit>;
  /** First month with any booking on a budget account; `null` for an empty ledger. */
  firstMonth: string | null;
}

export interface OverviewFigures {
  /** Household income (see above). */
  incomeCents: number;
  /** Dividends and interest: shown apart, not in income or Sparquote. */
  capitalCents: number;
  /** Erstattungen as income type: not income. */
  refundCents: number;
  needCents: number;
  wantCents: number;
  futureCents: number;
  /** Spending without a category: in none of the classes. */
  uncategorisedCents: number;
  /** Bedarf + Wunsch. */
  consumptionCents: number;
  byCategory: Record<string, number>;
  incomeByType: Record<string, number>;
}

export interface OverviewMonthFigures extends OverviewFigures {
  month: string;
}

const empty = (): OverviewFigures => ({
  incomeCents: 0,
  capitalCents: 0,
  refundCents: 0,
  needCents: 0,
  wantCents: 0,
  futureCents: 0,
  uncategorisedCents: 0,
  consumptionCents: 0,
  byCategory: {},
  incomeByType: {},
});

function addSplit(
  f: OverviewFigures,
  split: OverviewSplit,
  classOf: ReadonlyMap<string, OverviewClass>,
) {
  if (split.kind === 'income') {
    if (split.incomeGroup === 'capital') f.capitalCents += split.amountCents;
    else if (split.incomeGroup === 'refund') f.refundCents += split.amountCents;
    else
      f.incomeCents += householdIncomeCents(
        split.amountCents,
        split.incomeTypeId,
        split.incomeGroup,
      );
    const key = split.incomeTypeId ?? '';
    f.incomeByType[key] = (f.incomeByType[key] ?? 0) + split.amountCents;
    return;
  }
  const cls = split.categoryId === null ? undefined : classOf.get(split.categoryId);
  if (split.categoryId === null || cls === undefined) {
    f.uncategorisedCents += split.amountCents;
    return;
  }
  f.byCategory[split.categoryId] = (f.byCategory[split.categoryId] ?? 0) + split.amountCents;
  if (cls === 'need') f.needCents += split.amountCents;
  else if (cls === 'want') f.wantCents += split.amountCents;
  else f.futureCents += split.amountCents;
  if (cls !== 'future') f.consumptionCents += split.amountCents;
}

/** OverviewFigures of every month that has at least one split. */
export function overviewMonthlyFigures(data: OverviewData): Map<string, OverviewMonthFigures> {
  const classOf = new Map(data.categories.map((c) => [c.id, c.class]));
  const out = new Map<string, OverviewMonthFigures>();
  for (const split of data.splits) {
    const month = monthOf(split.date);
    let figures = out.get(month);
    if (!figures) {
      figures = { month, ...empty() };
      out.set(month, figures);
    }
    addSplit(figures, split, classOf);
  }
  return out;
}

/** The sum of the figures of the given months (months without splits count as zero). */
export function sumOverviewMonths(
  byMonth: ReadonlyMap<string, OverviewMonthFigures>,
  months: string[],
): OverviewFigures {
  const total = empty();
  for (const month of months) {
    const f = byMonth.get(month);
    if (!f) continue;
    total.incomeCents += f.incomeCents;
    total.capitalCents += f.capitalCents;
    total.refundCents += f.refundCents;
    total.needCents += f.needCents;
    total.wantCents += f.wantCents;
    total.futureCents += f.futureCents;
    total.uncategorisedCents += f.uncategorisedCents;
    total.consumptionCents += f.consumptionCents;
    for (const [id, cents] of Object.entries(f.byCategory))
      total.byCategory[id] = (total.byCategory[id] ?? 0) + cents;
    for (const [id, cents] of Object.entries(f.incomeByType))
      total.incomeByType[id] = (total.incomeByType[id] ?? 0) + cents;
  }
  return total;
}

/** Sparquote in basis points of a figures block; `null` without household income. */
export const overviewSavingsRate = (f: Pick<OverviewFigures, 'incomeCents' | 'consumptionCents'>) =>
  ratioBp(f.incomeCents - f.consumptionCents, f.incomeCents);

/**
 * The last full month at a day: the month itself when the day is its last, else the one before.
 * (The same reference month the rules use.)
 */
export function overviewRefMonth(day: string): string {
  const month = monthOf(day);
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 7);
  return next !== month ? month : addMonths(month, -1);
}

/** The months of a calendar year up to the reference month and not before the first data month. */
export function overviewYearMonths(year: number, ref: string, firstMonth: string | null): string[] {
  const from = `${year}-01`;
  const to = `${year}-12`;
  return monthsBetween(from, to < ref ? to : ref).filter(
    (m) => firstMonth !== null && m >= firstMonth,
  );
}
