import { describe, expect, it } from 'vitest';
import { averageCost, fifoCost, marketValueEurCents, toEurCents, type CostTrade } from './invest';
import { irr, modifiedDietz, ttwror } from './returns';

describe('returns with cash flows', () => {
  const start = { date: '2025-01-01', valueCents: 100_000 };

  it('without flows TTWROR, Modified Dietz and IRR agree', () => {
    const end = { date: '2026-01-01', valueCents: 110_000 };
    expect(ttwror([start, end], [])).toBeCloseTo(0.1, 12);
    expect(modifiedDietz(start, end, [])).toBeCloseTo(0.1, 12);
    expect(irr(start, end, [])).toBeCloseTo(0.1, 9);
  });

  it('a deposit in the middle of the year: each method answers its own question', () => {
    // 1.000 invested, 1.050 on 02.07., then 1.000 more, 2.200 at the end of the year.
    const mid = { date: '2025-07-02', valueCents: 205_000 };
    const end = { date: '2026-01-01', valueCents: 220_000 };
    const flows = [{ date: '2025-07-02', cents: 100_000 }];
    // Time-weighted: 1,05 × (2.200 / 2.050) − 1, independent of the deposit's timing.
    expect(ttwror([start, mid, end], flows)).toBeCloseTo(1.05 * (220_000 / 205_000) - 1, 12);
    // Modified Dietz: 200 gain over 1.000 + 1.000 × 183/365.
    expect(modifiedDietz(start, end, flows)).toBeCloseTo(
      20_000 / (100_000 + (100_000 * 183) / 365),
      12,
    );
    // IRR: the rate at which both deposits grow to 2.200.
    const r = irr(start, end, flows);
    const grown = 100_000 * (1 + r) + 100_000 * Math.pow(1 + r, 183 / 365);
    expect(grown).toBeCloseTo(220_000, 4);
    expect(r).toBeGreaterThan(0.13);
    expect(r).toBeLessThan(0.14);
  });

  it('handles withdrawals and losses', () => {
    const end = { date: '2026-01-01', valueCents: 40_000 };
    const flows = [{ date: '2025-04-01', cents: -50_000 }];
    const r = irr(start, end, flows);
    expect(r).toBeLessThan(0);
    expect(modifiedDietz(start, end, flows)).toBeLessThan(0);
    expect(() => modifiedDietz(end, start, [])).toThrow(RangeError);
  });
});

describe('cost basis: average and FIFO', () => {
  const trades: CostTrade[] = [
    { kind: 'buy', unitsE8: 10e8, amountCents: 100_000, feeCents: 0 }, // 10 @ 100
    { kind: 'buy', unitsE8: 10e8, amountCents: 200_000, feeCents: 0 }, // 10 @ 200
    { kind: 'sell', unitsE8: -10e8, amountCents: 250_000, feeCents: 500, taxCents: 1_000 },
  ];

  it('average cost removes the average, FIFO the oldest lot', () => {
    expect(averageCost({ unitsE8: 0, costBasisCents: 0 }, trades)).toEqual({
      unitsE8: 10e8,
      costBasisCents: 150_000,
      realizedGainCents: 248_500 - 150_000,
    });
    expect(fifoCost({ unitsE8: 0, costBasisCents: 0 }, trades)).toEqual({
      unitsE8: 10e8,
      costBasisCents: 200_000,
      realizedGainCents: 248_500 - 100_000,
    });
  });

  it('a split changes units, not cost; deliveries move lots in and out', () => {
    const more: CostTrade[] = [
      ...trades,
      { kind: 'split', unitsE8: 10e8, amountCents: 0, feeCents: 0 }, // 2:1
      { kind: 'delivery_out', unitsE8: -5e8, amountCents: 0, feeCents: 0 },
    ];
    expect(fifoCost({ unitsE8: 0, costBasisCents: 0 }, more)).toMatchObject({
      unitsE8: 15e8,
      costBasisCents: 150_000,
    });
    expect(averageCost({ unitsE8: 0, costBasisCents: 0 }, more)).toMatchObject({
      unitsE8: 15e8,
      costBasisCents: 112_500,
    });
  });
});

describe('currency conversion with stored rates', () => {
  it('values a USD position in EUR with one rounding', () => {
    // 3,5 units at 101,25 USD, 1 USD = 0,923456 EUR: 327,2497 EUR → 327,25.
    expect(marketValueEurCents(3.5e8, 101_250_000, 923_456)).toBe(32_725);
    expect(marketValueEurCents(3.5e8, 101_250_000, 1_000_000)).toBe(35_438);
    expect(toEurCents(-2_000, 930_000)).toBe(-1_860);
  });
});
