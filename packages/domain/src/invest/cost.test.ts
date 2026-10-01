import { describe, expect, it } from 'vitest';
import {
  costOf,
  feesLast12Months,
  fundCosts,
  gainOf,
  incomeLast12Months,
  realizedGainIn,
  terOf,
  type ProductTrade,
} from './cost';

const t = (p: Partial<ProductTrade> & Pick<ProductTrade, 'date' | 'kind'>): ProductTrade => ({
  unitsE8: 0,
  amountCents: 0,
  feeCents: 0,
  taxCents: 0,
  ...p,
});

const trades: ProductTrade[] = [
  t({ date: '2025-01-10', kind: 'buy', unitsE8: 10e8, amountCents: 100_000, feeCents: 100 }),
  t({ date: '2025-06-10', kind: 'buy', unitsE8: 10e8, amountCents: 200_000, feeCents: 200 }),
  t({ date: '2025-06-10', kind: 'dividend', amountCents: 1_000, taxCents: 275 }),
  t({ date: '2026-02-01', kind: 'split', unitsE8: 20e8 }), // 1:2
  t({
    date: '2026-03-01',
    kind: 'sell',
    unitsE8: -20e8,
    amountCents: 250_000,
    feeCents: 500,
    taxCents: 1_000,
  }),
  t({ date: '2026-04-01', kind: 'fee', amountCents: 300 }),
];

describe('one cost basis per product', () => {
  it('FIFO (default) versus average, with a split, fee and tax', () => {
    // FIFO: 40 units after the split (lot 1: 20, lot 2: 20); selling 20 uses lot 1 (cost 1.001,00).
    const fifo = costOf(trades);
    expect(fifo.unitsE8).toBe(20e8);
    expect(fifo.costBasisCents).toBe(200_200);
    expect(fifo.realizedGainCents).toBe(250_000 - 500 - 1_000 - 100_100);
    // Average: cost 3.003,00 over 40 units, selling half removes 1.501,50.
    const avg = costOf(trades, undefined, 'average');
    expect(avg.unitsE8).toBe(20e8);
    expect(avg.costBasisCents).toBe(150_150);
    expect(avg.realizedGainCents).toBe(248_500 - 150_150);
  });

  it('opening holding, order within a day and gains', () => {
    const c = costOf(
      [
        t({ date: '2026-01-02', kind: 'sell', unitsE8: -5e8, amountCents: 60_000 }),
        t({ date: '2026-01-02', kind: 'buy', unitsE8: 5e8, amountCents: 50_000 }),
      ],
      { unitsE8: 5e8, costBasisCents: 40_000 },
    );
    // The buy is processed first; the sale then uses the opening lot (cost 400,00).
    expect(c.costBasisCents).toBe(50_000);
    expect(c.realizedGainCents).toBe(20_000);
    expect(gainOf(62_000, c)).toEqual({
      unrealizedCents: 12_000,
      realizedCents: 20_000,
      totalCents: 32_000,
    });
  });

  it('realised gain of a window is the difference of running totals', () => {
    expect(realizedGainIn(trades, '2026-01-01', '2026-12-31')).toBe(
      costOf(trades).realizedGainCents,
    );
    expect(realizedGainIn(trades, '2026-03-01', '2026-12-31')).toBe(0);
  });
});

describe('income and fund costs of the last 12 months', () => {
  it('dividends and interest, fees', () => {
    expect(incomeLast12Months(trades, '2026-06-09')).toEqual({
      grossCents: 1_000,
      taxCents: 275,
      feeCents: 0,
      netCents: 725,
    });
    // 10.06.2025 is exactly 12 months before 10.06.2026: outside.
    expect(incomeLast12Months(trades, '2026-06-10').grossCents).toBe(0);
    expect(feesLast12Months(trades, '2026-06-09')).toBe(200 + 500 + 300);
  });

  it('TER on month-end values plus fees, as basis points of the value', () => {
    expect(terOf([100_000, 100_000, 100_000], 20)).toBe(50);
    const fc = fundCosts({
      monthEndValuesCents: new Array<number>(12).fill(1_000_000),
      terBp: 20,
      trades,
      today: '2026-06-09',
      valueCents: 1_000_000,
    });
    // 12 month ends of 10.000,00 at 0,20 % a year: 12 x 1,67 = 20,00 in total; plus 10,00 fees.
    expect(fc).toEqual({ terCents: 2_000, feesCents: 1_000, totalCents: 3_000, costRateBp: 30 });
  });
});
