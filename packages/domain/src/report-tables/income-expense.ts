import { cents } from '../money';
import type { OverviewData, OverviewSplit } from '../overview';
import { monthHouseholdIncome, type TableMeta, type TableMonth, type TableRow } from './tables';

/** Shared household/refund/capital classification has already been applied by the ledger read. */
export function incomeExpenseMonths(
  data: OverviewData,
  months: ReadonlyArray<string>,
): TableMonth[] {
  return months.map((month) => {
    const income: Record<string, number> = {};
    const spending: Record<string, number> = {};
    for (const s of data.splits.filter((s) => s.date.startsWith(month))) {
      const map = s.kind === 'income' ? income : spending;
      const id = (s.kind === 'income' ? s.incomeTypeId : s.categoryId) ?? 'unclassified';
      map[id] = cents((map[id] ?? 0) + s.amountCents);
    }
    return { month, income, spending, assigned: {}, netWorthCents: null, moneyAgeDays: null };
  });
}

export function incomeExpenseRows(
  months: ReadonlyArray<TableMonth>,
  meta: TableMeta,
  expanded: ReadonlySet<string>,
): TableRow[] {
  const vals = (f: (m: TableMonth) => number) => months.map(f);
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
          t.role === 'income'
            ? t.name
            : `${t.name}${t.role === 'refund' ? ' ohne Kategorie' : ''} · außerhalb Haushaltseinnahmen`,
          t.role === 'income' ? 'income' : 'memo',
          1,
          values,
        ),
      );
  }
  const totalSpend = (m: TableMonth) => cents(Object.values(m.spending).reduce((a, v) => a + v, 0));
  rows.push(row('exp', 'Ausgaben', 'sum', 0, vals(totalSpend)));
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
      'Netto (Einnahmen − Ausgaben)',
      'result',
      0,
      vals((m) => cents(monthHouseholdIncome(m, meta) - totalSpend(m))),
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
  const household = (s: OverviewSplit) => s.kind === 'income' && s.incomeGroup === 'household';
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
