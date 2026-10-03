import type { Period } from '../invest/performance';
import { calendarRangeMonths, isCalendarRange } from '../report-range';
import { addMonths, monthsBetween } from '../date';
import type { OverviewClass, OverviewData } from './figures';

/**
 * Explorer (report 5.3): a pivot over the booking splits. Rows by Kategorie, Gruppe, Klasse,
 * Empfänger or Einnahmenart, columns by month, quarter, year or none, over a window of full
 * months; the measure is the sum, the average per month or the number of bookings. Same split
 * definition as the other Überblick reports (`figures.ts`): transfers, refunds booked as income
 * type and contact repayments never appear as income.
 */

export const EXPLORER_DIMS = [
  { id: 'kategorie', label: 'Kategorie' },
  { id: 'gruppe', label: 'Gruppe' },
  { id: 'klasse', label: 'Klasse' },
  { id: 'empfaenger', label: 'Empfänger' },
  { id: 'einnahme', label: 'Einnahmenart' },
] as const;
export const EXPLORER_MEASURES = [
  { id: 'summe', label: 'Summe' },
  { id: 'avg', label: 'Ø je Monat' },
  { id: 'anzahl', label: 'Anzahl Buchungen' },
] as const;
export const EXPLORER_COLS = [
  { id: 'monat', label: 'Monat' },
  { id: 'quartal', label: 'Quartal' },
  { id: 'jahr', label: 'Jahr' },
  { id: 'keine', label: 'keine' },
] as const;
export const EXPLORER_CLASSES = [
  { id: 'alle', label: 'alle' },
  { id: 'need', label: 'Bedarf' },
  { id: 'want', label: 'Wunsch' },
  { id: 'future', label: 'Zukunft' },
] as const;
export const EXPLORER_PERIODS = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'] as const;

export type ExplorerDim = (typeof EXPLORER_DIMS)[number]['id'];
export type ExplorerMeasure = (typeof EXPLORER_MEASURES)[number]['id'];
export type ExplorerCols = (typeof EXPLORER_COLS)[number]['id'];
export type ExplorerClass = (typeof EXPLORER_CLASSES)[number]['id'];
export type ExplorerPeriod = Period;

export interface ExplorerQuery {
  dim: ExplorerDim;
  cls: ExplorerClass;
  cols: ExplorerCols;
  period: ExplorerPeriod;
  meas: ExplorerMeasure;
}

/** The ready-made views (the prototype's four). */
export const EXPLORER_PRESETS: ReadonlyArray<{ name: string; query: ExplorerQuery }> = [
  {
    name: 'Wunsch je Quartal',
    query: { dim: 'kategorie', cls: 'want', cols: 'quartal', period: '3J', meas: 'summe' },
  },
  {
    name: 'Gruppen je Monat',
    query: { dim: 'gruppe', cls: 'alle', cols: 'monat', period: '1J', meas: 'summe' },
  },
  {
    name: 'Buchungen je Empfänger',
    query: { dim: 'empfaenger', cls: 'alle', cols: 'jahr', period: '3J', meas: 'anzahl' },
  },
  {
    name: 'Einnahmen je Jahr',
    query: { dim: 'einnahme', cls: 'alle', cols: 'jahr', period: 'Alles', meas: 'summe' },
  },
];

export const DEFAULT_EXPLORER_QUERY: ExplorerQuery = (
  EXPLORER_PRESETS[0] as (typeof EXPLORER_PRESETS)[number]
).query;

const has = <T extends { id: string }>(list: ReadonlyArray<T>, v: unknown): v is T['id'] =>
  list.some((x) => x.id === v);

/** A query from untrusted parts; `null` when any part is unknown. */
export function parseExplorerQuery(raw: Record<string, unknown>): ExplorerQuery | null {
  const { dim, cls, cols, period, meas } = raw;
  if (
    !has(EXPLORER_DIMS, dim) ||
    !has(EXPLORER_CLASSES, cls) ||
    !has(EXPLORER_COLS, cols) ||
    !has(EXPLORER_MEASURES, meas) ||
    !((EXPLORER_PERIODS as ReadonlyArray<unknown>).includes(period) || isCalendarRange(period))
  )
    return null;
  return { dim, cls, cols, period: period as ExplorerPeriod, meas };
}

/** The window of full months of a period, ending at the last full month, inside the ledger. */
export function explorerWindow(
  period: ExplorerPeriod,
  ref: string,
  firstMonth: string | null,
): string[] {
  if (firstMonth !== null && isCalendarRange(period))
    return calendarRangeMonths(period, firstMonth, ref);
  if (firstMonth === null || ref < firstMonth) return [];
  const from =
    period === '1M'
      ? ref
      : period === '3M'
        ? addMonths(ref, -2)
        : period === 'YTD'
          ? `${ref.slice(0, 4)}-01`
          : period === '1J'
            ? addMonths(ref, -11)
            : period === '3J'
              ? addMonths(ref, -35)
              : firstMonth;
  return monthsBetween(from < firstMonth ? firstMonth : from, ref);
}

export interface ExplorerColumn {
  key: string;
  months: string[];
}

export interface ExplorerRow {
  key: string;
  label: string;
  /** Class of a category row, for the swatch. */
  class: OverviewClass | null;
  /** One value per column; cents for sum and average, a count for the number of bookings. */
  values: number[];
  total: number;
}

export interface ExplorerResult {
  query: ExplorerQuery;
  /** The window of months the table covers. */
  months: string[];
  columns: ExplorerColumn[];
  unit: 'cents' | 'count';
  rows: ExplorerRow[];
  /** Column sums; `null` where adding is wrong (averages, counts over split bookings). */
  totals: { values: number[]; total: number } | null;
  /** Rows beyond the limit that are not listed. */
  truncated: number;
  /** Good direction for the heat: `low` for spending, `high` for income. */
  good: 'low' | 'high';
}

export const EXPLORER_ROW_LIMIT = 200;

const columnKey = (month: string, cols: ExplorerCols): string =>
  cols === 'monat'
    ? month
    : cols === 'quartal'
      ? `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`
      : cols === 'jahr'
        ? month.slice(0, 4)
        : 'all';

export function explorerPivot(
  data: OverviewData,
  query: ExplorerQuery,
  ref: string,
): ExplorerResult {
  const months = explorerWindow(query.period, ref, data.firstMonth);
  const monthSet = new Set(months);
  const columnMap = new Map<string, string[]>();
  for (const month of months) {
    const key = columnKey(month, query.cols);
    columnMap.set(key, [...(columnMap.get(key) ?? []), month]);
  }
  const columns = [...columnMap].map(([key, ms]) => ({ key, months: ms }));
  const columnIndex = new Map(columns.map((c, i) => [c.key, i]));

  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const incomeTypes = new Map(data.incomeTypes.map((t) => [t.id, t]));
  const income = query.dim === 'einnahme';
  const classOk = (cls: OverviewClass | null) =>
    query.cls === 'alle' || (cls !== null && cls === query.cls);

  interface Acc {
    label: string;
    class: OverviewClass | null;
    cents: number[];
    bookings: Set<string>[];
  }
  const rows = new Map<string, Acc>();
  for (const split of data.splits) {
    const month = split.date.slice(0, 7);
    if (!monthSet.has(month)) continue;
    if ((split.kind === 'income') !== income) continue;
    const category = split.categoryId === null ? undefined : categories.get(split.categoryId);
    const cls = category?.class ?? null;
    if (!income && !classOk(cls)) continue;
    let key: string;
    let label: string;
    let rowClass: OverviewClass | null = null;
    switch (query.dim) {
      case 'kategorie':
        key = split.categoryId ?? '';
        label = category?.name ?? 'Ohne Kategorie';
        rowClass = cls;
        break;
      case 'gruppe':
        key = category?.groupId ?? '';
        label = category?.groupName ?? 'Ohne Kategorie';
        break;
      case 'klasse':
        key = cls ?? '';
        label =
          cls === 'need'
            ? 'Bedarf'
            : cls === 'want'
              ? 'Wunsch'
              : cls === 'future'
                ? 'Zukunft'
                : 'Ohne Kategorie';
        rowClass = cls;
        break;
      case 'empfaenger':
        key = split.payeeId ?? '';
        label = split.payeeName ?? 'Ohne Empfänger';
        break;
      case 'einnahme':
        key = split.incomeTypeId ?? '';
        label = incomeTypes.get(split.incomeTypeId ?? '')?.name ?? 'Ohne Einnahmenart';
        break;
    }
    let acc = rows.get(key);
    if (!acc) {
      acc = {
        label,
        class: rowClass,
        cents: columns.map(() => 0),
        bookings: columns.map(() => new Set<string>()),
      };
      rows.set(key, acc);
    }
    const index = columnIndex.get(columnKey(month, query.cols)) as number;
    (acc.cents as number[])[index] = (acc.cents[index] as number) + split.amountCents;
    (acc.bookings[index] as Set<string>).add(split.bookingId);
  }

  const unit = query.meas === 'anzahl' ? 'count' : 'cents';
  const monthsIn = (i: number) => (columns[i] as ExplorerColumn).months.length;
  const built: ExplorerRow[] = [...rows]
    .map(([key, acc]): ExplorerRow => {
      const sumCents = acc.cents.reduce((a, b) => a + b, 0);
      const allBookings = new Set(acc.bookings.flatMap((s) => [...s]));
      let values: number[];
      let total: number;
      if (query.meas === 'anzahl') {
        values = acc.bookings.map((s) => s.size);
        total = allBookings.size;
      } else if (query.meas === 'avg') {
        values = acc.cents.map((c, i) => Math.round(c / monthsIn(i)));
        total = Math.round(sumCents / Math.max(months.length, 1));
      } else {
        values = acc.cents;
        total = sumCents;
      }
      return { key, label: acc.label, class: acc.class, values, total };
    })
    .filter((r) => r.total !== 0)
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'de'));

  const listed = built.slice(0, EXPLORER_ROW_LIMIT);
  const addable =
    query.meas === 'summe' ||
    (query.meas === 'anzahl' && (query.dim === 'empfaenger' || query.dim === 'einnahme'));
  return {
    query,
    months,
    columns,
    unit,
    rows: listed,
    totals:
      addable && built.length > 1
        ? {
            values: columns.map((_, i) => built.reduce((s, r) => s + (r.values[i] as number), 0)),
            total: built.reduce((s, r) => s + r.total, 0),
          }
        : null,
    truncated: Math.max(0, built.length - listed.length),
    good: income ? 'high' : 'low',
  };
}

export interface HeatCell {
  tone: 'good' | 'bad';
  /** 0.25 to 1: the strength of the tint. */
  strength: number;
}

/**
 * Diverging heat per row (SPEC §6): a value far above the row's mean is pastel red when low is
 * good (spending) and pastel green when high is good (income); within 8 % of the mean, empty
 * and zero cells stay neutral. Direction is never the only signal: the figure is always shown.
 */
export function overviewHeat(
  values: ReadonlyArray<number | null>,
  good: 'low' | 'high',
): Array<HeatCell | null> {
  const xs = values.filter((x): x is number => x !== null && x !== 0);
  const mean = xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const dev = Math.max(...xs.map((x) => Math.abs(x - mean)), 1e-9);
  return values.map((x) => {
    if (x === null || x === 0) return null;
    const d = (x - mean) / dev;
    if (Math.abs(d) < 0.08 || Math.abs(x - mean) < Math.abs(mean) * 0.08) return null;
    const bad = good === 'low' ? d > 0 : d < 0;
    return { tone: bad ? 'bad' : 'good', strength: Math.min(1, 0.25 + Math.abs(d) * 0.75) };
  });
}
