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

  it('no units before the first trade, no price means value 0, a held position needs a rate', () => {
    const base = { accountId: 'a', securityId: 's', snapshots: [], prices: [] };
    const s = dailyValuation(
      [{ ...base, trades: [{ date: '2026-01-02', unitsE8: 1e8 }] }],
      eachDay('2026-01-01', '2026-01-03'),
      rates,
    );
    expect(s.positions[0]!.unitsE8).toEqual([0, 1e8, 1e8]);
    expect(s.totalCents).toEqual([0, 0, 0]);
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
    ).toThrow(/exchange rate for CHF/);
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
