import { describe, expect, it } from 'vitest';
import { marketValueEurCents } from './invest';
import {
  dailyMarketMoveCents,
  depotFlows,
  eachDay,
  fxOn,
  latestOnOrBefore,
  securityFlowCents,
  securityFlows,
  sumSeries,
  dailyValuation,
  costBasisOnDay,
  pickPrice,
  worstQuality,
  PriceUnavailableError,
  type PositionInput,
  type RateTable,
  type SeriesTrade,
} from './series';

const rates: RateTable = new Map([
  [
    'USD',
    [
      { date: '2026-01-01', rateMicro: 900_000 },
      { date: '2026-01-05', rateMicro: 950_000 },
    ],
  ],
]);

describe('daily valuation series', () => {
  it('units from snapshot plus later trades, price carried forward, FX of the day, one rounding', () => {
    const days = eachDay('2026-01-02', '2026-01-07');
    const series = dailyValuation(
      [
        {
          accountId: 'a',
          securityId: 's',
          snapshots: [{ date: '2026-01-01', unitsE8: 10e8 }],
          // The trade on the snapshot day is already inside the snapshot.
          trades: [
            { date: '2026-01-01', unitsE8: 99e8 },
            { date: '2026-01-04', unitsE8: 2.5e8 },
            { date: '2026-01-06', unitsE8: -12.5e8 },
          ],
          prices: [
            { date: '2025-12-30', priceMicro: 99_000_000, currency: 'USD' },
            { date: '2026-01-03', priceMicro: 100_333_333, currency: 'USD' },
          ],
        },
      ],
      days,
      rates,
    );
    const p = series.positions[0]!;
    expect(p.unitsE8).toEqual([10e8, 10e8, 12.5e8, 12.5e8, 0, 0]);
    // 02.01.: old price 99 USD x 0,90; 03.-04.: new price; 05.: rate 0,95 from that day on.
    expect(p.valueCents).toEqual([
      marketValueEurCents(10e8, 99_000_000, 900_000),
      marketValueEurCents(10e8, 100_333_333, 900_000),
      marketValueEurCents(12.5e8, 100_333_333, 900_000),
      marketValueEurCents(12.5e8, 100_333_333, 950_000),
      0,
      0,
    ]);
    expect(p.valueCents[0]).toBe(89_100);
    expect(p.valueCents[3]).toBe(119_146); // 12,5 x 100,333333 x 0,95 = 1191,4583...
    expect(series.totalCents).toEqual(p.valueCents);
  });

  it('zero units need no quote; held positions need a quote and exchange rate', () => {
    const base = { accountId: 'a', securityId: 's', snapshots: [], prices: [] };
    const s = dailyValuation(
      [{ ...base, trades: [{ date: '2026-01-02', unitsE8: 1e8 }] }],
      ['2026-01-01'],
      rates,
    );
    expect(s.positions[0]!.unitsE8).toEqual([0]);
    expect(s.totalCents).toEqual([0]);
    // The strict rule (no estimate) still names the missing price.
    expect(() =>
      dailyValuation(
        [{ ...base, trades: [{ date: '2026-01-02', unitsE8: 1e8 }] }],
        ['2026-01-02'],
        rates,
        { estimate: false },
      ),
    ).toThrow(PriceUnavailableError);
    expect(
      dailyValuation(
        [
          {
            ...base,
            trades: [{ date: '2026-01-02', unitsE8: 1e8 }],
            prices: [{ date: '2026-01-02', priceMicro: 0, currency: 'EUR' }],
          },
        ],
        ['2026-01-02'],
        rates,
      ).totalCents,
    ).toEqual([0]);
    expect(() =>
      dailyValuation(
        [
          {
            ...base,
            trades: [{ date: '2026-01-02', unitsE8: 1e8 }],
            prices: [{ date: '2026-01-01', priceMicro: 1_000_000, currency: 'CHF' }],
          },
        ],
        ['2026-01-02'],
        rates,
      ),
    ).toThrow(/Wechselkurs/);
  });

  it('helpers', () => {
    expect(latestOnOrBefore([{ date: 'b' }, { date: 'd' }], 'c')).toEqual({ date: 'b' });
    expect(latestOnOrBefore([{ date: 'b' }], 'a')).toBeUndefined();
    expect(fxOn(rates, 'USD', '2026-01-04')).toBe(900_000);
    expect(fxOn(rates, 'EUR', '2000-01-01')).toBe(1_000_000);
    expect(sumSeries([1, 2], [10, 20])).toEqual([11, 22]);
    expect(() => sumSeries([1], [1, 2])).toThrow(RangeError);
  });
});

const eurPrice = (date: string, euros: number) => ({
  date,
  priceMicro: euros * 1_000_000,
  currency: 'EUR',
});
const buy = (date: string, units: number, euros: number, fee = 0): SeriesTrade => ({
  date,
  kind: 'buy',
  unitsE8: units * 1e8,
  amountCents: euros * 100,
  feeCents: fee,
  taxCents: 0,
});
const sell = (date: string, units: number, euros: number): SeriesTrade => ({
  date,
  kind: 'sell',
  unitsE8: -units * 1e8,
  amountCents: euros * 100,
  feeCents: 0,
  taxCents: 0,
});

describe('valuation fallbacks for a missing price', () => {
  const unitsOf = (trades: SeriesTrade[]) =>
    trades.map((x) => ({ date: x.date, unitsE8: x.unitsE8 }));
  const position = (over: Partial<PositionInput> = {}): PositionInput => {
    const trades = [buy('2026-03-02', 10, 50, 100)];
    return {
      accountId: 'a',
      securityId: 's',
      snapshots: [],
      trades: unitsOf(trades),
      prices: [],
      cost: { currency: 'EUR', snapshots: [], trades },
      ...over,
    };
  };

  it('exact: a price on the day or carried over a weekend; stale: older than a week', () => {
    const prices = [eurPrice('2026-03-02', 60)];
    expect(pickPrice(prices, '2026-03-02')).toMatchObject({ quality: 'exact' });
    expect(pickPrice(prices, '2026-03-09')).toMatchObject({ quality: 'exact' }); // 7 days
    expect(pickPrice(prices, '2026-03-10')).toMatchObject({ quality: 'stale' }); // 8 days
    const s = dailyValuation([position({ prices })], ['2026-03-04', '2026-03-31'], rates);
    expect(s.positions[0]!.valueCents).toEqual([60_000, 60_000]);
    expect(s.positions[0]!.quality).toBe('stale');
    expect(s.incomplete).toEqual([]); // stale is not incomplete
  });

  it('estimated: a price shortly AFTER the day is used within the tolerance only', () => {
    const prices = [eurPrice('2026-03-09', 70)];
    expect(pickPrice(prices, '2026-03-02')).toMatchObject({ quality: 'estimated' }); // 7 days
    expect(pickPrice(prices, '2026-03-01')).toBeUndefined(); // 8 days
    expect(pickPrice(prices, '2026-03-02', false)).toBeUndefined(); // strict: never backfill
    const s = dailyValuation([position({ prices })], ['2026-03-03'], rates);
    expect(s.totalCents).toEqual([70_000]);
    expect(s.positions[0]!.quality).toBe('estimated');
    expect(s.incomplete).toEqual([
      {
        accountId: 'a',
        securityId: 's',
        quality: 'estimated',
        days: 1,
        from: '2026-03-03',
        to: '2026-03-03',
      },
    ]);
  });

  it('estimated: no price at all falls back to the moving-average cost basis (fees included)', () => {
    const trades = [
      buy('2026-03-02', 10, 50, 100), // cost 5100 for 10 units
      buy('2026-03-04', 10, 70), // cost 12100 for 20 units
      sell('2026-03-06', 5, 99), // removes 5/20 of the cost
    ];
    const p = position({
      trades: unitsOf(trades),
      cost: { currency: 'EUR', snapshots: [], trades },
    });
    const s = dailyValuation([p], ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-06'], rates);
    expect(s.positions[0]!.valueCents).toEqual([0, 5_100, 12_100, 9_075]);
    expect(s.positions[0]!.quality).toBe('estimated');
    expect(s.incomplete).toEqual([
      {
        accountId: 'a',
        securityId: 's',
        quality: 'estimated',
        days: 3,
        from: '2026-03-03',
        to: '2026-03-06',
      },
    ]);
  });

  it('estimated: the cost of a snapshot plus later trades; foreign cost uses the rate of the day', () => {
    const snapshots = [{ date: '2026-01-02', unitsE8: 4e8 }];
    const trades = [buy('2026-01-02', 99, 1), buy('2026-01-06', 1, 10)];
    const cost = {
      currency: 'USD',
      snapshots: [{ date: '2026-01-02', costBasisCents: 40_000 }],
      trades,
    };
    // The trade on the snapshot day is inside the snapshot; then 40000 + 1000 USD cents.
    expect(costBasisOnDay(snapshots, cost, '2026-01-05')).toBe(40_000);
    expect(costBasisOnDay(snapshots, cost, '2026-01-06')).toBe(41_000);
    const s = dailyValuation(
      [position({ snapshots, trades: unitsOf(trades), cost })],
      ['2026-01-04', '2026-01-06'],
      rates,
    );
    // 400,00 USD x 0,90 (rate of 01.01.) and 410,00 USD x 0,95 (rate of 05.01.).
    expect(s.positions[0]!.valueCents).toEqual([36_000, 38_950]);
  });

  it('missing: no price and no cost basis adds nothing and is flagged, never thrown', () => {
    const snapshots = [{ date: '2026-03-02', unitsE8: 3e8 }];
    const noCost = position({
      snapshots,
      trades: [],
      cost: {
        currency: 'EUR',
        snapshots: [{ date: '2026-03-02', costBasisCents: null }],
        trades: [],
      },
    });
    const s = dailyValuation([noCost], ['2026-03-03'], rates);
    expect(s.totalCents).toEqual([0]);
    expect(s.positions[0]!.quality).toBe('missing');
    expect(s.incomplete).toEqual([expect.objectContaining({ quality: 'missing', days: 1 })]);
    // Without any cost data at all it is the same.
    const { cost: _omit, ...bareInput } = position();
    void _omit;
    const bare = dailyValuation([bareInput], ['2026-03-03'], rates);
    expect(bare.positions[0]!.quality).toBe('missing');
    // Foreign cost without a rate cannot be converted.
    const noRate = position({
      cost: { currency: 'CHF', snapshots: [], trades: [buy('2026-03-02', 10, 50)] },
    });
    expect(dailyValuation([noRate], ['2026-03-03'], rates).positions[0]!.quality).toBe('missing');
  });

  it('expired or knocked-out positions without units contribute nothing and are not flagged', () => {
    const trades = [buy('2026-03-02', 10, 50), sell('2026-03-05', 10, 0)];
    const p = position({
      trades: unitsOf(trades),
      cost: { currency: 'EUR', snapshots: [], trades },
    });
    const s = dailyValuation([p], ['2026-03-04', '2026-03-06', '2026-03-07'], rates);
    expect(s.positions[0]!.valueCents).toEqual([5_000, 0, 0]);
    // Only the held day is estimated.
    expect(s.incomplete).toEqual([expect.objectContaining({ days: 1, from: '2026-03-04' })]);
  });

  it('exact results are unchanged when every price exists (no flag, no incomplete)', () => {
    const prices = [eurPrice('2026-03-01', 55)];
    const s = dailyValuation([position({ prices })], ['2026-03-03'], rates);
    expect(s.totalCents).toEqual([55_000]);
    expect(s.positions[0]!.quality).toBe('exact');
    expect(s.incomplete).toEqual([]);
  });

  it('worstQuality orders exact < stale < estimated < missing', () => {
    expect(worstQuality('exact', 'stale')).toBe('stale');
    expect(worstQuality('estimated', 'stale')).toBe('estimated');
    expect(worstQuality('estimated', 'missing')).toBe('missing');
    expect(worstQuality('exact', 'exact')).toBe('exact');
  });
});

const t = (p: Partial<SeriesTrade> & Pick<SeriesTrade, 'date' | 'kind'>): SeriesTrade => ({
  unitsE8: 0,
  amountCents: 0,
  feeCents: 0,
  taxCents: 0,
  ...p,
});

describe('cash flows (Portfolio Performance semantics)', () => {
  it('securities-only view: buy in, sale and dividend out, costs as inflow, split none', () => {
    expect(
      securityFlowCents(
        t({ date: 'd', kind: 'buy', unitsE8: 1, amountCents: 100_000, feeCents: 500 }),
      ),
    ).toBe(100_500);
    expect(
      securityFlowCents(
        t({
          date: 'd',
          kind: 'sell',
          unitsE8: -1,
          amountCents: 60_000,
          feeCents: 500,
          taxCents: 1_000,
        }),
      ),
    ).toBe(-58_500);
    expect(
      securityFlowCents(t({ date: 'd', kind: 'dividend', amountCents: 2_000, taxCents: 500 })),
    ).toBe(-1_500);
    expect(securityFlowCents(t({ date: 'd', kind: 'fee', amountCents: 300 }))).toBe(300);
    expect(securityFlowCents(t({ date: 'd', kind: 'tax', amountCents: 200 }))).toBe(200);
    expect(securityFlowCents(t({ date: 'd', kind: 'split', unitsE8: 5 }))).toBe(0);
  });

  it('merges a day, converts foreign currency at the rate of the day and drops zero flows', () => {
    const flows = securityFlows(
      [
        t({ date: '2026-01-06', kind: 'buy', unitsE8: 1, amountCents: 10_000, currency: 'USD' }),
        t({ date: '2026-01-06', kind: 'fee', amountCents: 100 }),
        t({ date: '2026-01-02', kind: 'split', unitsE8: 3 }),
        t({ date: '2026-01-03', kind: 'buy', unitsE8: 1, amountCents: 5_000 }),
      ],
      rates,
    );
    // 100,00 USD x 0,95 = 95,00 EUR, plus the 1,00 EUR fee.
    expect(flows).toEqual([
      { date: '2026-01-03', cents: 5_000 },
      { date: '2026-01-06', cents: 9_600 },
    ]);
  });

  it('depot view: only transfers across the boundary count', () => {
    expect(
      depotFlows(
        [
          { date: '2026-01-02', cents: 50_000 },
          { date: '2026-01-02', cents: -10_000 },
          { date: '2026-01-05', cents: 1_000, currency: 'USD' },
        ],
        rates,
      ),
    ).toEqual([
      { date: '2026-01-02', cents: 40_000 },
      { date: '2026-01-05', cents: 950 },
    ]);
  });

  it('market move is the value change minus the gross money traded in', () => {
    // Value +10.000; bought for 4.000 (fee 50 is not market), sold 1.000: market = 10.000 - 3.000.
    expect(
      dailyMarketMoveCents(
        10_000,
        [
          t({ date: 'd', kind: 'buy', unitsE8: 1, amountCents: 4_000, feeCents: 50 }),
          t({ date: 'd', kind: 'sell', unitsE8: -1, amountCents: 1_000 }),
          t({ date: 'd', kind: 'dividend', amountCents: 500 }),
        ],
        rates,
      ),
    ).toBe(7_000);
  });
});
