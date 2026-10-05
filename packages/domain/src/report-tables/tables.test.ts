import { describe, expect, it } from 'vitest';
import {
  buildTableRows,
  buildYearView,
  categoryOverview,
  compareYear,
  csvAmount,
  csvPercent,
  heatForCell,
  monthConsumption,
  monthHouseholdIncome,
  monthLeftAfterFuture,
  previousTotals,
  reportPeriodMonths,
  savingsOverview,
  tableCsv,
  tableHeatStats,
  tableRowAverage,
  tableRowTotal,
  yearsWithData,
  type TableMeta,
  type TableMonth,
} from './tables';

const meta: TableMeta = {
  categories: [
    {
      id: 'rent',
      name: 'Miete',
      class: 'need',
      kind: 'fixed',
      groupId: 'g-home',
      groupName: 'Wohnen',
    },
    {
      id: 'food',
      name: 'Essen',
      class: 'need',
      kind: 'variable',
      groupId: 'g-food',
      groupName: 'Essen',
    },
    {
      id: 'fun',
      name: 'Freizeit',
      class: 'want',
      kind: 'variable',
      groupId: 'g-fun',
      groupName: 'Freizeit',
    },
    {
      id: 'etf',
      name: 'ETF',
      class: 'future',
      kind: 'invest',
      groupId: 'g-save',
      groupName: 'Sparen',
    },
  ],
  incomeTypes: [
    { id: 'salary', name: 'Gehalt', role: 'income' },
    { id: 'side', name: 'Nebeneinkünfte', role: 'income' },
    { id: 'capital', name: 'Kapitalerträge', role: 'capital' },
    { id: 'refund', name: 'Erstattungen', role: 'refund' },
  ],
};

function month(
  key: string,
  income: Record<string, number>,
  spending: Record<string, number>,
  extra: Partial<TableMonth> = {},
): TableMonth {
  return {
    month: key,
    income,
    spending,
    assigned: {},
    netWorthCents: null,
    moneyAgeDays: null,
    ...extra,
  };
}

const m1 = month(
  '2025-01',
  { salary: 300_000, side: 20_000, capital: 5_000, refund: 3_000 },
  { rent: 100_000, food: 40_000, fun: 20_000, etf: 50_000 },
);

describe('income and consumption', () => {
  it('keeps Kapitalerträge and Erstattungen out of household income and the Sparquote', () => {
    expect(monthHouseholdIncome(m1, meta)).toBe(320_000);
    expect(monthConsumption(m1, meta)).toBe(160_000);
    // 320.000 - 160.000 (Konsum) - 50.000 (Zukunft)
    expect(monthLeftAfterFuture(m1, meta)).toBe(110_000);
  });

  it('treats an unknown income type as household income', () => {
    const m = month('2025-02', { custom: 10_000 }, {});
    expect(monthHouseholdIncome(m, meta)).toBe(10_000);
  });
});

describe('reportPeriodMonths', () => {
  it('ends at the last full month and clips to the first month with data', () => {
    expect(reportPeriodMonths('1M', '2026-08', '2023-10')).toEqual(['2026-08']);
    expect(reportPeriodMonths('3M', '2026-08', '2023-10')).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(reportPeriodMonths('YTD', '2026-03', '2023-10')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(reportPeriodMonths('1J', '2026-08', '2023-10')).toHaveLength(12);
    expect(reportPeriodMonths('3J', '2026-09', '2023-10')).toHaveLength(36);
    expect(reportPeriodMonths('Alles', '2024-02', '2023-10')).toEqual([
      '2023-10',
      '2023-11',
      '2023-12',
      '2024-01',
      '2024-02',
    ]);
    // Only 3 months of data: a longer period shows what exists, never invented months.
    expect(reportPeriodMonths('1J', '2024-01', '2023-11')).toEqual([
      '2023-11',
      '2023-12',
      '2024-01',
    ]);
    expect(reportPeriodMonths('1M', '2023-09', '2023-10')).toEqual([]);
  });
});

describe('buildTableRows', () => {
  const months = [m1, null, month('2025-03', { salary: 300_000 }, { rent: 100_000, fun: 35_000 })];
  const group = buildTableRows(months, meta, false);
  const detail = buildTableRows(months, meta, true);
  const keys = (rows: typeof group) => rows.map((r) => r.key);

  it('lists income types, classes with groups, results and the memo rows', () => {
    expect(keys(group)).toEqual([
      'inc',
      'inc:salary',
      'inc:side',
      'need',
      'need:g-home',
      'need:g-food',
      'want',
      'want:g-fun',
      'future',
      'future:g-save',
      'cons',
      'rest',
      'sq',
      'memo:capital',
      'memo:refund',
    ]);
    expect(group.find((r) => r.key === 'memo:capital')?.label).toBe(
      'Kapitalerträge (nicht in Einnahmen)',
    );
  });

  it('adds the category rows in detail mode, without changing any group figure', () => {
    expect(keys(detail)).toContain('cat:rent');
    expect(keys(detail)).toContain('cat:etf');
    const strip = (rows: typeof group) => rows.filter((r) => r.kind !== 'category');
    expect(strip(detail)).toEqual(group);
  });

  it('keeps a column without data null and sums only the others', () => {
    const inc = group.find((r) => r.key === 'inc');
    expect(inc?.vals).toEqual([320_000, null, 300_000]);
    expect(tableRowTotal(inc!)).toBe(620_000);
    expect(tableRowAverage(inc!)).toBe(310_000);
    const sq = group.find((r) => r.key === 'sq');
    // (320.000 - 160.000) / 320.000 = 50 %; (300.000 - 135.000) / 300.000 = 55 %
    expect(sq?.vals).toEqual([5000, null, 5500]);
    expect(tableRowTotal(sq!)).toBeNull();
    expect(tableRowAverage(sq!)).toBeNull();
  });

  it('rounds signed half-cent averages away from zero', () => {
    const row = group.find((r) => r.key === 'inc')!;
    expect(tableRowAverage({ ...row, vals: [-1, 0] })).toBe(-1);
    expect(tableRowAverage({ ...row, vals: [1, 0] })).toBe(1);
  });

  it('orders the groups of a class by their total, largest first', () => {
    expect(keys(group).indexOf('need:g-home')).toBeLessThan(keys(group).indexOf('need:g-food'));
  });

  it('adds up: class sums equal the sum of their groups, Übrig follows the chain', () => {
    const total = (key: string) => tableRowTotal(group.find((r) => r.key === key)!) ?? 0;
    expect(total('need')).toBe(total('need:g-home') + total('need:g-food'));
    expect(total('rest')).toBe(total('inc') - total('cons') - total('future'));
    expect(total('cons')).toBe(total('need') + total('want'));
  });

  it('does not list an income type or memo row without any amount', () => {
    const rows = buildTableRows([month('2025-04', { salary: 1 }, {})], meta, false);
    expect(rows.map((r) => r.key)).not.toContain('inc:side');
    expect(rows.map((r) => r.key)).not.toContain('memo:capital');
  });

  it('marks saving as good when high and spending as good when low', () => {
    expect(group.find((r) => r.key === 'future')?.good).toBe('high');
    expect(group.find((r) => r.key === 'need')?.good).toBe('low');
    expect(group.find((r) => r.key === 'inc')?.good).toBe('high');
    expect(group.find((r) => r.key === 'cons')?.good).toBeNull();
  });
});

describe('heat', () => {
  const stats = tableHeatStats([100, 100, 100, 160, null, 0]);
  it('tints a high month red and a low one green for spending, reversed for income', () => {
    expect(heatForCell(160, stats, 'low')?.tone).toBe('bad');
    expect(heatForCell(100, stats, 'low')?.tone).toBe('good');
    expect(heatForCell(160, stats, 'high')?.tone).toBe('good');
    expect(heatForCell(100, stats, 'high')?.tone).toBe('bad');
  });

  it('is neutral for empty and zero cells, neutral rows and values within 8 % of the average', () => {
    expect(heatForCell(null, stats, 'low')).toBeNull();
    expect(heatForCell(0, stats, 'low')).toBeNull();
    expect(heatForCell(160, stats, null)).toBeNull();
    const flat = tableHeatStats([100, 102, 98, 100]);
    expect(heatForCell(102, flat, 'low')).toBeNull();
  });

  it('scales the tint between 0,25 and 1', () => {
    const h = heatForCell(160, stats, 'low');
    expect(h?.strength).toBeGreaterThanOrEqual(0.25);
    expect(h?.strength).toBeLessThanOrEqual(1);
  });
});

describe('year against the previous year', () => {
  const all = [
    month('2024-01', { salary: 200_000 }, { rent: 80_000, fun: 10_000 }),
    month('2024-02', { salary: 200_000 }, { rent: 80_000, fun: 20_000 }),
    month('2024-03', { salary: 200_000 }, { rent: 80_000, fun: 15_000 }),
    month('2025-01', { salary: 220_000 }, { rent: 85_000, fun: 15_000 }),
    month('2025-02', { salary: 220_000 }, { rent: 85_000, fun: 25_000 }),
    month('2025-03', { salary: 220_000 }, { rent: 85_000, fun: 20_000 }),
    month('2025-04', { salary: 220_000 }, { rent: 85_000, fun: 20_000 }),
  ];

  it('uses full months only and pairs the same calendar months of both years', () => {
    const view = buildYearView(all, 2025, '2025-03');
    expect(view.months.filter(Boolean)).toHaveLength(3);
    expect(view.months[3]).toBeNull(); // April is not full yet
    expect(view.pairs).toEqual([0, 1, 2]);
    expect(view.previous.filter(Boolean)).toHaveLength(3);
  });

  it('compares only months present in both years', () => {
    const view = buildYearView(all, 2025, '2025-04');
    expect(view.pairs).toEqual([0, 1, 2]); // 2024-04 does not exist
    expect(view.months[3]?.month).toBe('2025-04');
    expect(view.previous[3]).toBeNull();
  });

  it('has no comparison without a previous year', () => {
    const view = buildYearView(all, 2024, '2025-04');
    expect(view.pairs).toEqual([]);
    expect(compareYear(view, meta)).toBeNull();
  });

  it('computes the changes in cents and basis points', () => {
    const view = buildYearView(all, 2025, '2025-03');
    const cmp = compareYear(view, meta);
    // Konsum 2025: 3 * 85.000 + 60.000 = 315.000, 2024: 3 * 80.000 + 45.000 = 285.000
    expect(cmp?.consumptionDeltaCents).toBe(30_000);
    expect(cmp?.consumptionDeltaBp).toBe(1053); // 10,5 %
    // Einnahmen 660.000 against 600.000
    expect(cmp?.incomeDeltaCents).toBe(60_000);
    expect(cmp?.incomeDeltaBp).toBe(1000);
    expect(cmp?.savingsRateBp).toBe(5227); // (660.000 - 315.000) / 660.000
    expect(cmp?.previousSavingsRateBp).toBe(5250); // (600.000 - 285.000) / 600.000
  });

  it('gives the previous-year totals per row key for the comparison column', () => {
    const view = buildYearView(all, 2025, '2025-03');
    const prev = previousTotals(buildTableRows(view.previous, meta, false));
    expect(prev.get('inc')).toBe(600_000);
    expect(prev.get('need')).toBe(240_000);
    expect(prev.has('sq')).toBe(false);
  });

  it('lists the years that have a full month', () => {
    expect(yearsWithData(all, '2025-03')).toEqual([2024, 2025]);
    expect(yearsWithData(all, '2024-12')).toEqual([2024]);
    expect(yearsWithData(all, null)).toEqual([]);
  });
});

describe('csv', () => {
  it('writes German decimals and percentages', () => {
    expect(csvAmount(123_456)).toBe('1234,56');
    expect(csvAmount(-5)).toBe('-0,05');
    expect(csvAmount(0)).toBe('0,00');
    expect(csvPercent(5227)).toBe('52,3');
    expect(csvPercent(-1234)).toBe('-12,3');
    expect(csvPercent(0)).toBe('0,0');
  });

  it('exports the displayed rows and columns, empty cells for months without data', () => {
    const months = [m1, null];
    const rows = buildTableRows(months, meta, false);
    const csv = tableCsv(rows, ['Jän 25', 'Feb 25']);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"Position";"Jän 25";"Feb 25"');
    expect(lines).toHaveLength(rows.length + 1);
    expect(lines[1]).toBe('"Einnahmen";3200,00;');
    expect(lines.find((l) => l.startsWith('"Sparquote"'))).toBe('"Sparquote";50,0;');
    expect(lines.find((l) => l.startsWith('"Kapitalerträge'))).toBe(
      '"Kapitalerträge (nicht in Einnahmen)";50,00;',
    );
  });

  it('escapes quotes in labels', () => {
    const csv = tableCsv(
      [{ key: 'x', label: 'Der "Beste"', kind: 'sum', level: 0, good: null, vals: [100] }],
      ['A'],
    );
    expect(csv).toBe('"Position";"A"\r\n"Der ""Beste""";1,00');
  });
});

describe('categoryOverview', () => {
  const months = ['2025-01', '2025-02', '2025-03', '2025-04'].map((k, i) =>
    month(
      k,
      { salary: 300_000 },
      { rent: 100_000, food: 30_000 + i * 10_000, etf: 50_000 },
      { assigned: { food: 40_000 } },
    ),
  );

  it('ranks categories by the window sum with average, share and previous period', () => {
    const o = categoryOverview(months, meta, ['2025-03', '2025-04'], '2025-04');
    expect(o.rows.map((r) => r.category.id)).toEqual(['rent', 'food', 'etf']);
    const food = o.rows.find((r) => r.category.id === 'food')!;
    expect(food.sumCents).toBe(50_000 + 60_000);
    expect(food.avgCents).toBe(55_000);
    expect(food.previousCents).toBe(30_000 + 40_000);
    expect(o.consumptionCents).toBe(200_000 + 110_000);
    expect(food.shareBp).toBe(3548); // 110.000 / 310.000
    // Zukunft is saving, not part of the Konsum shares
    expect(o.rows.find((r) => r.category.id === 'etf')?.shareBp).toBeNull();
    expect(food.history.map((h) => h.spentCents)).toEqual([30_000, 40_000, 50_000, 60_000]);
    expect(food.history[0]?.assignedCents).toBe(40_000);
  });

  it('has no previous period when its months are not all there', () => {
    const o = categoryOverview(
      months,
      meta,
      months.map((m) => m.month),
      '2025-04',
    );
    expect(o.rows.every((r) => r.previousCents === null)).toBe(true);
  });

  it('leaves out categories without spending', () => {
    const o = categoryOverview(months, meta, ['2025-01'], '2025-04');
    expect(o.rows.map((r) => r.category.id)).not.toContain('fun');
  });
});

describe('savingsOverview', () => {
  const months = Array.from({ length: 14 }, (_, i) => {
    const key = `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    return month(
      key,
      { salary: 300_000, capital: 99_999 },
      { rent: 100_000, fun: i === 13 ? 400_000 : 50_000, etf: 40_000 },
      { moneyAgeDays: 10 + i },
    );
  });

  it('computes the Sparquote of the window from household income only', () => {
    const o = savingsOverview(months, meta, ['2025-01', '2025-02'], '2026-02');
    // (600.000 - 300.000) / 600.000
    expect(o.window).toEqual({
      incomeCents: 600_000,
      consumptionCents: 300_000,
      savedCents: 300_000,
      rateBp: 5000,
    });
  });

  it('keeps the rolling twelve months null until twelve months of data exist', () => {
    const o = savingsOverview(months, meta, ['2025-01', '2025-02'], '2026-02');
    const rolling = Object.fromEntries(o.series.map((p) => [p.month, p.rollingBp]));
    // the chart shows at least twelve months: 2025-03 .. 2026-02
    expect(o.series).toHaveLength(12);
    expect(rolling['2025-03']).toBeNull(); // only 11 months of data up to here are not enough
    expect(rolling['2026-02']).not.toBeNull();
    expect(o.rollingBp).toBe(rolling['2026-02']);
  });

  it('handles a month with more consumption than income as a negative rate', () => {
    const o = savingsOverview(months, meta, ['2026-02'], '2026-02');
    expect(o.window.rateBp).toBe(-6667); // (300.000 - 500.000) / 300.000: rent 100.000 + fun 400.000
  });

  it('summarises each calendar year with its months and average Geldalter', () => {
    const o = savingsOverview(months, meta, ['2025-01'], '2026-02');
    expect(o.years.map((y) => [y.year, y.months])).toEqual([
      [2025, 12],
      [2026, 2],
    ]);
    // 2026: Geldalter 22 and 23
    expect(o.years[1]?.averageMoneyAgeDays).toBe(23); // 22,5 rounds up
    expect(o.years[0]?.averageMoneyAgeDays).toBe(16); // mean of 10..21 = 15,5
  });

  it('has no rate without income', () => {
    const o = savingsOverview([month('2025-01', {}, { rent: 1 })], meta, ['2025-01'], '2025-01');
    expect(o.window.rateBp).toBeNull();
    expect(o.rollingBp).toBeNull();
  });

  it('lists the Geldalter of every month, null where it is unknown', () => {
    const o = savingsOverview(
      [
        month('2025-01', { salary: 1 }, {}, { moneyAgeDays: null }),
        month('2025-02', { salary: 1 }, {}, { moneyAgeDays: 4 }),
      ],
      meta,
      ['2025-01'],
      '2025-02',
    );
    expect(o.moneyAge).toEqual([
      { month: '2025-01', days: null },
      { month: '2025-02', days: 4 },
    ]);
  });
});
