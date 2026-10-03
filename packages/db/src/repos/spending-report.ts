import {
  isCalendarRange,
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
import { reportTables, type ReportTables } from './report-tables';
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
              kind: c.kind,
            },
          ]
        : [],
    );
}

/** The budget of `months` (consecutive), computed once for every report that needs envelopes. */
export function budgetOfMonths(db: Executor, months: string[]): BudgetMonth[] {
  return months.length ? budget(db, months) : [];
}

/**
 * Net spending per month and category, positive cents, from the one read model of the monthly
 * table reports (1.5 to 1.8): envelope activity, money set aside for the future, and refunds
 * netted against the spending category they refund (owner decision), so a category is the same
 * figure in every report.
 */
export function tableSpendByMonth(
  tables: ReportTables,
  categories: ReadonlyArray<SpendCategory>,
): SpendByMonth {
  const out: Record<string, Record<string, number>> = {};
  for (const m of tables.months) {
    const row: Record<string, number> = {};
    for (const c of categories) row[c.id] = m.spending[c.id] ?? 0;
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
  const available = reportMonths(
    db,
    isCalendarRange(period) ? lastDayOfMonth(monthOf(today)) : today,
  ).available;
  const months = windowMonths(period, available);
  const previousMonths = previousWindow(months, available);
  const categories = spendCategories(db);
  const spend = tableSpendByMonth(reportTables(db, { today }), categories);
  const analysis = analyseSpending({ categories, spend, months, previousMonths, available });
  const lastOf = (list: string[] | null) =>
    list && list.length ? (list[list.length - 1] as string) : null;
  const firstOf = (list: string[] | null) => (list && list.length ? (list[0] as string) : null);
  return {
    ...analysis,
    period,
    from: firstOf(months) ? firstDay(firstOf(months) as string) : null,
    to: lastOf(months)
      ? lastDay(lastOf(months) as string) < today
        ? lastDay(lastOf(months) as string)
        : today
      : null,
    previousFrom: firstOf(previousMonths) ? firstDay(firstOf(previousMonths) as string) : null,
    previousTo: lastOf(previousMonths) ? lastDay(lastOf(previousMonths) as string) : null,
    availableFrom: firstOf(available) ? firstDay(firstOf(available) as string) : null,
    availableTo: lastOf(available) ? lastDay(lastOf(available) as string) : null,
    availableMonths: available.length,
  };
}
