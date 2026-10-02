import { describe, expect, it } from 'vitest';
import { analyseSpending, type SpendCategory } from './analysis';
import { heatCells } from './heat';
import { previousWindow, wholePercents, windowMonths } from './period';

const months = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => {
    const n = from + i;
    return `${2024 + Math.floor((n - 1) / 12)}-${String(((n - 1) % 12) + 1).padStart(2, '0')}`;
  });

describe('windowMonths and previousWindow', () => {
  const available = months(1, 30); // 2024-01 .. 2026-06
  it('cuts the named window from the end of the available months', () => {
    expect(windowMonths('1M', available)).toEqual(['2026-06']);
    expect(windowMonths('3M', available)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(windowMonths('YTD', available)).toHaveLength(6);
    expect(windowMonths('1J', available)).toHaveLength(12);
    expect(windowMonths('3J', available)).toHaveLength(30);
    expect(windowMonths('Alles', available)).toHaveLength(30);
    expect(windowMonths('1J', [])).toEqual([]);
  });
  it('compares only with an equally long window that exists completely', () => {
    expect(previousWindow(windowMonths('1J', available), available)).toEqual(months(7, 18));
    expect(previousWindow(windowMonths('3M', available), available)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(previousWindow(windowMonths('Alles', available), available)).toBeNull();
    // 18 months back would be needed twice: only 30 exist, 24 are not available before the window
    expect(previousWindow(months(13, 30), available)).toBeNull();
    expect(previousWindow([], available)).toBeNull();
  });
});

describe('wholePercents', () => {
  it('adds up to exactly 100 with largest remainder', () => {
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholePercents([54, 34, 26].map((x) => x * 100)).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('is all zero without spending', () => {
    expect(wholePercents([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('heatCells', () => {
  it('colours against the row average, direction by `good`', () => {
    const cells = heatCells([100, 100, 100, 200, 0]);
    expect(cells[0]?.tone).toBe('good');
    expect(cells[3]?.tone).toBe('bad');
    expect(cells[3]?.level).toBe(1);
    expect(cells[4]?.tone).toBeNull();
    expect(heatCells([100, 200], 'high').map((c) => c.tone)).toEqual(['bad', 'good']);
  });
  it('keeps values within 8 % of the average neutral', () => {
    expect(heatCells([100, 104, 96, 100]).map((c) => c.tone)).toEqual([null, null, null, null]);
  });
});

const cats: SpendCategory[] = [
  { id: 'food', name: 'Lebensmittel', groupName: 'Alltag', class: 'need' },
  { id: 'fun', name: 'Freizeit', groupName: 'Genuss', class: 'want' },
  { id: 'etf', name: 'Investieren', groupName: 'Zukunft', class: 'future' },
];

describe('analyseSpending', () => {
  const available = months(1, 24);
  const spend: Record<string, Record<string, number>> = {};
  for (const m of available) spend[m] = { food: 30_000, fun: 10_000, etf: 20_000 };
  // The last window spends 5 000 more on food and gets a refund in leisure.
  for (const m of months(13, 24)) spend[m] = { food: 35_000, fun: 10_000, etf: 20_000 };
  (spend['2025-12'] as Record<string, number>)['fun'] = -2_000;

  const window = months(13, 24);
  const result = analyseSpending({
    categories: cats,
    spend,
    months: window,
    previousMonths: previousWindow(window, available),
    available,
  });

  it('adds Bedarf and Wunsch to consumption and keeps Zukunft apart', () => {
    expect(result.needCents).toBe(420_000);
    expect(result.wantCents).toBe(120_000 - 12_000);
    expect(result.consumptionCents).toBe(result.needCents + result.wantCents);
    expect(result.futureCents).toBe(240_000);
    expect(result.averagePerMonthCents).toBe(Math.round(result.consumptionCents / 12));
  });
  it('shows whole class shares that add up to 100', () => {
    const { need, want, future } = result.classShares;
    expect(need + want + future).toBe(100);
  });
  it('compares with the equally long previous window', () => {
    expect(result.previousMonths).toEqual(months(1, 12));
    expect(result.previousConsumptionCents).toBe(480_000);
    expect(result.changeCents).toBe(result.consumptionCents - 480_000);
    expect(result.changeBp).toBe(Math.round(((result.consumptionCents - 480_000) / 480_000) * 1e4));
    expect(result.moves[0]).toMatchObject({ id: 'food', changeCents: 60_000 });
    expect(result.moves[1]).toMatchObject({ id: 'fun', changeCents: -12_000 });
    // Zukunft is not a consumption row.
    expect(result.rows.map((r) => r.id)).toEqual(['food', 'fun']);
  });
  it('shows the last twelve months in the heatmap with the net refund month', () => {
    expect(result.heatMonths).toEqual(window);
    const fun = result.heatRows.find((r) => r.id === 'fun');
    expect(fun?.values[window.indexOf('2025-12')]).toBe(-2_000);
    expect(fun?.totalCents).toBe(108_000);
  });
  it('has no comparison for the whole history and falls back to twelve heat months', () => {
    const all = analyseSpending({
      categories: cats,
      spend,
      months: windowMonths('Alles', available),
      previousMonths: null,
      available,
    });
    expect(all.changeCents).toBeNull();
    expect(all.moves).toEqual([]);
    const short = analyseSpending({
      categories: cats,
      spend,
      months: months(22, 24),
      previousMonths: null,
      available,
    });
    expect(short.heatMonths).toEqual(months(13, 24));
  });
  it('is empty without spending and does not divide by zero', () => {
    const empty = analyseSpending({
      categories: cats,
      spend: {},
      months: [],
      previousMonths: null,
      available: [],
    });
    expect(empty.consumptionCents).toBe(0);
    expect(empty.averagePerMonthCents).toBe(0);
    expect(empty.classShares).toEqual({ need: 0, want: 0, future: 0 });
    expect(empty.rows).toEqual([]);
  });
  it('rejects sums outside safe integer cents', () => {
    expect(() =>
      analyseSpending({
        categories: cats,
        spend: { '2025-01': { food: Number.MAX_SAFE_INTEGER }, '2025-02': { food: 10 } },
        months: ['2025-01', '2025-02'],
        previousMonths: null,
        available: ['2025-01', '2025-02'],
      }),
    ).toThrow(RangeError);
  });
});
