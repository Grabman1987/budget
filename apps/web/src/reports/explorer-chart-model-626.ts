import {
  explorerTableHeaders,
  explorerTemplateSummaries,
  type ExplorerResult,
  type ExplorerTemplateModel,
  type TableRowKind,
} from '@budget/domain';
import { monthShort } from './table-format';

export type ExplorerChartUnit = 'cents' | 'count' | 'bp';
export interface ExplorerChartRow {
  key: string;
  label: string;
  values: readonly (number | null)[];
  /** Independent original window summary, not a sum of chart coordinates. */
  total: number | null;
  average: number | null;
}
export interface ExplorerChartCohort {
  id: string;
  label: string;
  unit: ExplorerChartUnit;
  rows: readonly ExplorerChartRow[];
}
export interface ExplorerChartModel {
  columns: ReadonlyArray<{ key: string; label: string; months: readonly string[] }>;
  /** Original native-table order; cohort grouping must never reorder table inspection. */
  rows: readonly ExplorerChartRow[];
  cohorts: readonly ExplorerChartCohort[];
  summaryColumns: ReadonlyArray<{ key: 'total' | 'average'; label: string }>;
  totals: ExplorerResult['totals'];
  temporal: boolean;
  truncated: number;
  averageReference: number | null;
  measure: 'summe' | 'avg' | 'anzahl';
}
export interface ExplorerChartSeries {
  key: string;
  label: string;
  values: readonly (number | null)[];
  /** Retain original membership and each independent summary for exact inspection. */
  sourceRows: readonly ExplorerChartRow[];
}

const integer = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;

/** Presentation sum of the returned, displayed row cells only. No financial DTO is mutated. */
export function boundedChartRows(
  rows: readonly ExplorerChartRow[],
  unit: ExplorerChartUnit,
): ExplorerChartSeries[] {
  const visible = rows.slice(0, 8).map((row, index) => ({
    key: `source:${index}:${row.key}`,
    label: row.label,
    values: row.values.map(integer),
    sourceRows: [row],
  }));
  const remaining = rows.slice(8);
  if (!remaining.length) return visible;
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  const values = (rows[0]?.values ?? []).map((_, column): number | null => {
    // Ratios have no additive interpretation. Current canonical input has only one pct row.
    if (unit === 'bp') return null;
    let total = 0n;
    for (const row of remaining) {
      const value = integer(row.values[column]);
      if (value === null) return null;
      total += BigInt(value);
    }
    return total > limit || total < -limit ? null : Number(total);
  });
  return [...visible, { key: 'remaining', label: 'Weitere', values, sourceRows: remaining }];
}

export function customChartModel(result: ExplorerResult): ExplorerChartModel {
  const labels = explorerTableHeaders(result);
  const rows = result.rows.map((row) => ({
    key: row.key,
    label: row.label,
    values: row.values,
    total: row.total,
    average: null,
  }));
  return {
    columns: result.columns.map((column, index) => ({ ...column, label: labels[index + 1]! })),
    rows,
    cohorts: [{ id: 'custom', label: 'Zeilen', unit: result.unit, rows }],
    summaryColumns:
      result.columns.length > 1
        ? [{ key: 'total', label: result.query.meas === 'avg' ? 'Ø' : 'Gesamt' }]
        : [],
    totals: result.totals,
    temporal: result.query.cols !== 'keine',
    truncated: result.truncated,
    averageReference: null,
    measure: result.query.meas,
  };
}

const KIND_LABEL: Record<TableRowKind, string> = {
  sum: 'Summen',
  income: 'Einnahmenarten',
  group: 'Gruppen',
  category: 'Kategorien',
  result: 'Ergebnisse',
  pct: 'Sparquote',
  memo: 'Hinweise',
  level: 'Stände',
};

export function templateChartModel(model: ExplorerTemplateModel): ExplorerChartModel {
  const rows: ExplorerChartRow[] = model.rows.map((row) => {
    if (!Object.hasOwn(KIND_LABEL, row.kind) || ![0, 1, 2].includes(row.level))
      throw new Error('Nicht unterstützte Zeilenart');
    const summary = explorerTemplateSummaries(row);
    return {
      key: row.key,
      label: row.label,
      values: row.vals,
      total: summary.total,
      average: summary.average,
    };
  });
  const cohorts = new Map<string, ExplorerChartCohort>();
  model.rows.forEach((source, index) => {
    const id = `${source.kind}:${source.level}`;
    const existing = cohorts.get(id);
    if (existing) cohorts.set(id, { ...existing, rows: [...existing.rows, rows[index]!] });
    else
      cohorts.set(id, {
        id,
        label: KIND_LABEL[source.kind],
        unit: source.kind === 'pct' ? 'bp' : 'cents',
        rows: [rows[index]!],
      });
  });
  const all = [...cohorts.values()];
  return {
    columns: model.months.map((month) => ({
      key: month,
      label: `${monthShort(month, true)}${month === model.partialMonth ? '*' : ''}`,
      months: [month],
    })),
    rows,
    cohorts: all.map((cohort) => ({
      ...cohort,
      label: all.some((other) => other.id !== cohort.id && other.label === cohort.label)
        ? `${cohort.label} · Ebene ${cohort.id.split(':')[1]}`
        : cohort.label,
    })),
    summaryColumns: [
      ...(model.total ? [{ key: 'total' as const, label: 'Summe' }] : []),
      ...(model.average ? [{ key: 'average' as const, label: 'Ø Monat' }] : []),
    ],
    totals: null,
    temporal: true,
    truncated: 0,
    averageReference: model.id === 'category' ? (rows[0]?.average ?? null) : null,
    measure: 'summe',
  };
}
