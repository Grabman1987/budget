import { describe, expect, it } from 'vitest';
import { averageCost, fifoCost, marketValueEurCents, toEurCents, type CostTrade } from './invest';
import { irr, modifiedDietz, periodReturn } from './returns';
import { dailyReturns, windowPerformance } from './performance';
import { depotFlows, securityFlows, type SeriesTrade } from './series';

describe('PP cash-flow timing', () => {
  const first = { date: '2026-01-01', valueCents: 10_000 };
  const day = '2026-01-02';

  it('invests deposits at the start of the day', () => {
    const series = [first, { date: day, valueCents: 22_000 }];
    const flows = [{ date: day, cents: 10_000 }];
    expect(
      windowPerformance({ series, flows }, { from: series[0]!.date, to: series.at(-1)!.date })
        .ttwror,
    ).toBeCloseTo(0.1, 12);
    expect(dailyReturns(series, flows)[0]?.rate).toBeCloseTo(0.1, 12);
  });

  it('retains both sides of a same-day deposit and withdrawal through the report', () => {
    // 100 opening + 100 deposited; 10 earned; 100 withdrawn = 110 closing. Return: 5%.
    const series = [first, { date: day, valueCents: 11_000 }];
    const flows = depotFlows(
      [
        { date: day, cents: 10_000 },
        { date: day, cents: -10_000 },
      ],
      new Map(),
    );
    expect(flows).toHaveLength(2);
    expect(
      windowPerformance({ series, flows }, { from: series[0]!.date, to: series.at(-1)!.date })
        .ttwror,
    ).toBeCloseTo(0.05, 12);
    const result = windowPerformance({ series, flows }, { from: first.date, to: day });
    expect(result.ttwror).toBeCloseTo(0.05, 12);
    expect(result.contributionsCents).toBe(0);
    expect(result.gainCents).toBe(1_000);
  });

  it('includes the funded first day and its costs after an empty balance', () => {
    const series = [
      { ...first, valueCents: 0 },
      { date: day, valueCents: 9_900 },
    ];
    const flows = [{ date: day, cents: 10_000 }];
    expect(
      windowPerformance({ series, flows }, { from: series[0]!.date, to: series.at(-1)!.date })
        .ttwror,
    ).toBeCloseTo(-0.01, 12);
    expect(dailyReturns(series, flows)[0]?.rate).toBeCloseTo(-0.01, 12);
  });

  it('neutralises an end-of-day withdrawal, including a complete liquidation', () => {
    expect(
      windowPerformance(
        { series: [first, { date: day, valueCents: 0 }], flows: [{ date: day, cents: -10_500 }] },
        { from: first.date, to: day },
      ).ttwror,
    ).toBeCloseTo(0.05, 12);
    expect(
      dailyReturns(
        [
          { ...first, valueCents: 0 },
          { date: day, valueCents: 0 },
        ],
        [],
      ),
    ).toEqual([]);
  });

  it('moves a dated class reassignment at the opening without diluting the retained holding', () => {
    // Half the class moves out before today's 10% market gain on the remaining 50 EUR.
    const flows = [{ date: day, cents: -5_000, atStart: true as const }];
    const series = [first, { date: day, valueCents: 5_500 }];
    expect(
      windowPerformance({ series, flows }, { from: series[0]!.date, to: series.at(-1)!.date })
        .ttwror,
    ).toBeCloseTo(0.1, 12);
    expect(dailyReturns(series, flows)[0]?.rate).toBeCloseTo(0.1, 12);
  });

  it('uses PP security returns before tax while preserving actual contributions and gain', () => {
    const end = '2027-01-01';
    const trade: SeriesTrade = {
      date: end,
      kind: 'dividend',
      unitsE8: 0,
      amountCents: 1_000,
      feeCents: 0,
      taxCents: 250,
    };
    const flows = securityFlows([trade], new Map());
    const returnFlows = securityFlows([trade], new Map(), 'before-tax');
    const series = [first, { date: end, valueCents: 10_000 }];
    const result = windowPerformance({ series, flows, returnFlows }, { from: first.date, to: end });
    expect(result.ttwror).toBeCloseTo(0.1, 12);
    expect(result.contributionsCents).toBe(-750);
    expect(result.gainCents).toBe(750);
    expect(result.xirr).toBeCloseTo(0.1, 9);
  });
});

describe('returns with cash flows', () => {
  const start = { date: '2025-01-01', valueCents: 100_000 };

  it('leaves Modified Dietz unavailable without weighted capital', () => {
    expect(
      modifiedDietz({ ...start, valueCents: 0 }, { date: '2026-01-01', valueCents: 0 }, []),
    ).toBeNull();
  });

  it('leaves non-positive capital as a gap and chains only subsequent valid days', () => {
    expect(periodReturn(-349_719, -340_000, 0, 0)).toBeNull();
    const series = [
      { date: '2026-01-01', valueCents: -349_719 },
      { date: '2026-01-02', valueCents: -340_000 },
      { date: '2026-01-03', valueCents: 10_000 },
      { date: '2026-01-04', valueCents: 11_000 },
    ];
    const flows = [{ date: '2026-01-03', cents: 350_000 }];
    const daily = dailyReturns(series, flows);
    expect(daily.map((day) => day.date)).toEqual(['2026-01-03', '2026-01-04']);
    expect(daily[0]?.rate).toBe(0);
    expect(daily[1]?.rate).toBeCloseTo(0.1, 12);
    expect(
      windowPerformance({ series, flows }, { from: '2026-01-01', to: '2026-01-04' }).ttwror,
    ).toBeCloseTo(0.1, 12);
  });

  it('without flows TTWROR, Modified Dietz and IRR agree', () => {
    const end = { date: '2026-01-01', valueCents: 110_000 };
    expect(
      windowPerformance({ series: [start, end], flows: [] }, { from: start.date, to: end.date })
        .ttwror,
    ).toBeCloseTo(0.1, 12);
    expect(modifiedDietz(start, end, [])).toBeCloseTo(0.1, 12);
    expect(irr(start, end, [])).toBeCloseTo(0.1, 9);
  });

  it('does not invent XIRR when every dated investor cash flow cancels to zero', () => {
    const series = [
      { date: '2025-01-01', valueCents: 0 },
      { date: '2026-01-01', valueCents: 0 },
    ];
    const flows = [
      { date: '2026-01-01', cents: 10_000 },
      { date: '2026-01-01', cents: -10_000 },
    ];
    const result = windowPerformance(
      { series, flows },
      { from: series[0]!.date, to: series[1]!.date },
    );
    expect(result.ttwror).toBe(0);
    expect(result.xirr).toBeNull();
    expect(() => irr(series[0]!, series[1]!, [])).toThrow(RangeError);
  });

  it('a deposit in the middle of the year: each method answers its own question', () => {
    // 1.000 opening, 1.000 deposited on 02.07., 2.050 closing that day, 2.200 at year end.
    const mid = { date: '2025-07-02', valueCents: 205_000 };
    const end = { date: '2026-01-01', valueCents: 220_000 };
    const flows = [{ date: '2025-07-02', cents: 100_000 }];
    // PP: the deposit funds the opening capital on 02.07.; chained return is 10%.
    expect(
      windowPerformance({ series: [start, mid, end], flows }, { from: start.date, to: end.date })
        .ttwror,
    ).toBeCloseTo(0.1, 12);
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
