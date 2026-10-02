import {
  analyseSpending,
  lastDayOfMonth,
  monthOf,
  monthsBetween,
  previousWindow,
  windowMonths,
  type BudgetMonth,
  type SpendByMonth,
  type SpendCategory,
  type SpendingAnalysis,
  type SpendingPeriod,
} from '@budget/domain';
import { asc, isNull } from 'drizzle-orm';
import { account, category, categoryGroup } from '../schema';
import { referenceMonth } from './rule-inputs';
import { budget } from './queries';
import type { Executor } from './types';

/**
 * Shared source of the spending reports (group 2): the full months of the ledger and the
 * envelope activity per month and category. It is the same `budget` read model as Heute and Plan,
 * so a category sums to the same figure everywhere. Only live categories with a class count;
 * income, card-payment and advance categories have none and are never consumption.
 */

export interface ReportMonths {
  /** First month of a budget account, `null` without one. */
  first: string | null;
  /** Last full month (the month itself on its last day). */
  through: string;
  /** Ascending, from `first` to `through`; empty before the budget starts. */
  available: string[];
}

export function reportMonths(db: Executor, today: string): ReportMonths {
  const through = referenceMonth(today);
  const starts = db
    .select({ openingDate: account.openingDate, onBudget: account.onBudget })
    .from(account)
    .where(isNull(account.deletedAt))
    .all()
    .filter((a) => a.onBudget)
    .map((a) => monthOf(a.openingDate))
    .sort();
  const first = starts[0] ?? null;
  return {
    first,
    through,
    available: first !== null && first <= through ? monthsBetween(first, through) : [],
  };
}

/** The classed categories with their group, in the order of the plan. */
export function spendCategories(db: Executor): SpendCategory[] {
  const groups = new Map(
    db
      .select()
      .from(categoryGroup)
      .where(isNull(categoryGroup.deletedAt))
      .all()
      .map((g) => [g.id, g.name]),
  );
  return db
    .select()
    .from(category)
    .where(isNull(category.deletedAt))
    .orderBy(asc(category.sortOrder), asc(category.name), asc(category.id))
    .all()
    .flatMap((c) =>
      c.class
        ? [
            {
              id: c.id,
              name: c.name,
              groupName: groups.get(c.groupId) ?? 'Ohne Gruppe',
              class: c.class,
            },
          ]
        : [],
    );
}

/** The budget of `months` (consecutive), computed once for every report that needs envelopes. */
export function budgetOfMonths(db: Executor, months: string[]): BudgetMonth[] {
  return months.length ? budget(db, months) : [];
}

/** Net spending per month and category, positive cents; refunds net against the category. */
export function spendByMonth(
  budgetMonths: ReadonlyArray<BudgetMonth>,
  categories: ReadonlyArray<SpendCategory>,
): SpendByMonth {
  const out: Record<string, Record<string, number>> = {};
  for (const m of budgetMonths) {
    const row: Record<string, number> = {};
    for (const c of categories) {
      const activity = m.envelopes[c.id]?.activityCents ?? 0;
      row[c.id] = activity === 0 ? 0 : -activity;
    }
    out[m.month] = row;
  }
  return out;
}

export interface SpendingReport extends SpendingAnalysis {
  period: SpendingPeriod;
  /** First and last day of the window, `null` without any full month. */
  from: string | null;
  to: string | null;
  previousFrom: string | null;
  previousTo: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  availableMonths: number;
}

const firstDay = (month: string) => `${month}-01`;
const lastDay = lastDayOfMonth;

/** Ausgabenanalyse (2.1): net consumption per category for the selected period. */
export function spendingReport(
  db: Executor,
  today: string,
  period: SpendingPeriod,
): SpendingReport {
  const { available } = reportMonths(db, today);
  const months = windowMonths(period, available);
  const previousMonths = previousWindow(months, available);
  const categories = spendCategories(db);
  const spend = spendByMonth(budgetOfMonths(db, available), categories);
  const analysis = analyseSpending({ categories, spend, months, previousMonths, available });
  const lastOf = (list: string[] | null) =>
    list && list.length ? (list[list.length - 1] as string) : null;
  const firstOf = (list: string[] | null) => (list && list.length ? (list[0] as string) : null);
  return {
    ...analysis,
    period,
    from: firstOf(months) ? firstDay(firstOf(months) as string) : null,
    to: lastOf(months) ? lastDay(lastOf(months) as string) : null,
    previousFrom: firstOf(previousMonths) ? firstDay(firstOf(previousMonths) as string) : null,
    previousTo: lastOf(previousMonths) ? lastDay(lastOf(previousMonths) as string) : null,
    availableFrom: firstOf(available) ? firstDay(firstOf(available) as string) : null,
    availableTo: lastOf(available) ? lastDay(lastOf(available) as string) : null,
    availableMonths: available.length,
  };
}
