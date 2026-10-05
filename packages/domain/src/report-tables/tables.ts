import { calendarRangeMonths, isCalendarRange } from '../report-range';
import { addMonths, monthsBetween } from '../date';
import type { Period } from '../invest/performance';
import { ratioBp } from '../kpi/ratios';
import { mulDivRound } from '../wealth/int';
import { householdIncomeCents } from '../overview/figures';

/**
 * Monthly tables of the reports 1.5 Jahresansicht, 1.6 Kategorieübersicht, 1.7 Sparquote und
 * Geldalter and 1.8 Gesamttabelle (SPEC §7). Pure: the server reads the ledger into `TableMonth`
 * facts once, every figure of the four reports is derived here, so the same number is never
 * computed twice. Money is integer cents; ratios are integer basis points.
 *
 * Owner decision 02.10.2026: dividends and interest (Kapitalerträge) and refunds (Erstattungen)
 * are never earned household income and stay out of "Einnahmen", the Sparquote and every
 * income-against-expense comparison. Kapitalerträge are a labelled memo row. A refund is netted
 * against the spending category it refunds (owner decision 29.09.2026) by the read model; only a
 * refund without a category stays visible as its own memo row.
 */

export type SpendClass = 'need' | 'want' | 'future';
export const SPEND_CLASSES: ReadonlyArray<SpendClass> = ['need', 'want', 'future'];
export const SPEND_CLASS_LABEL: Readonly<Record<SpendClass, string>> = {
  need: 'Bedarf',
  want: 'Wunsch',
  future: 'Zukunft',
};

/** `income` counts as household income; `capital` and `refund` are shown but never counted. */
export type IncomeRole = 'income' | 'capital' | 'refund' | 'unclassified';

export interface TableCategory {
  id: string;
  name: string;
  class: SpendClass;
  /** Category kind: fixed, periodic, variable, project, debt, invest, ... */
  kind: string;
  groupId: string;
  groupName: string;
}

export interface TableIncomeType {
  id: string;
  name: string;
  role: IncomeRole;
}

export interface TableMeta {
  categories: ReadonlyArray<TableCategory>;
  incomeTypes: ReadonlyArray<TableIncomeType>;
}

/** The ledger facts of one calendar month. */
export interface TableMonth {
  /** `YYYY-MM` */
  month: string;
  /** Received cents per income type id. */
  income: Readonly<Record<string, number>>;
  /** Spent cents per category id (positive = spent, refunds net). */
  spending: Readonly<Record<string, number>>;
  /** Assigned cents per category id ("Plan"). */
  assigned: Readonly<Record<string, number>>;
  /** Net worth at the end of the month (or today); `null` when it cannot be valued. */
  netWorthCents: number | null;
  /** Geldalter in days at the end of the month (or today); `null` without aged outflows. */
  moneyAgeDays: number | null;
}

const sum = (values: Iterable<number>): number => {
  let total = 0;
  for (const v of values) total += v;
  return total;
};

const typeRole = (meta: TableMeta, id: string): IncomeRole =>
  meta.incomeTypes.find((t) => t.id === id)?.role ??
  (id && id !== 'unclassified' ? 'income' : 'unclassified');

/** Income of one role in a month (Einnahmen = role `income`). */
export function monthIncomeOfRole(month: TableMonth, meta: TableMeta, role: IncomeRole): number {
  let total = 0;
  for (const [id, cents] of Object.entries(month.income))
    if (typeRole(meta, id) === role) total += cents;
  return total;
}

/** Typed household income, shared with One-Pager, Sankey and the rules. */
export const monthHouseholdIncome = (month: TableMonth, meta: TableMeta): number =>
  Object.entries(month.income).reduce((total, [id, cents]) => {
    const role = typeRole(meta, id);
    return total + householdIncomeCents(cents, id, role === 'income' ? 'household' : role);
  }, 0);

/** Spending of one class in a month. */
export function monthClassSpending(month: TableMonth, meta: TableMeta, cls: SpendClass): number {
  let total = 0;
  for (const c of meta.categories) if (c.class === cls) total += month.spending[c.id] ?? 0;
  return total;
}

/** Konsum: Bedarf plus Wunsch (Zukunft is saving, not consumption). */
export const monthConsumption = (month: TableMonth, meta: TableMeta): number =>
  monthClassSpending(month, meta, 'need') + monthClassSpending(month, meta, 'want');

/** Übrig nach Zukunft: Einnahmen − Konsum − Zukunft. */
export const monthLeftAfterFuture = (month: TableMonth, meta: TableMeta): number =>
  monthHouseholdIncome(month, meta) -
  monthConsumption(month, meta) -
  monthClassSpending(month, meta, 'future');

/** Sparquote of a set of months in basis points; `null` without income. */
export function savingsRateOf(
  months: ReadonlyArray<TableMonth>,
  meta: TableMeta,
): { incomeCents: number; consumptionCents: number; rateBp: number | null } {
  const incomeCents = sum(months.map((m) => monthHouseholdIncome(m, meta)));
  const consumptionCents = sum(months.map((m) => monthConsumption(m, meta)));
  return {
    incomeCents,
    consumptionCents,
    rateBp: ratioBp(incomeCents - consumptionCents, incomeCents),
  };
}

// ---------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------

/**
 * The months of a Zeitraum ending at the last full month, clipped to the first month with data:
 * 1M the last full month, 3M three months, YTD from January, 1J twelve, 3J thirty-six, Alles all.
 */
export function reportPeriodMonths(period: Period, lastFull: string, first: string): string[] {
  if (isCalendarRange(period)) return calendarRangeMonths(period, first, lastFull);
  if (lastFull < first) return [];
  let from: string;
  switch (period) {
    case '1M':
      from = lastFull;
      break;
    case '3M':
      from = addMonths(lastFull, -2);
      break;
    case 'YTD':
      from = `${lastFull.slice(0, 4)}-01`;
      break;
    case '1J':
      from = addMonths(lastFull, -11);
      break;
    case '3J':
      from = addMonths(lastFull, -35);
      break;
    default:
      from = first;
      break;
  }
  return monthsBetween(from < first ? first : from, lastFull);
}

// ---------------------------------------------------------------------------------------------
// Row model of the Jahresansicht and the Gesamttabelle
// ---------------------------------------------------------------------------------------------

export type TableRowKind =
  'sum' | 'income' | 'group' | 'category' | 'result' | 'pct' | 'memo' | 'level';

/** Direction of a row: which side is good (heat and change colour). `null` = neutral. */
export type RowGood = 'high' | 'low' | null;

export interface TableRow {
  /** Stable key, also the join key to the previous year. */
  key: string;
  label: string;
  kind: TableRowKind;
  /** Indent: 0 sum/result, 1 group or income type, 2 category. */
  level: 0 | 1 | 2;
  /** Class swatch, if the row belongs to a class. */
  swatch?: SpendClass | 'income';
  good: RowGood;
  /** Show the sign in the cell ("+1.200 €"). */
  signed?: boolean;
  /** Cents per column; basis points for `pct` rows; `null` for a column without data. */
  vals: ReadonlyArray<number | null>;
}

/** The Gesamttabelle and Jahresansicht rows for the given columns (`null` = no data). */
export function buildTableRows(
  months: ReadonlyArray<TableMonth | null>,
  meta: TableMeta,
  detail: boolean,
): TableRow[] {
  const vals = (fn: (m: TableMonth) => number): Array<number | null> =>
    months.map((m) => (m === null ? null : fn(m)));
  const rows: TableRow[] = [];
  rows.push({
    key: 'inc',
    label: 'Einnahmen',
    kind: 'sum',
    level: 0,
    good: 'high',
    vals: vals((m) => monthHouseholdIncome(m, meta)),
  });
  for (const type of meta.incomeTypes) {
    if (type.role !== 'income') continue;
    const values = vals((m) => m.income[type.id] ?? 0);
    if (values.some((v) => v)) {
      rows.push({
        key: `inc:${type.id}`,
        label: type.name,
        kind: 'income',
        level: 1,
        swatch: 'income',
        good: 'high',
        vals: values,
      });
    }
  }
  for (const cls of SPEND_CLASSES) {
    // More saving is never red: Zukunft is good when high, spending classes when low.
    const good: RowGood = cls === 'future' ? 'high' : 'low';
    rows.push({
      key: cls,
      label: SPEND_CLASS_LABEL[cls],
      kind: 'sum',
      level: 0,
      swatch: cls,
      good,
      vals: vals((m) => monthClassSpending(m, meta, cls)),
    });
    const inClass = meta.categories.filter((c) => c.class === cls);
    const groups = new Map<string, { name: string; ids: string[] }>();
    for (const c of inClass) {
      const g = groups.get(c.groupId) ?? { name: c.groupName, ids: [] };
      g.ids.push(c.id);
      groups.set(c.groupId, g);
    }
    const groupRows = [...groups.entries()]
      .map(([id, g]) => {
        const values = vals((m) => sum(g.ids.map((cid) => m.spending[cid] ?? 0)));
        return { id, g, values, total: sum(values.map((v) => v ?? 0)) };
      })
      .filter((x) => x.total !== 0)
      .sort((a, b) => b.total - a.total);
    for (const x of groupRows) {
      rows.push({
        key: `${cls}:${x.id}`,
        label: x.g.name,
        kind: 'group',
        level: 1,
        good,
        vals: x.values,
      });
      if (!detail) continue;
      for (const cid of x.g.ids) {
        const c = inClass.find((cc) => cc.id === cid);
        const values = vals((m) => m.spending[cid] ?? 0);
        if (c && values.some((v) => v))
          rows.push({
            key: `cat:${cid}`,
            label: c.name,
            kind: 'category',
            level: 2,
            good,
            vals: values,
          });
      }
    }
  }
  rows.push({
    key: 'cons',
    label: 'Konsumausgaben',
    kind: 'result',
    level: 0,
    good: null,
    vals: vals((m) => monthConsumption(m, meta)),
  });
  rows.push({
    key: 'rest',
    label: 'Übrig nach Zukunft',
    kind: 'result',
    level: 0,
    good: 'high',
    signed: true,
    vals: vals((m) => monthLeftAfterFuture(m, meta)),
  });
  rows.push({
    key: 'sq',
    label: 'Sparquote',
    kind: 'pct',
    level: 0,
    good: null,
    vals: months.map((m) => {
      if (m === null) return null;
      const income = monthHouseholdIncome(m, meta);
      return ratioBp(income - monthConsumption(m, meta), income);
    }),
  });
  // Visible but never counted (owner decision 02.10.2026).
  for (const type of meta.incomeTypes) {
    if (type.role === 'income') continue;
    const values = vals((m) => m.income[type.id] ?? 0);
    if (values.some((v) => v))
      rows.push({
        key: `memo:${type.id}`,
        label:
          type.role === 'unclassified'
            ? type.name
            : type.role === 'refund'
              ? `${type.name} ohne Kategorie (nicht in Einnahmen)`
              : `${type.name} (nicht in Einnahmen)`,
        kind: 'memo',
        level: 0,
        good: 'high',
        vals: values,
      });
  }
  return rows;
}

/** Sum of the columns that have data; `pct` rows have no sum. */
export function tableRowTotal(row: TableRow): number | null {
  if (row.kind === 'pct') return null;
  return sum(row.vals.map((v) => v ?? 0));
}

/** Average per column that has data; `pct` rows have none. */
export function tableRowAverage(row: TableRow): number | null {
  if (row.kind === 'pct') return null;
  const present = row.vals.filter((v): v is number => v !== null);
  return present.length === 0 ? 0 : mulDivRound(sum(present), 1, present.length);
}

// ---------------------------------------------------------------------------------------------
// Diverging heat per row (decision 29.09.2026)
// ---------------------------------------------------------------------------------------------

export interface HeatStats {
  mean: number;
  dev: number;
}

/** Mean of the non-zero cells of a row and the largest deviation from it. */
export function tableHeatStats(vals: ReadonlyArray<number | null>): HeatStats {
  const xs = vals.filter((v): v is number => v !== null && v !== 0);
  const mean = xs.length ? sum(xs) / xs.length : 0;
  const dev = Math.max(1e-9, ...xs.map((x) => Math.abs(x - mean)));
  return { mean, dev };
}

export interface Heat {
  /** `bad` = against the row's direction (red), `good` = with it (green). */
  tone: 'bad' | 'good';
  /** 0.25 to 1, intensity of the tint. */
  strength: number;
}

/**
 * Pastel red above the row average and green below it for spending (`good: 'low'`), reversed for
 * income and saving. Within 8 % of the average, and for empty cells, there is no tint.
 */
export function heatForCell(x: number | null, stats: HeatStats, good: RowGood): Heat | null {
  if (x === null || x === 0 || good === null) return null;
  const d = (x - stats.mean) / stats.dev;
  if (Math.abs(d) < 0.08 || Math.abs(x - stats.mean) < Math.abs(stats.mean) * 0.08) return null;
  const bad = good === 'low' ? d > 0 : d < 0;
  return { tone: bad ? 'bad' : 'good', strength: Math.min(1, 0.25 + Math.abs(d) * 0.75) };
}

// ---------------------------------------------------------------------------------------------
// Jahresansicht: one year against the previous one
// ---------------------------------------------------------------------------------------------

export interface YearView {
  year: number;
  /** Twelve columns January to December; `null` where the month has no complete data. */
  months: Array<TableMonth | null>;
  /** The same calendar months of the previous year, only where both years have data. */
  previous: Array<TableMonth | null>;
  /** Column indexes (0 = January) that are compared. */
  pairs: number[];
}

/** Years that have at least one full month, ascending. */
export function yearsWithData(
  months: ReadonlyArray<TableMonth>,
  lastFull: string | null,
): number[] {
  if (lastFull === null) return [];
  return [
    ...new Set(months.filter((m) => m.month <= lastFull).map((m) => Number(m.month.slice(0, 4)))),
  ].sort((a, b) => a - b);
}

export function buildYearView(
  all: ReadonlyArray<TableMonth>,
  year: number,
  lastFull: string | null,
): YearView {
  const byMonth = new Map(all.map((m) => [m.month, m]));
  const key = (y: number, i: number) => `${y}-${String(i + 1).padStart(2, '0')}`;
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = byMonth.get(key(year, i));
    return m && lastFull !== null && m.month <= lastFull ? m : null;
  });
  const previous = months.map((m, i) => (m ? (byMonth.get(key(year - 1, i)) ?? null) : null));
  const pairs = months.flatMap((m, i) => (m && previous[i] ? [i] : []));
  return {
    year,
    months,
    previous: previous.map((m, i) => (pairs.includes(i) ? m : null)),
    pairs,
  };
}

/** Totals of the previous-year rows by key, for the comparison column. */
export function previousTotals(rows: ReadonlyArray<TableRow>): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const total = tableRowTotal(row);
    if (total !== null) out.set(row.key, total);
  }
  return out;
}

export interface YearComparison {
  pairedMonths: number;
  consumptionDeltaCents: number;
  consumptionDeltaBp: number | null;
  incomeDeltaCents: number;
  incomeDeltaBp: number | null;
  savingsRateBp: number | null;
  previousSavingsRateBp: number | null;
}

/** Konsum, Einnahmen and Sparquote of the compared months against the previous year. */
export function compareYear(view: YearView, meta: TableMeta): YearComparison | null {
  if (view.pairs.length === 0) return null;
  const cur = view.pairs.map((i) => view.months[i] as TableMonth);
  const prev = view.pairs.map((i) => view.previous[i] as TableMonth);
  const c = savingsRateOf(cur, meta);
  const p = savingsRateOf(prev, meta);
  return {
    pairedMonths: view.pairs.length,
    consumptionDeltaCents: c.consumptionCents - p.consumptionCents,
    consumptionDeltaBp: ratioBp(c.consumptionCents - p.consumptionCents, p.consumptionCents),
    incomeDeltaCents: c.incomeCents - p.incomeCents,
    incomeDeltaBp: ratioBp(c.incomeCents - p.incomeCents, p.incomeCents),
    savingsRateBp: c.rateBp,
    previousSavingsRateBp: p.rateBp,
  };
}

// ---------------------------------------------------------------------------------------------
// CSV of the Gesamttabelle
// ---------------------------------------------------------------------------------------------

/** Cents as German decimal without grouping: `-1234,56`. */
export function csvAmount(value: number): string {
  const abs = Math.abs(value);
  const text = `${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return value < 0 ? `-${text}` : text;
}

/** Basis points as German percent with one decimal: `12,3`. */
export function csvPercent(bp: number): string {
  const abs = Math.abs(bp);
  const tenths = Math.round(abs / 10);
  const text = `${Math.trunc(tenths / 10)},${tenths % 10}`;
  return bp < 0 && tenths > 0 ? `-${text}` : text;
}

const csvText = (text: string): string => `"${text.replaceAll('"', '""')}"`;

/**
 * The table exactly as shown (same rows, same columns) as semicolon CSV with German decimals:
 * a header row, one line per row, empty cells where a month has no data.
 */
export function tableCsv(rows: ReadonlyArray<TableRow>, heads: ReadonlyArray<string>): string {
  const lines = [['Position', ...heads].map(csvText).join(';')];
  for (const row of rows)
    lines.push(
      [
        csvText(row.label),
        ...row.vals.map((v) =>
          v === null ? '' : row.kind === 'pct' ? csvPercent(v) : csvAmount(v),
        ),
      ].join(';'),
    );
  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------------------------
// Kategorieübersicht
// ---------------------------------------------------------------------------------------------

export interface CategoryOverviewRow {
  category: TableCategory;
  sumCents: number;
  /** Per month of the window. */
  avgCents: number;
  /** The period of equal length right before the window; `null` when its data is incomplete. */
  previousCents: number | null;
  /** Share of Konsum in basis points; `null` for Zukunft (saving, not consumption). */
  shareBp: number | null;
  /** The last up to twelve full months: month, spent and assigned. */
  history: Array<{ month: string; spentCents: number; assignedCents: number }>;
}

export interface CategoryOverview {
  rows: CategoryOverviewRow[];
  /** Konsum of the window (Bedarf and Wunsch). */
  consumptionCents: number;
  window: string[];
}

/** Categories with spending in the window, largest first, each against the previous period. */
export function categoryOverview(
  all: ReadonlyArray<TableMonth>,
  meta: TableMeta,
  window: ReadonlyArray<string>,
  lastFull: string | null,
): CategoryOverview {
  const byMonth = new Map(all.map((m) => [m.month, m]));
  const n = window.length;
  const first = window[0];
  const previousMonths =
    first === undefined || n === 0
      ? null
      : monthsBetween(addMonths(first, -n), addMonths(first, -1)).map((m) => byMonth.get(m));
  const previousComplete = previousMonths !== null && previousMonths.every((m) => m !== undefined);
  const hist =
    lastFull === null
      ? []
      : monthsBetween(addMonths(lastFull, -11), lastFull).flatMap((m) => {
          const x = byMonth.get(m);
          return x ? [x] : [];
        });
  const inWindow = window.flatMap((m) => {
    const x = byMonth.get(m);
    return x ? [x] : [];
  });
  const rows = meta.categories
    .map((category) => {
      const sumCents = sum(inWindow.map((m) => m.spending[category.id] ?? 0));
      return { category, sumCents };
    })
    .filter((x) => x.sumCents > 0)
    .sort((a, b) => b.sumCents - a.sumCents);
  const consumptionCents = sum(
    rows.filter((x) => x.category.class !== 'future').map((x) => x.sumCents),
  );
  return {
    window: [...window],
    consumptionCents,
    rows: rows.map(({ category, sumCents }) => ({
      category,
      sumCents,
      avgCents: n === 0 ? 0 : mulDivRound(sumCents, 1, n),
      previousCents: previousComplete
        ? sum((previousMonths as TableMonth[]).map((m) => m.spending[category.id] ?? 0))
        : null,
      shareBp: category.class === 'future' ? null : ratioBp(sumCents, consumptionCents),
      history: hist.map((m) => ({
        month: m.month,
        spentCents: m.spending[category.id] ?? 0,
        assignedCents: m.assigned[category.id] ?? 0,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Sparquote und Geldalter
// ---------------------------------------------------------------------------------------------

export interface SavingsPoint {
  month: string;
  rateBp: number | null;
  /** Rolling twelve months up to this month; `null` with fewer than twelve months of data. */
  rollingBp: number | null;
}

export interface SavingsYear {
  year: number;
  months: number;
  incomeCents: number;
  consumptionCents: number;
  rateBp: number | null;
  /** Mean of the month-end Geldalter of the months with one; `null` without any. */
  averageMoneyAgeDays: number | null;
}

export interface MoneyAgePoint {
  month: string;
  days: number | null;
}

export interface SavingsOverview {
  window: {
    incomeCents: number;
    consumptionCents: number;
    savedCents: number;
    rateBp: number | null;
  };
  /** Rolling twelve months at the last full month. */
  rollingBp: number | null;
  /** Monthly points of the chart: the window, at least the last twelve full months. */
  series: SavingsPoint[];
  years: SavingsYear[];
  moneyAge: MoneyAgePoint[];
}

/**
 * Sparquote (Einnahmen − Konsum) / Einnahmen over the window, per month and rolling over twelve
 * months, per calendar year with the average Geldalter. Only full months count.
 */
export function savingsOverview(
  all: ReadonlyArray<TableMonth>,
  meta: TableMeta,
  window: ReadonlyArray<string>,
  lastFull: string | null,
): SavingsOverview {
  const byMonth = new Map(all.map((m) => [m.month, m]));
  const full = lastFull === null ? [] : all.filter((m) => m.month <= lastFull);
  const inWindow = window.flatMap((m) => {
    const x = byMonth.get(m);
    return x ? [x] : [];
  });
  const w = savingsRateOf(inWindow, meta);
  const rolling = (month: string): number | null => {
    const slice = monthsBetween(addMonths(month, -11), month).map((m) => byMonth.get(m));
    return slice.every((x) => x !== undefined)
      ? savingsRateOf(slice as TableMonth[], meta).rateBp
      : null;
  };
  const seriesMonths =
    window.length >= 12 || lastFull === null ? [...window] : full.slice(-12).map((m) => m.month);
  const series = seriesMonths.flatMap((month): SavingsPoint[] => {
    const m = byMonth.get(month);
    if (!m) return [];
    const income = monthHouseholdIncome(m, meta);
    return [
      {
        month,
        rateBp: ratioBp(income - monthConsumption(m, meta), income),
        rollingBp: rolling(month),
      },
    ];
  });
  const years = yearsWithData(all, lastFull).map((year): SavingsYear => {
    const ms = full.filter((m) => m.month.startsWith(`${year}-`));
    const r = savingsRateOf(ms, meta);
    const ages = ms.flatMap((m) => (m.moneyAgeDays === null ? [] : [m.moneyAgeDays]));
    return {
      year,
      months: ms.length,
      incomeCents: r.incomeCents,
      consumptionCents: r.consumptionCents,
      rateBp: r.rateBp,
      averageMoneyAgeDays: ages.length === 0 ? null : Math.round(sum(ages) / ages.length),
    };
  });
  return {
    window: {
      incomeCents: w.incomeCents,
      consumptionCents: w.consumptionCents,
      savedCents: w.incomeCents - w.consumptionCents,
      rateBp: w.rateBp,
    },
    rollingBp: lastFull === null ? null : rolling(lastFull),
    series,
    years,
    moneyAge: all.map((m) => ({ month: m.month, days: m.moneyAgeDays })),
  };
}
