import {
  DEFAULT_EXPLORER_QUERY,
  type ExplorerResult,
  type ExplorerTemplateModel,
  type TableRow,
  type TableRowKind,
} from '@budget/domain';
import { describe, expect, it } from 'vitest';
import {
  boundedChartRows,
  customChartModel,
  templateChartModel,
  type ExplorerChartRow,
} from './explorer-chart-model-626';

// Literal presentation contracts drafted before the production model exists.
// This file is NOT executed as a missing-import RED; the current-page RTL is the baseline RED.
const row = (
  key: string,
  values: readonly (number | null)[],
  total: number | null = 777,
): ExplorerChartRow => ({ key, label: key, values, total, average: null });
const firstEight = () =>
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => row(key, [10, 20, 30]));
function custom(rows: ExplorerChartRow[], patch: Partial<ExplorerResult> = {}): ExplorerResult {
  return {
    query: { ...DEFAULT_EXPLORER_QUERY, cols: 'monat' },
    months: ['2024-01', '2024-02', '2024-03'],
    columns: [
      { key: '2024-01', months: ['2024-01'] },
      { key: '2024-02', months: ['2024-02'] },
      { key: '2024-03', months: ['2024-03'] },
    ],
    unit: 'cents',
    rows: rows.map((value) => ({
      key: value.key,
      label: value.label,
      class: null,
      values: [...value.values] as number[],
      total: value.total ?? 0,
    })),
    totals: null,
    truncated: 0,
    good: 'low',
    ...patch,
  };
}
function template(
  rows: TableRow[],
  id: ExplorerTemplateModel['id'] = 'year',
): ExplorerTemplateModel {
  return {
    id,
    title: 'Synthetic template',
    months: ['2024-01', '2024-02', '2024-03'],
    rows,
    total: true,
    average: true,
    categoryId: null,
    asOf: '2024-04-05',
    partialMonth: null,
  };
}
const tableRow = (
  key: string,
  kind: TableRowKind,
  level: TableRow['level'],
  vals: TableRow['vals'],
): TableRow => ({ key, label: key, kind, level, vals, good: null });

describe('626 exact bounded source-row presentation', () => {
  it.each([0, 1, 8])('preserves every returned row and source identity at boundary %i', (count) => {
    const rows = firstEight().slice(0, count);
    const before = structuredClone(rows);
    const plotted = boundedChartRows(rows, 'cents');
    expect(plotted).toHaveLength(count);
    expect(plotted.map((series) => series.label)).toEqual(rows.map((source) => source.label));
    plotted.forEach((series, index) => {
      expect(series.values).toEqual([10, 20, 30]);
      expect(series.sourceRows).toEqual([rows[index]]);
      expect(series.sourceRows[0]).toBe(rows[index]);
    });
    expect(rows).toEqual(before);
  });

  it('groups exactly the ninth returned row without dropping its independent summary', () => {
    const ninth = row('ninth', [901, -101, 0], 999);
    const plotted = boundedChartRows([...firstEight(), ninth], 'cents');
    expect(plotted).toHaveLength(9);
    expect(plotted[8]?.label).toBe('Weitere');
    expect(plotted[8]?.values).toEqual([901, -101, 0]);
    expect(plotted[8]?.sourceRows).toEqual([ninth]);
    expect(plotted[8]?.sourceRows[0]?.total).toBe(999);
  });

  it('adds displayed ninth/tenth cells exactly, never totals-minus-first-eight or rounded pixels', () => {
    const rows = [
      ...firstEight(),
      row('ninth', [901, -101, 0], 9001),
      row('tenth', [-401, 201, 0], 9002),
    ];
    const before = structuredClone(rows);
    const plotted = boundedChartRows(rows, 'cents');
    expect(plotted).toHaveLength(9);
    expect(plotted[8]?.values).toEqual([500, 100, 0]);
    expect(plotted[8]?.sourceRows.map((source) => source.key)).toEqual(['ninth', 'tenth']);
    expect(plotted[8]?.sourceRows.map((source) => source.total)).toEqual([9001, 9002]);
    expect(rows).toEqual(before);
  });

  it('preserves missing columns while independently summing complete signed/zero columns', () => {
    const plotted = boundedChartRows(
      [...firstEight(), row('ninth', [null, -101, 0]), row('tenth', [-401, 201, 0])],
      'cents',
    );
    expect(plotted[8]?.values).toEqual([null, 100, 0]);
  });

  it('uses exact integer addition through cancellation and fails closed on unavailable overflow', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const plotted = boundedChartRows(
      [
        ...firstEight(),
        row('ninth', [max, max, -max]),
        row('tenth', [1, max, -1]),
        row('eleventh', [0, -max, 0]),
      ],
      'cents',
    );
    expect(plotted[8]?.values).toEqual([null, max, null]);
    const invalid = boundedChartRows(
      [...firstEight(), row('bad', [Infinity, NaN, 1.5]), row('valid', [0, 0, 0])],
      'cents',
    );
    expect(invalid[8]?.values).toEqual([null, null, null]);
    expect(
      boundedChartRows([...firstEight(), row('unsafe', [max + 1, 0, 0])], 'cents')[8]?.values,
    ).toEqual([null, 0, 0]);
  });

  it('limits to eight plus Further over200 RETURNED rows, never including truncated/unreturned values', () => {
    const rows = Array.from({ length: 200 }, (_, index) => row(`source-${index}`, [0, 0, 0]));
    const source = custom(rows, {
      truncated: 1,
      totals: { values: [100001, 200002, 300003], total: 600006 },
    });
    const adapted = customChartModel(source);
    const plotted = boundedChartRows(adapted.cohorts[0]!.rows, 'cents');
    expect(plotted).toHaveLength(9);
    expect(plotted[8]?.sourceRows).toHaveLength(192);
    expect(plotted[8]?.sourceRows[0]?.key).toBe('source-8');
    expect(plotted[8]?.sourceRows[191]?.key).toBe('source-199');
    expect(plotted[8]?.values).toEqual([0, 0, 0]);
    expect(adapted.truncated).toBe(1);
    expect(adapted.totals).toBe(source.totals);
    expect(adapted.totals?.total).toBe(600006);
  });

  it('preserves count and avg source cells plus their INDEPENDENT original window totals', () => {
    const count = custom([row('count', [2, 3, 0], 3)], {
      unit: 'count',
      query: { ...DEFAULT_EXPLORER_QUERY, cols: 'monat', meas: 'anzahl' },
    });
    const counts = customChartModel(count);
    expect(counts.cohorts[0]?.unit).toBe('count');
    expect(counts.cohorts[0]?.rows[0]?.values).toEqual([2, 3, 0]);
    expect(counts.cohorts[0]?.rows[0]?.total).toBe(3);
    expect(counts.totals).toBeNull();
    const avg = custom([row('avg', [101, 102, 0], 101)], {
      query: { ...DEFAULT_EXPLORER_QUERY, cols: 'monat', meas: 'avg' },
    });
    const averages = customChartModel(avg);
    expect(averages.cohorts[0]?.rows[0]?.values).toEqual([101, 102, 0]);
    expect(averages.cohorts[0]?.rows[0]?.total).toBe(101);
    expect(averages.totals).toBeNull();
    const further = boundedChartRows(
      [...firstEight(), row('avg-a', [101, 102, 0], 101), row('avg-b', [202, 203, 0], 203)],
      'cents',
    )[8];
    expect(further?.values).toEqual([303, 305, 0]);
    expect(further?.sourceRows.map((source) => source.total)).toEqual([101, 203]);
  });

  it('preserves categorical single-column identity rather than inventing a time axis', () => {
    const source = custom([row('one', [1001], 1001)], {
      query: { ...DEFAULT_EXPLORER_QUERY, cols: 'keine' },
      columns: [{ key: 'all', months: ['2024-01', '2024-02', '2024-03'] }],
    });
    const adapted = customChartModel(source);
    expect(adapted.temporal).toBe(false);
    expect(adapted.columns).toHaveLength(1);
    expect(adapted.columns[0]?.key).toBe('all');
    expect(adapted.columns[0]?.months).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(adapted.cohorts[0]?.rows[0]?.values).toEqual([1001]);
  });
});

describe('626 existing column/header semantics', () => {
  it('keeps quarter labels, original membership and independent total outside temporal columns', () => {
    const source = custom([row('quarter', [1001, 2002], 9999)], {
      query: { ...DEFAULT_EXPLORER_QUERY, cols: 'quartal' },
      months: ['2024-01', '2024-02', '2024-03', '2024-07', '2024-08', '2024-09'],
      columns: [
        { key: '2024-Q1', months: ['2024-01', '2024-02', '2024-03'] },
        { key: '2024-Q3', months: ['2024-07', '2024-08', '2024-09'] },
      ],
    });
    const adapted = customChartModel(source);
    expect(adapted.temporal).toBe(true);
    expect(adapted.columns.map((column) => column.label)).toEqual(['Q1 24', 'Q3 24']);
    expect(adapted.columns[1]?.months).toEqual(['2024-07', '2024-08', '2024-09']);
    expect(adapted.columns).toHaveLength(2);
    expect(adapted.summaryColumns).toEqual([{ key: 'total', label: 'Gesamt' }]);
    expect(adapted.rows[0]?.total).toBe(9999);
  });
  it('keeps existing year headers and avg summary separate from original plotted cells', () => {
    const source = custom([row('year', [101, 102], 203)], {
      query: { ...DEFAULT_EXPLORER_QUERY, cols: 'jahr', meas: 'avg' },
      months: ['2023-12', '2024-01'],
      columns: [
        { key: '2023', months: ['2023-12'] },
        { key: '2024', months: ['2024-01'] },
      ],
    });
    const adapted = customChartModel(source);
    expect(adapted.columns.map((column) => column.label)).toEqual(['2023', '2024']);
    expect(adapted.summaryColumns).toEqual([{ key: 'total', label: 'Ø' }]);
    expect(adapted.rows[0]?.values).toEqual([101, 102]);
    expect(adapted.rows[0]?.total).toBe(203);
    expect(adapted.totals).toBeNull();
  });
});

describe('626 fixed-template cohorts never mix ancestors, memo income or units', () => {
  const originalRows = [
    tableRow('class', 'sum', 0, [1001, 2000, null]),
    tableRow('income', 'income', 1, [10001, 20002, null]),
    tableRow('group', 'group', 1, [1001, 2000, null]),
    tableRow('different-level', 'group', 0, [999, 0, null]),
    tableRow('leaf', 'category', 2, [1001, 2000, null]),
    tableRow('result', 'result', 0, [9000, -100, null]),
    tableRow('pct', 'pct', 0, [1250, -500, null]),
    tableRow('memo', 'memo', 1, [777, 0, null]),
    tableRow('level', 'level', 0, [50000, 70000, null]),
  ];
  it.each(['heatmap', 'year', 'total', 'category'] as const)(
    'keeps every original row and column reachable for %s',
    (id) => {
      const source = template(originalRows, id);
      const before = structuredClone(source);
      const adapted = templateChartModel(source);
      expect(adapted.columns.map((column) => column.key)).toEqual([
        '2024-01',
        '2024-02',
        '2024-03',
      ]);
      expect(adapted.rows.map((value) => value.key)).toEqual([
        'class',
        'income',
        'group',
        'different-level',
        'leaf',
        'result',
        'pct',
        'memo',
        'level',
      ]);
      const rows = adapted.cohorts.flatMap((cohort) => cohort.rows);
      for (const value of rows)
        expect(value).toBe(adapted.rows.find((original) => original.key === value.key));
      expect(rows.map((value) => value.key).sort()).toEqual(
        [
          'class',
          'income',
          'group',
          'different-level',
          'leaf',
          'result',
          'pct',
          'memo',
          'level',
        ].sort(),
      );
      for (const cohort of adapted.cohorts) expect(cohort.rows).toHaveLength(1);
      expect(adapted.cohorts.find((cohort) => cohort.rows[0]?.key === 'pct')?.unit).toBe('bp');
      expect(rows.find((value) => value.key === 'pct')?.values).toEqual([1250, -500, null]);
      expect(rows.find((value) => value.key === 'pct')?.total).toBeNull();
      expect(rows.find((value) => value.key === 'pct')?.average).toBeNull();
      expect(rows.find((value) => value.key === 'leaf')?.total).toBe(3001);
      expect(rows.find((value) => value.key === 'leaf')?.average).toBe(1501);
      expect(rows.find((value) => value.key === 'memo')?.values).toEqual([777, 0, null]);
      expect(source).toEqual(before);
    },
  );

  it('uses exactly the existing Summe and Ø Monat headers only as summary metadata', () => {
    const data = templateChartModel(
      template([tableRow('leaf', 'category', 2, [1001, 2000, null])]),
    );
    expect(data.summaryColumns).toEqual([
      { key: 'total', label: 'Summe' },
      { key: 'average', label: 'Ø Monat' },
    ]);
    expect(data.columns).toHaveLength(3);
    expect(data.rows[0]?.values).toEqual([1001, 2000, null]);
    expect(data.rows[0]?.total).toBe(3001);
    expect(data.rows[0]?.average).toBe(1501);
  });

  it('retains canonical all-null cents summary0/0 without filling plotted gaps', () => {
    const adapted = templateChartModel(
      template([tableRow('absent', 'category', 2, [null, null, null])]),
    );
    expect(adapted.cohorts[0]?.rows[0]?.values).toEqual([null, null, null]);
    expect(adapted.cohorts[0]?.rows[0]?.total).toBe(0);
    expect(adapted.cohorts[0]?.rows[0]?.average).toBe(0);
  });

  it('fails closed for unsupported kinds instead of discarding a row or plotting an invented unit', () => {
    const unknown = {
      ...tableRow('unknown', 'category', 2, [1001, 0, null]),
      kind: 'unsupported-future-kind',
    } as unknown as TableRow;
    expect(() => templateChartModel(template([unknown]))).toThrow(/Zeilenart/);
  });

  it('never creates an additive percentage Further if future input contains more than eight ratios', () => {
    const ratios = Array.from({ length: 9 }, (_, index) =>
      row(`ratio-${index}`, [1250, -500, null], null),
    );
    const plotted = boundedChartRows(ratios, 'bp');
    expect(plotted).toHaveLength(9);
    expect(plotted[8]?.values).toEqual([null, null, null]);
    expect(plotted[8]?.sourceRows[0]).toBe(ratios[8]);
  });
});
