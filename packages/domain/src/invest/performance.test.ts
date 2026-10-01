import { describe, expect, it } from 'vitest';
import {
  dailyReturns,
  dietzMonthly,
  maxDrawdown,
  monthBoundaries,
  monthlyFigures,
  periodPerformance,
  periodWindow,
  windowPerformance,
} from './performance';
import { ttwror, type CashFlow, type Valuation } from './returns';

describe('period windows', () => {
  it('starts on the same day of the earlier month, clamped, or at 31.12.', () => {
    expect(periodWindow('1M', '2026-03-31')).toEqual({ from: '2026-02-28', to: '2026-03-31' });
    expect(periodWindow('3M', '2026-09-17')).toEqual({ from: '2026-06-17', to: '2026-09-17' });
    expect(periodWindow('YTD', '2026-09-17')).toEqual({ from: '2025-12-31', to: '2026-09-17' });
    expect(periodWindow('1J', '2026-02-28')).toEqual({ from: '2025-02-28', to: '2026-02-28' });
    expect(periodWindow('3J', '2024-02-29')).toEqual({ from: '2021-02-28', to: '2024-02-29' });
    expect(periodWindow('Alles', '2026-09-17', '2023-10-01')).toEqual({
      from: '2023-10-01',
      to: '2026-09-17',
    });
  });

  it('month boundaries: start, month ends, end', () => {
    expect(monthBoundaries('2026-01-15', '2026-03-10')).toEqual([
      '2026-01-15',
      '2026-01-31',
      '2026-02-28',
      '2026-03-10',
    ]);
    expect(monthBoundaries('2025-12-31', '2026-02-28')).toEqual([
      '2025-12-31',
      '2026-01-31',
      '2026-02-28',
    ]);
  });
});

/** Hand-computed Portfolio Performance style case, securities-only view (see series.ts). */
function ppCase() {
  const values = [0, 100_000, 110_000, 110_000, 120_000, 60_000, 63_000];
  const series: Valuation[] = values.map((valueCents, i) => ({
    date: `2026-01-0${i + 1}`,
    valueCents,
  }));
  const flows: CashFlow[] = [
    { date: '2026-01-02', cents: 100_500 }, // buy 10 x 100 + fee 5
    { date: '2026-01-04', cents: -1_500 }, // dividend 20 - tax 5
    { date: '2026-01-06', cents: -58_500 }, // sell 5 x 120 - fee 5 - tax 10
  ];
  return { series, flows };
}

describe('window performance', () => {
  it('buy, dividend, sale with fee and tax: TTWROR, gain and contributions', () => {
    const { series, flows } = ppCase();
    const w = windowPerformance({ series, flows }, { from: '2026-01-01', to: '2026-01-07' });
    // 02.01. starts from 0 and is skipped; then 110/100, (110 + 1,5)/110, 120/110, (60 + 58,5)/120, 63/60.
    const expected =
      (110_000 / 100_000) *
        (111_500 / 110_000) *
        (120_000 / 110_000) *
        (118_500 / 120_000) *
        (63_000 / 60_000) -
      1;
    expect(w.ttwror).toBeCloseTo(expected, 12);
    expect(w.startValueCents).toBe(0);
    expect(w.endValueCents).toBe(63_000);
    expect(w.contributionsCents).toBe(40_500);
    // Sale 585 + dividend 15 + holding 630 - cost 1.005 = 225.
    expect(w.gainCents).toBe(22_500);
    expect(w.from).toBe('2026-01-01');
    expect(w.days).toBe(6);
  });

  it('chains the same as ttwror() and the daily returns', () => {
    const { series, flows } = ppCase();
    const w = windowPerformance({ series, flows }, { from: '2026-01-01', to: '2026-01-07' });
    expect(w.ttwror).toBeCloseTo(ttwror(series, flows), 12);
    expect(dailyReturns(series, flows)).toHaveLength(5);
  });

  it('flows on the start day belong to the start value', () => {
    const { series, flows } = ppCase();
    const w = windowPerformance({ series, flows }, { from: '2026-01-02', to: '2026-01-05' });
    expect(w.startValueCents).toBe(100_000);
    expect(w.contributionsCents).toBe(-1_500);
    expect(w.gainCents).toBe(120_000 - 100_000 + 1_500);
  });

  it('XIRR and Modified Dietz over one year without flows equal the return', () => {
    const series: Valuation[] = [];
    const start = Date.UTC(2025, 0, 1);
    for (let i = 0; i <= 365; i++)
      series.push({
        date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
        valueCents: Math.round(100_000 * Math.pow(1.1, i / 365)),
      });
    const w = windowPerformance({ series, flows: [] }, { from: '2025-01-01', to: '2026-01-01' });
    expect(w.ttwror).toBeCloseTo(0.1, 4);
    expect(w.xirr).toBeCloseTo(0.1, 4);
    expect(w.moneyWeighted).toBeCloseTo(0.1, 4);
    expect(w.ttwrorAnnualised).toBeCloseTo(0.1, 4);
    expect(w.monthCount).toBe(13);
    expect(w.positiveMonthShare).toBe(1);
  });

  it('clamps the window to the series and supports named periods', () => {
    const { series, flows } = ppCase();
    const all = periodPerformance({ series, flows }, 'Alles', '2026-01-07');
    expect(all.from).toBe('2026-01-01');
    const w = windowPerformance({ series, flows }, { from: '2020-01-01', to: '2030-01-01' });
    expect(w.to).toBe('2026-01-07');
  });

  it('beta against a benchmark that moves twice as much is 0,5', () => {
    const series: Valuation[] = [
      { date: '2026-01-31', valueCents: 100_000 },
      ...Array.from({ length: 28 }, (_, i) => ({
        date: `2026-02-${String(i + 1).padStart(2, '0')}`,
        valueCents: 100_000 + (i + 1) * 100,
      })),
      ...Array.from({ length: 31 }, (_, i) => ({
        date: `2026-03-${String(i + 1).padStart(2, '0')}`,
        valueCents: 102_800 - (i + 1) * 100,
      })),
    ];
    const feb = 102_800 / 100_000 - 1;
    const mar = 99_700 / 102_800 - 1;
    const bench = [
      { date: '2026-01-31', level: 100 },
      { date: '2026-02-28', level: 100 * (1 + 2 * feb) },
      { date: '2026-03-31', level: 100 * (1 + 2 * feb) * (1 + 2 * mar) },
    ];
    const w = windowPerformance(
      { series, flows: [], benchmark: bench },
      { from: '2026-01-31', to: '2026-03-31' },
    );
    // Proportional monthly returns: covariance over variance is exactly 1/2.
    expect(w.beta).toBeCloseTo(0.5, 9);
    expect(w.benchmarkTtwror).not.toBeNull();
  });
});

describe('risk figures of monthly returns', () => {
  const months = [0.1, -0.05, 0.02];
  it('volatility, drawdown, best/worst month, share of positive months, beta, Sharpe', () => {
    const f = monthlyFigures(
      months,
      months.map((r) => 2 * r),
    );
    expect(f.volatility).toBeCloseTo(0.26, 3);
    expect(f.maxDrawdown).toBeCloseTo(1.045 / 1.1 - 1, 12);
    expect(f.bestMonth).toBe(0.1);
    expect(f.worstMonth).toBe(-0.05);
    expect(f.positiveMonthShare).toBeCloseTo(2 / 3, 12);
    expect(f.beta).toBeCloseTo(0.5, 12);
    expect(f.ttwror).toBeCloseTo(1.1 * 0.95 * 1.02 - 1, 12);
    // Annualised with 12/n (the prototype's rule), risk-free 2,5 %.
    const annual = Math.pow(1.1 * 0.95 * 1.02, 4) - 1;
    expect(f.sharpe).toBeCloseTo((annual - 0.025) / f.volatility, 10);
    expect(monthlyFigures(months).beta).toBeNull();
    expect(monthlyFigures([]).sharpe).toBe(0);
  });

  it('max drawdown of a rising series is 0', () => {
    expect(maxDrawdown([0.01, 0.02])).toBe(0);
  });

  it('prototype Dietz: monthly weights, annualised beyond 12 months', () => {
    // One month, start 1.000, contribution 100 in that month (weight 0,5), end 1.150: gain 50 / 1.050.
    expect(dietzMonthly(100_000, 115_000, [10_000])).toBeCloseTo(5_000 / 105_000, 12);
    const long = dietzMonthly(100_000, 150_000, new Array<number>(24).fill(0));
    expect(long).toBeCloseTo(Math.pow(1.5, 12 / 24) - 1, 12);
  });
});
