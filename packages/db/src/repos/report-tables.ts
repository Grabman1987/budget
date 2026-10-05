import {
  addMonths,
  incomeExpenseMonths,
  ageOfMoney,
  defaultParams,
  lastDayOfMonth,
  monthOf,
  overviewMonthlyFigures,
  monthsBetween,
  resolveParams,
  type IncomeRole,
  type MoneyEvent,
  type SpendClass,
  type TableCategory,
  type TableIncomeType,
  type TableMonth,
} from '@budget/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  category,
  categoryGroup,
  incomeType,
  INCOME_TYPES,
  payee,
  rule,
} from '../schema';
import { overviewData } from './report-ledger';
import { netWorthDaily, earliestAccountDate } from './portfolio';
import { budget, budgetLedger } from './queries';
import { referenceMonth } from './rule-inputs';
import type { Executor } from './types';

/**
 * Read model of the monthly table reports 1.5 Jahresansicht, 1.6 Kategorieübersicht, 1.7
 * Sparquote und Geldalter and 1.8 Gesamttabelle: the ledger facts of every month from the budget
 * start to the current one, read once. It only reads; every figure derived from it comes from
 * `@budget/domain` (`report-tables`). Spending and "Plan" are the envelope activity and assignment
 * of the one budget calculation Plan and Heute use; income is the income splits of the budget
 * accounts by income type (transfers never count), so a refund booked to a category nets against
 * that category (an Erstattungen income of a payee with a default category is netted against it in the
 * month of the refund) and a contact repayment (an advance category) is no income.
 */

export interface ReportTables {
  asOf: string;
  currentMonth: string;
  /** First month with a budget account; `null` without one. */
  firstMonth: string | null;
  /** The last complete month (the current one only on its last day); `null` before any. */
  lastFullMonth: string | null;
  categories: TableCategory[];
  incomeTypes: TableIncomeType[];
  /** Every month from `firstMonth` to `currentMonth`; the current one holds the facts to date. */
  months: TableMonth[];
  /** The largest payees (by spending) per category over the last twelve full months. */
  payees: Record<string, string[]>;
  /** Goals of the rules the reports mark: Sparquote (R01 Zukunft share) and Geldalter (R03). */
  targets: { savingsRateBp: number; moneyAgeDays: number };
  /**
   * `ok`: month-end net worth is in `months`; `unavailable`: a quote or rate is missing, no figure
   * is shown; `omitted`: not requested.
   */
  netWorth: 'ok' | 'unavailable' | 'omitted';
}

const PAYEES_PER_CATEGORY = 3;

const roleOf = (id: string): IncomeRole =>
  id === INCOME_TYPES.capital.id ? 'capital' : id === INCOME_TYPES.refund.id ? 'refund' : 'income';

function ruleTargets(db: Executor): ReportTables['targets'] {
  const params = (code: 'R01' | 'R03'): Record<string, unknown> => {
    const row = db.select().from(rule).where(eq(rule.code, code)).get();
    try {
      return resolveParams(code, JSON.parse(row?.paramsJson ?? '{}')) as Record<string, unknown>;
    } catch {
      return defaultParams(code);
    }
  };
  return {
    savingsRateBp: Number(params('R01')['futureMinBp']),
    moneyAgeDays: Number(params('R03')['targetDays']),
  };
}

export function reportTables(
  db: Executor,
  options: { today: string; withNetWorth?: boolean },
): ReportTables {
  const { today } = options;
  const currentMonth = monthOf(today);
  const targets = ruleTargets(db);
  const accounts = db.select().from(account).where(isNull(account.deletedAt)).all();
  const budgetAccounts = accounts.filter((a) => a.onBudget);
  const empty: ReportTables = {
    asOf: today,
    currentMonth,
    firstMonth: null,
    lastFullMonth: null,
    categories: [],
    incomeTypes: [],
    months: [],
    payees: {},
    targets,
    netWorth: options.withNetWorth ? 'unavailable' : 'omitted',
  };
  if (budgetAccounts.length === 0) return empty;
  const firstMonth = budgetAccounts
    .map((a) => monthOf(a.openingDate))
    .reduce((a, m) => (m < a ? m : a), currentMonth);
  const monthKeys = monthsBetween(firstMonth, currentMonth);
  const ref = referenceMonth(today);
  const lastFullMonth = ref >= firstMonth ? ref : null;

  const categoryRows = db
    .select({
      id: category.id,
      name: category.name,
      class: category.class,
      kind: category.kind,
      groupId: category.groupId,
      groupName: categoryGroup.name,
    })
    .from(category)
    .innerJoin(categoryGroup, eq(categoryGroup.id, category.groupId))
    .where(and(isNull(category.deletedAt), isNull(categoryGroup.deletedAt)))
    .orderBy(
      asc(categoryGroup.sortOrder),
      asc(categoryGroup.name),
      asc(category.sortOrder),
      asc(category.name),
      asc(category.id),
    )
    .all();
  const categories: TableCategory[] = categoryRows.flatMap((c) =>
    c.class === null ? [] : [{ ...c, class: c.class as SpendClass }],
  );
  const types = db
    .select()
    .from(incomeType)
    .where(isNull(incomeType.deletedAt))
    .orderBy(asc(incomeType.sortOrder), asc(incomeType.name), asc(incomeType.id))
    .all();
  const incomeTypes: TableIncomeType[] = types.map((t) => ({
    id: t.id,
    name: t.name,
    role: roleOf(t.id),
  }));

  const classOf = new Map(categories.map((c) => [c.id, c.class]));
  // Shared ledger classification: cash date, system entries excluded, refunds netted once.
  const ledger = overviewData(db);
  const figures = overviewMonthlyFigures({
    ...ledger,
    splits: ledger.splits.filter((s) => s.date <= today),
  });
  const income = new Map<string, Record<string, number>>();
  for (const [month, f] of figures) {
    const byType: Record<string, number> = {};
    for (const [id, cents] of Object.entries(f.incomeByType)) {
      const type = id || INCOME_TYPES.other.id;
      byType[type] = (byType[type] ?? 0) + cents;
    }
    income.set(month, byType);
  }

  // Spending and assignment per month from the one budget calculation.
  const envelopes = new Map(
    budget(db, monthKeys, { asOf: today }).map((m) => [m.month, m.envelopes]),
  );

  // Geldalter at every month end (today for the running month), the rule R03 definition.
  const onBudget = new Set(budgetAccounts.map((a) => a.id));
  const ledgerSplits = budgetLedger(db).splits.filter(
    (s) => onBudget.has(s.accountId) && s.date <= today,
  );
  const betweenBudgetAccounts = (s: (typeof ledgerSplits)[number]) =>
    s.transferAccountId != null && onBudget.has(s.transferAccountId);
  const events: MoneyEvent[] = [
    ...budgetAccounts
      .filter((a) => a.openingBalanceCents > 0)
      .map((a) => ({ day: a.openingDate, cents: a.openingBalanceCents })),
    ...ledgerSplits
      .filter((s) => !betweenBudgetAccounts(s))
      .map((s) => ({ day: s.date, cents: s.amountCents })),
  ];
  // Money set aside for the future stays on the budget when it moves to a reserve account: the
  // budget calculation gives such a transfer no activity, so a categorised transfer between two
  // budget accounts counts as spending of its Zukunft category here (Bedarf and Wunsch never do).
  const setAside = new Map<string, Map<string, number>>();
  for (const s of ledgerSplits) {
    if (
      !betweenBudgetAccounts(s) ||
      s.categoryId === null ||
      classOf.get(s.categoryId) !== 'future'
    )
      continue;
    const month = monthOf(s.date);
    const row = setAside.get(month) ?? new Map<string, number>();
    row.set(s.categoryId, (row.get(s.categoryId) ?? 0) - s.amountCents);
    setAside.set(month, row);
  }
  const standDay = (month: string) => {
    const end = lastDayOfMonth(month);
    return end < today ? end : today;
  };

  // Month-end net worth in one pass; any missing quote or rate withholds all of it.
  let netWorth: ReportTables['netWorth'] = options.withNetWorth ? 'unavailable' : 'omitted';
  const netWorthAt = new Map<string, number>();
  if (options.withNetWorth) {
    const from = earliestAccountDate(db);
    if (from !== null && from <= today) {
      try {
        const days = netWorthDaily(db, from, today);
        const byDay = new Map(days.map((d) => [d.date, d.netWorthCents]));
        for (const month of monthKeys) {
          const v = byDay.get(standDay(month));
          if (v !== undefined) netWorthAt.set(month, v);
        }
        netWorth = 'ok';
      } catch {
        netWorth = 'unavailable';
      }
    }
  }

  const months: TableMonth[] = monthKeys.map((month) => {
    const env = envelopes.get(month) ?? {};
    const spending: Record<string, number> = {};
    const assigned: Record<string, number> = {};
    for (const c of categories) {
      const e = env[c.id];
      if (!e) continue;
      const cents =
        (figures.get(month)?.byCategory[c.id] ?? 0) + (setAside.get(month)?.get(c.id) ?? 0);
      if (cents !== 0) spending[c.id] = cents;
      if (e.assignedCents !== 0) assigned[c.id] = e.assignedCents;
    }
    return {
      month,
      income: income.get(month) ?? {},
      spending,
      assigned,
      netWorthCents: netWorthAt.get(month) ?? null,
      moneyAgeDays: ageOfMoney(events, standDay(month)).days,
    };
  });

  // Largest payees per category over the last twelve full months.
  const payees: Record<string, string[]> = {};
  if (lastFullMonth !== null) {
    const from = `${addMonths(lastFullMonth, -11)}-01`;
    const to = lastDayOfMonth(lastFullMonth);
    const byCategory = new Map<string, Map<string, number>>();
    const rows = db
      .select({
        day: booking.date,
        cents: bookingSplit.amountCents,
        categoryId: bookingSplit.categoryId,
        payee: payee.name,
      })
      .from(bookingSplit)
      .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
      .innerJoin(account, eq(account.id, booking.accountId))
      .innerJoin(payee, eq(payee.id, booking.payeeId))
      .where(
        and(
          isNull(booking.deletedAt),
          isNull(account.deletedAt),
          eq(account.onBudget, true),
          isNull(booking.transferId),
          isNull(bookingSplit.transferId),
        ),
      )
      .all();
    for (const r of rows) {
      if (r.categoryId === null || !classOf.has(r.categoryId) || r.day < from || r.day > to)
        continue;
      const list = byCategory.get(r.categoryId) ?? new Map<string, number>();
      list.set(r.payee, (list.get(r.payee) ?? 0) - r.cents);
      byCategory.set(r.categoryId, list);
    }
    for (const [id, list] of byCategory) {
      const top = [...list.entries()]
        .filter(([, cents]) => cents > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, PAYEES_PER_CATEGORY)
        .map(([name]) => name);
      if (top.length > 0) payees[id] = top;
    }
  }

  return {
    asOf: today,
    currentMonth,
    firstMonth,
    lastFullMonth,
    categories,
    incomeTypes,
    months,
    payees,
    targets,
    netWorth,
  };
}

/** 1.10: actual non-transfer ledger activity, never envelope allocations. */
export function incomeExpenseReport(db: Executor, today: string) {
  const tables = reportTables(db, { today });
  const ledger = overviewData(db, { excludeTransfers: true });
  const splits = ledger.splits.filter((s) => s.date <= today);
  const incomeTypes = [
    ...tables.incomeTypes,
    { id: 'unclassified', name: 'Ohne Einnahmenart', role: 'income' as const },
  ];
  return {
    ...tables,
    incomeTypes,
    months: incomeExpenseMonths(
      { ...ledger, splits },
      tables.months.map((m) => m.month),
    ),
    splits,
  };
}
