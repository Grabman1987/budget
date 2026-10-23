import type { Period } from '../invest/performance';
import {
  buildTableRows,
  buildYearView,
  categoryTrend,
  reportPeriodMonths,
  tableRowAverage,
  tableRowTotal,
  yearsWithData,
  type TableMeta,
  type TableMonth,
  type TableRow,
} from '../report-tables/tables';
import { analyseSpending } from '../spending/analysis';
import { householdIncomeCents, type OverviewSplit } from './figures';

/** Fixed owner templates; the persisted five-field custom Explorer query is unchanged. */
export const EXPLORER_TEMPLATES = [
  { id: 'heatmap', label: 'Heatmap Ausgaben', period: '1J' },
  { id: 'year', label: 'Jahresansicht', period: 'YTD' },
  { id: 'total', label: 'Gesamttabelle', period: '3J' },
  { id: 'category', label: 'Kategorie im Verlauf', period: '1J' },
] as const;
export type ExplorerTemplateId = (typeof EXPLORER_TEMPLATES)[number]['id'];
export const isExplorerTemplate = (value: unknown): value is ExplorerTemplateId =>
  EXPLORER_TEMPLATES.some((template) => template.id === value);

export interface ExplorerTemplateFacts extends TableMeta {
  asOf: string;
  currentMonth: string;
  firstMonth: string | null;
  lastFullMonth: string | null;
  months: TableMonth[];
  splits: OverviewSplit[];
}
export interface ExplorerTemplateChoice {
  id: ExplorerTemplateId;
  period: Period;
  year?: number;
  categoryId?: string;
}
export interface ExplorerTemplateModel {
  id: ExplorerTemplateId;
  title: string;
  months: string[];
  rows: TableRow[];
  total: boolean;
  average: boolean;
  categoryId: string | null;
  /** The effective source date binds relative windows even when all displayed values match. */
  asOf: string;
  partialMonth: string | null;
}

/** Display projection only: every monetary figure comes from an existing report function. */
export function explorerTemplate(
  facts: ExplorerTemplateFacts,
  choice: ExplorerTemplateChoice,
): ExplorerTemplateModel {
  const definition = EXPLORER_TEMPLATES.find((template) => template.id === choice.id)!;
  const model: ExplorerTemplateModel = {
    id: choice.id,
    title: definition.label,
    months: [],
    rows: [],
    total: choice.id !== 'total',
    average: choice.id === 'year' || choice.id === 'category',
    categoryId: null,
    asOf: facts.asOf,
    partialMonth: null,
  };
  if (!facts.firstMonth) return model;
  const end =
    choice.id === 'total' || choice.period.includes('..')
      ? facts.currentMonth
      : facts.lastFullMonth;
  if (!end) return model;
  const window = reportPeriodMonths(choice.period, end, facts.firstMonth);
  if (facts.lastFullMonth !== facts.currentMonth && window.includes(facts.currentMonth))
    model.partialMonth = facts.currentMonth;
  if (choice.id === 'year') {
    const year = choice.year ?? Number(end.slice(0, 4));
    const view = buildYearView(facts.months, year, facts.lastFullMonth);
    return {
      ...model,
      partialMonth: null,
      months: Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
      rows: buildTableRows(view.months, facts, true),
    };
  }
  if (choice.id === 'heatmap') {
    const available = facts.months
      .filter((month) => month.month <= end)
      .map((month) => month.month);
    const analysis = analyseSpending({
      categories: facts.categories,
      spend: Object.fromEntries(facts.months.map((month) => [month.month, month.spending])),
      months: window,
      previousMonths: null,
      available,
    });
    return {
      ...model,
      months: analysis.heatMonths,
      rows: analysis.heatRows.map((row): TableRow => ({
        key: `cat:${row.id}`,
        label: row.name,
        kind: 'category',
        level: 0,
        swatch: row.class,
        good: 'low',
        vals: row.values,
      })),
    };
  }
  if (choice.id === 'category') {
    const category =
      facts.categories.find((row) => row.id === choice.categoryId) ??
      (choice.categoryId ? undefined : facts.categories[0]);
    if (!category) return { ...model, months: window };
    return {
      ...model,
      months: window,
      categoryId: category.id,
      rows: [
        {
          key: `cat:${category.id}`,
          label: category.name,
          kind: 'category',
          level: 0,
          swatch: category.class,
          good: category.class === 'future' ? 'high' : 'low',
          vals: categoryTrend(facts.months, category.id, window).map((point) => point.spentCents),
        },
      ],
    };
  }
  const selected = new Map(facts.months.map((month) => [month.month, month]));
  return {
    ...model,
    months: window,
    rows: buildTableRows(
      window.map((month) => selected.get(month) ?? null),
      facts,
      true,
    ),
    partialMonth:
      facts.lastFullMonth !== facts.currentMonth && window.includes(facts.currentMonth)
        ? facts.currentMonth
        : null,
  };
}

export interface ExplorerTemplateContribution {
  bookingId: string;
  date: string;
  /** This split's classified contribution to this cell, not the whole cash booking amount. */
  cents: number;
}

/** Exact classified source splits; no booking, assignment, refund or transfer is rewritten. */
export function explorerTemplateSources(
  facts: ExplorerTemplateFacts,
  model: ExplorerTemplateModel,
  rowKey: string,
  column: string,
): ExplorerTemplateContribution[] {
  const row = model.rows.find((candidate) => candidate.key === rowKey);
  if (!row || row.kind === 'pct' || (column !== 'summe' && !model.months.includes(column)))
    return [];
  const available = model.months.filter((_, index) => row.vals[index] !== null);
  const months = column === 'summe' ? available : available.filter((month) => month === column);
  const categories = new Map(facts.categories.map((category) => [category.id, category]));
  return facts.splits.flatMap((split): ExplorerTemplateContribution[] => {
    if (!months.includes(split.date.slice(0, 7))) return [];
    const category = categories.get(split.categoryId ?? '');
    const household =
      split.kind === 'income' &&
      householdIncomeCents(split.amountCents, split.incomeTypeId, split.incomeGroup) !== 0;
    let included = false;
    let sign = 1;
    if (rowKey === 'inc') included = household;
    else if (rowKey.startsWith('inc:') || rowKey.startsWith('memo:'))
      included =
        split.kind === 'income' &&
        (split.incomeTypeId ?? 'unclassified') === rowKey.slice(rowKey.indexOf(':') + 1);
    else if (rowKey.startsWith('cat:'))
      included = split.kind === 'spend' && split.categoryId === rowKey.slice(4);
    else if (rowKey === 'rest') {
      included = household || (split.kind === 'spend' && category !== undefined);
      sign = split.kind === 'spend' ? -1 : 1;
    } else if (split.kind === 'spend' && category) {
      included =
        rowKey === 'cons'
          ? category.class !== 'future'
          : rowKey === category.class || rowKey === `${category.class}:${category.groupId}`;
    }
    return included
      ? [{ bookingId: split.bookingId, date: split.date, cents: split.amountCents * sign }]
      : [];
  });
}

/** Monetary summaries use the same rounded-cent report functions; ratios have no booking sum. */
export const explorerTemplateSummaries = (row: TableRow) => ({
  total: tableRowTotal(row),
  average: tableRowAverage(row),
});

/** Calendar-year options retain the old report's full-month availability. */
export const explorerTemplateYears = (facts: ExplorerTemplateFacts): number[] =>
  yearsWithData(facts.months, facts.lastFullMonth);
