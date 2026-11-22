import { cents } from '../money';
import { householdIncomeCents, type OverviewSplit } from '../overview';
import { monthHouseholdIncome, type TableMeta, type TableMonth, type TableRow } from './tables';
import { roundDivCents } from '../wealth/int';

export type IncomeExpenseMonth = Pick<TableMonth, 'month' | 'income' | 'spending'>;

export const monthTotalSpending = (m: IncomeExpenseMonth) =>
  cents(Object.values(m.spending).reduce((a, v) => a + v, 0));
export const incomeExpenseNet = (m: IncomeExpenseMonth, meta: TableMeta) =>
  cents(monthHouseholdIncome(m, meta) - monthTotalSpending(m));

export function incomeExpenseRows(
  months: ReadonlyArray<IncomeExpenseMonth>,
  meta: TableMeta,
  expanded: ReadonlySet<string>,
): TableRow[] {
  const vals = (f: (m: IncomeExpenseMonth) => number) => months.map(f);
  const row = (
    key: string,
    label: string,
    kind: TableRow['kind'],
    level: TableRow['level'],
    values: number[],
  ): TableRow => ({ key, label, kind, level, good: null, vals: values });
  const rows: TableRow[] = [
    row(
      'inc',
      'Einnahmen · Haushalt',
      'sum',
      0,
      vals((m) => monthHouseholdIncome(m, meta)),
    ),
  ];
  for (const t of meta.incomeTypes) {
    const values = vals((m) => m.income[t.id] ?? 0);
    if (values.some((v) => v !== 0))
      rows.push(
        row(
          `inc:${t.id}`,
          t.role === 'unclassified'
            ? t.name
            : t.role === 'income'
              ? t.name
              : `${t.name}${t.role === 'refund' ? ' ohne Kategorie' : ''} · außerhalb Haushaltseinnahmen`,
          t.role === 'income' ? 'income' : 'memo',
          1,
          values,
        ),
      );
  }
  rows.push(row('exp', 'Ausgaben', 'sum', 0, vals(monthTotalSpending)));
  for (const id of new Set(meta.categories.map((c) => c.groupId))) {
    const cats = meta.categories.filter((c) => c.groupId === id);
    const values = vals((m) => cats.reduce((a, c) => cents(a + (m.spending[c.id] ?? 0)), 0));
    if (!values.some((v) => v !== 0)) continue;
    rows.push(row(`group:${id}`, cats[0]!.groupName, 'group', 1, values));
    if (expanded.has(id))
      for (const c of cats) {
        const own = vals((m) => m.spending[c.id] ?? 0);
        if (own.some((v) => v !== 0)) rows.push(row(`cat:${c.id}`, c.name, 'category', 2, own));
      }
  }
  const unknown = vals((m) => m.spending['unclassified'] ?? 0);
  if (unknown.some((v) => v !== 0))
    rows.push(row('cat:unclassified', 'Ohne Kategorie', 'category', 1, unknown));
  rows.push({
    ...row(
      'net',
      'Cashflow (Einnahmen − Ausgaben)',
      'result',
      0,
      vals((m) => incomeExpenseNet(m, meta)),
    ),
    signed: true,
  });
  return rows;
}

/** Exact source splits behind one displayed row, including subtotal and net cells. */
export function incomeExpenseSources(
  splits: ReadonlyArray<OverviewSplit>,
  meta: TableMeta,
  key: string,
  months: ReadonlyArray<string>,
): OverviewSplit[] {
  const household = (s: OverviewSplit) =>
    s.kind === 'income' && householdIncomeCents(s.amountCents, s.incomeTypeId, s.incomeGroup) !== 0;
  return splits.filter(
    (s) =>
      months.includes(s.date.slice(0, 7)) &&
      (key === 'inc'
        ? household(s)
        : key === 'exp'
          ? s.kind === 'spend'
          : key === 'net'
            ? s.kind === 'spend' || household(s)
            : key.startsWith('inc:')
              ? s.kind === 'income' && (s.incomeTypeId ?? 'unclassified') === key.slice(4)
              : key.startsWith('cat:')
                ? s.kind === 'spend' && (s.categoryId ?? 'unclassified') === key.slice(4)
                : key.startsWith('group:')
                  ? s.kind === 'spend' &&
                    meta.categories.some((c) => c.id === s.categoryId && c.groupId === key.slice(6))
                  : false),
  );
}

/** The same cashflow through an inclusive day, using the exact splits behind the monthly net. */
export function cashflowThroughDay(
  month: IncomeExpenseMonth,
  meta: TableMeta,
  splits: ReadonlyArray<OverviewSplit>,
  day: string,
) {
  const later = incomeExpenseSources(splits, meta, 'net', [month.month]).filter(
    (split) => split.date > day,
  );
  return cents(
    later.reduce<number>(
      (net, split) => net + (split.kind === 'spend' ? split.amountCents : -split.amountCents),
      incomeExpenseNet(month, meta),
    ),
  );
}

export interface CashflowDevelopmentMonth {
  month: string;
  income: number;
  expenses: number;
  /** Existing monthly net (`incomeExpenseNet`): Haushaltseinnahmen minus all spending incl. Zukunft. */
  cashflow: number;
  /** Running sum of `cashflow` over the period; no second formula. */
  cumulative: number;
}

export interface CashflowPeriodStatement {
  total: number;
  averagePerMonth: number;
  /** Cashflow of the comparison period, or null when its months are not all in the data. */
  comparison: { kind: 'previous-year' | 'previous-period'; total: number; delta: number } | null;
}

const shiftMonth = (month: string, by: number) => {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};

/** Monthly cashflow with its cumulative line for the selected months (ascending order expected). */
export function cashflowDevelopment(
  months: ReadonlyArray<IncomeExpenseMonth>,
  meta: TableMeta,
): CashflowDevelopmentMonth[] {
  let cumulative = 0;
  return months.map((m) => {
    const cashflow = incomeExpenseNet(m, meta);
    cumulative += cashflow;
    return {
      month: m.month,
      income: monthHouseholdIncome(m, meta),
      expenses: monthTotalSpending(m),
      cashflow,
      cumulative: cents(cumulative),
    };
  });
}

/** Period total, monthly average and change against the previous year (else previous period). */
export function cashflowStatement(
  all: ReadonlyArray<IncomeExpenseMonth>,
  window: ReadonlyArray<string>,
  meta: TableMeta,
  comparisonNet: (
    month: IncomeExpenseMonth,
    meta: TableMeta,
    reference: string,
  ) => number = incomeExpenseNet,
): CashflowPeriodStatement | null {
  if (!window.length) return null;
  const byMonth = new Map(all.map((m) => [m.month, m]));
  const sum = (keys: ReadonlyArray<string>) =>
    keys.reduce((a, k) => a + incomeExpenseNet(byMonth.get(k)!, meta), 0);
  const total = sum(window.filter((k) => byMonth.has(k)));
  const comparisonFor = (kind: 'previous-year' | 'previous-period', by: number) => {
    const keys = window.map((k) => shiftMonth(k, by));
    if (!keys.every((k) => byMonth.has(k))) return null;
    const previous = keys.reduce(
      (total, key, i) => total + comparisonNet(byMonth.get(key)!, meta, window[i]!),
      0,
    );
    return { kind, total: cents(previous), delta: cents(total - previous) };
  };
  return {
    total: cents(total),
    averagePerMonth: cents(roundDivCents(total, window.length)),
    comparison:
      comparisonFor('previous-year', -12) ?? comparisonFor('previous-period', -window.length),
  };
}
