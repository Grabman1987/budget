import { describe, expect, it } from 'vitest';
import { comparePeriods, comparePlan } from './compare';
import { explorerPivot, explorerWindow, overviewHeat, parseExplorerQuery } from './explorer';
import {
  overviewMonthlyFigures,
  overviewRefMonth,
  overviewSavingsRate,
  overviewYearMonths,
  sumOverviewMonths,
  type OverviewData,
  type OverviewSplit,
} from './figures';
import { reportYears, yearReport } from './year-report';

const categories = [
  { id: 'miete', name: 'Miete', groupId: 'g1', groupName: 'Wohnen', class: 'need' as const },
  { id: 'essen', name: 'Essen', groupId: 'g2', groupName: 'Alltag', class: 'need' as const },
  { id: 'reisen', name: 'Reisen', groupId: 'g3', groupName: 'Freizeit', class: 'want' as const },
  { id: 'etf', name: 'ETF', groupId: 'g4', groupName: 'Zukunft', class: 'future' as const },
];
const incomeTypes = [
  { id: 'salary', name: 'Gehalt', group: 'household' as const, special: false },
  { id: 'special', name: 'Sonderzahlung', group: 'household' as const, special: true },
  { id: 'capital', name: 'Kapitalerträge', group: 'capital' as const, special: false },
  { id: 'refund', name: 'Erstattungen', group: 'refund' as const, special: false },
];

let seq = 0;
const spend = (
  date: string,
  categoryId: string | null,
  cents: number,
  payee: string | null = 'Laden',
): OverviewSplit => ({
  bookingId: `b${++seq}`,
  date,
  kind: 'spend',
  amountCents: cents,
  categoryId,
  incomeTypeId: null,
  incomeGroup: null,
  payeeId: payee ? `p-${payee}` : null,
  payeeName: payee,
});
const income = (date: string, typeId: string, cents: number): OverviewSplit => ({
  bookingId: `b${++seq}`,
  date,
  kind: 'income',
  amountCents: cents,
  categoryId: null,
  incomeTypeId: typeId,
  incomeGroup: incomeTypes.find((t) => t.id === typeId)?.group ?? null,
  payeeId: 'p-Arbeit',
  payeeName: 'Arbeit',
});

// Ledger from 2025-11 to 2026-08, 100 € rent every month plus varying food.
const splits: OverviewSplit[] = [];
for (const month of [
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
]) {
  splits.push(income(`${month}-25`, 'salary', 300_000));
  splits.push(spend(`${month}-01`, 'miete', 100_000, 'Vermieter'));
  splits.push(spend(`${month}-10`, 'essen', 40_000));
  splits.push(spend(`${month}-12`, 'etf', 50_000, 'Broker'));
}
splits.push(income('2026-06-30', 'special', 100_000));
splits.push(income('2026-07-15', 'capital', 2_500));
splits.push(income('2026-07-16', 'refund', 7_000));
splits.push(spend('2026-07-20', 'reisen', 80_000, 'Reisebüro'));
splits.push(spend('2026-07-22', 'essen', -3_000)); // a refund in the category
splits.push(spend('2026-08-05', null, 1_200, null)); // not yet categorised
const data: OverviewData = { categories, incomeTypes, splits, firstMonth: '2025-11' };
const figures = overviewMonthlyFigures(data);

describe('figures', () => {
  it('keeps capital income and refunds out of household income and Sparquote', () => {
    const july = figures.get('2026-07');
    expect(july).toMatchObject({
      incomeCents: 300_000,
      capitalCents: 2_500,
      refundCents: 7_000,
      needCents: 100_000 + 40_000 - 3_000,
      wantCents: 80_000,
      futureCents: 50_000,
      consumptionCents: 100_000 + 40_000 - 3_000 + 80_000,
    });
    expect(overviewSavingsRate(july!)).toBe(Math.round(((300_000 - 217_000) * 10_000) / 300_000));
  });

  it('counts a special payment as income and spending without a category in no class', () => {
    expect(figures.get('2026-06')?.incomeCents).toBe(400_000);
    const august = figures.get('2026-08')!;
    expect(august.uncategorisedCents).toBe(1_200);
    expect(august.consumptionCents).toBe(140_000);
  });

  it('sums months without data as zero and has no Sparquote without income', () => {
    const total = sumOverviewMonths(figures, ['2026-01', '2030-01']);
    expect(total.incomeCents).toBe(300_000);
    expect(overviewSavingsRate({ incomeCents: 0, consumptionCents: 5 })).toBeNull();
  });

  it('knows the last full month and the months of a year', () => {
    expect(overviewRefMonth('2026-09-17')).toBe('2026-08');
    expect(overviewRefMonth('2026-08-31')).toBe('2026-08');
    expect(overviewYearMonths(2025, '2026-08', '2025-11')).toEqual(['2025-11', '2025-12']);
    expect(overviewYearMonths(2026, '2026-08', '2025-11')).toHaveLength(8);
    expect(overviewYearMonths(2024, '2026-08', '2025-11')).toEqual([]);
    expect(reportYears('2025-11', '2026-08')).toEqual([2026, 2025]);
    expect(reportYears(null, '2026-08')).toEqual([]);
  });
});

describe('comparePeriods', () => {
  const run = (mode: Parameters<typeof comparePeriods>[0]['mode']) =>
    comparePeriods({ mode, ref: '2026-08', firstMonth: data.firstMonth, figures, categories });

  it('pairs the months with their counterparts and keeps the chain exact', () => {
    const r = run('vm');
    expect(r.current).toEqual(['2026-08']);
    expect(r.previous).toEqual(['2026-07']);
    // August 140.000 against July 217.000 (rent, food, refund, trip)
    expect(r.chain).toEqual({
      previousCents: 217_000,
      moreCents: 3_000, // food: July had a refund
      lessCents: 80_000, // the trip
      currentCents: 140_000,
    });
    expect(r.chain.previousCents + r.chain.moreCents - r.chain.lessCents).toBe(
      r.chain.currentCents,
    );
    expect(r.rows[0]).toMatchObject({ categoryId: 'reisen', deltaCents: -80_000 });
  });

  it('compares only months that have a counterpart inside the ledger', () => {
    const vj = run('vj');
    expect(vj.current).toEqual([]);
    expect(vj.requestedMonths).toBe(1);
    const r12 = run('r12');
    expect(r12.current).toEqual([]);
    const ytd = comparePeriods({
      mode: 'ytd',
      ref: '2026-08',
      firstMonth: '2024-01',
      figures,
      categories,
    });
    expect(ytd.requestedMonths).toBe(8);
    expect(ytd.current).toHaveLength(8);
    expect(ytd.currentTotals.incomeCents).toBeGreaterThan(0);
    expect(ytd.previousTotals.incomeCents).toBe(0);
  });

  it('plans the four modes', () => {
    expect(comparePlan('ytd', '2026-08')).toMatchObject({ shift: 12 });
    expect(comparePlan('r12', '2026-08').months).toHaveLength(12);
    expect(comparePlan('vm', '2026-08')).toEqual({ months: ['2026-08'], shift: 1 });
  });
});

describe('yearReport', () => {
  const report = (year: number) =>
    yearReport({
      year,
      ref: '2026-08',
      data,
      figures,
      netWorth: null,
      classAmounts: null,
      specialIncomeTypeIds: new Set(['special']),
    });

  it('builds the year from full months only', () => {
    const r = report(2026);
    expect(r.months).toHaveLength(8);
    expect(r.partial).toBe(true);
    expect(r.totals.incomeCents).toBe(8 * 300_000 + 100_000);
    expect(r.totals.capitalCents).toBe(2_500);
    expect(r.rows.map((x) => x.month)).toEqual(r.months);
  });

  it('shows shares that add up to 100 and rows for the largest categories', () => {
    const r = report(2026);
    const s = r.shares!;
    expect(s.need + s.want + s.future + s.rest).toBe(100);
    expect(r.categories[0]).toMatchObject({ categoryId: 'miete', cents: 800_000 });
    expect(r.categories.some((c) => c.categoryId === 'etf')).toBe(false);
    expect(r.categories[0]!.byMonth.slice(8)).toEqual([null, null, null, null]);
  });

  it('compares with the same months of the year before when they exist', () => {
    const r = report(2026);
    expect(r.comparedMonths).toBe(0); // Jan-Aug 2025 are before the ledger starts
    expect(r.categories[0]!.previousCents).toBeNull();
    expect(r.categories[0]!.changeBp).toBeNull();
    const late = yearReport({
      year: 2026,
      ref: '2026-08',
      data: { ...data, firstMonth: '2025-01' },
      figures,
      netWorth: null,
      classAmounts: null,
      specialIncomeTypeIds: new Set(),
    });
    expect(late.comparedMonths).toBe(8);
  });

  it('lists findings from the ledger and is empty for a year without data', () => {
    const r = report(2026);
    expect(r.findings.find((f) => f.kind === 'special')).toMatchObject({ cents: 100_000 });
    expect(r.findings.find((f) => f.kind === 'capital')).toMatchObject({ cents: 2_500 });
    expect(r.findings.find((f) => f.kind === 'priciestMonth')).toMatchObject({
      month: '2026-07',
    });
    const none = report(2024);
    expect(none.months).toEqual([]);
    expect(none.shares).toBeNull();
    expect(none.totals.savingsRateBp).toBeNull();
  });
});

describe('explorer', () => {
  const q = (over: Record<string, unknown>) =>
    parseExplorerQuery({
      dim: 'kategorie',
      cls: 'alle',
      cols: 'quartal',
      period: 'Alles',
      meas: 'summe',
      ...over,
    })!;

  it('rejects unknown query parts', () => {
    expect(parseExplorerQuery({ dim: 'x' })).toBeNull();
    expect(q({ dim: 'gruppe' }).dim).toBe('gruppe');
  });

  it('windows the full months', () => {
    expect(explorerWindow('3M', '2026-08', '2025-11')).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(explorerWindow('YTD', '2026-08', '2025-11')).toHaveLength(8);
    expect(explorerWindow('3J', '2026-08', '2025-11')).toHaveLength(10);
    expect(explorerWindow('1M', '2026-08', null)).toEqual([]);
  });

  it('pivots spending by category and quarter; row sums equal the figures', () => {
    const r = explorerPivot(data, q({}), '2026-08');
    const rent = r.rows.find((x) => x.key === 'miete')!;
    expect(rent.total).toBe(10 * 100_000);
    expect(rent.values.reduce((a, b) => a + b, 0)).toBe(rent.total);
    expect(r.columns.map((c) => c.key)).toEqual(['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3']);
    const all = [...figures.values()].reduce((s, f) => s + f.consumptionCents + f.futureCents, 0);
    // uncategorised spending (1.200 in August) is a row of its own
    expect(r.totals!.total).toBe(all + 1_200);
    expect(r.unit).toBe('cents');
  });

  it('filters by class and keeps uncategorised spending only for all classes', () => {
    const want = explorerPivot(data, q({ cls: 'want' }), '2026-08');
    expect(want.rows.map((x) => x.key)).toEqual(['reisen']);
    const everything = explorerPivot(data, q({ cols: 'keine' }), '2026-08');
    expect(everything.rows.some((x) => x.key === '')).toBe(true);
    expect(everything.columns).toHaveLength(1);
  });

  it('averages per month and counts bookings per payee', () => {
    const avg = explorerPivot(data, q({ meas: 'avg', cols: 'jahr' }), '2026-08');
    expect(avg.totals).toBeNull();
    expect(avg.rows.find((x) => x.key === 'miete')!.total).toBe(100_000);
    const count = explorerPivot(data, q({ dim: 'empfaenger', meas: 'anzahl' }), '2026-08');
    expect(count.unit).toBe('count');
    expect(count.rows.find((x) => x.label === 'Vermieter')!.total).toBe(10);
    expect(count.totals).not.toBeNull();
  });

  it('shows income by type with high as the good direction, capital apart', () => {
    const r = explorerPivot(data, q({ dim: 'einnahme', cols: 'jahr' }), '2026-08');
    expect(r.good).toBe('high');
    expect(r.rows.map((x) => x.label)).toEqual([
      'Gehalt',
      'Sonderzahlung',
      'Erstattungen',
      'Kapitalerträge',
    ]);
  });

  it('colours a value against its row mean and leaves values near it neutral', () => {
    const heat = overviewHeat([100, 100, 100, 220, null, 0], 'low');
    expect(heat[0]).toMatchObject({ tone: 'good' });
    expect(heat[3]).toMatchObject({ tone: 'bad' });
    expect(heat[3]!.strength).toBeGreaterThan(0.9);
    expect(heat[4]).toBeNull();
    expect(overviewHeat([100, 100, 100, 220], 'high')[3]).toMatchObject({ tone: 'good' });
    expect(overviewHeat([100, 104, 96], 'low').every((c) => c === null)).toBe(true);
  });
});
