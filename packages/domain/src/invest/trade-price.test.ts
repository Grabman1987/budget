import { describe, expect, it } from 'vitest';
import { dailyValuation, pickTradePrice, type PositionInput, type SeriesTrade } from './series';

const trades: SeriesTrade[] = [
  {
    date: '2026-01-03',
    kind: 'buy',
    unitsE8: 2e8,
    amountCents: 2_000,
    feeCents: 100,
    taxCents: 50,
  },
  {
    date: '2026-01-05',
    kind: 'sell',
    unitsE8: -1e8,
    amountCents: 1_500,
    feeCents: 80,
    taxCents: 20,
  },
];
const position: PositionInput = {
  accountId: 'depot',
  securityId: 'synthetic',
  snapshots: [{ date: '2026-01-01', unitsE8: 1e8 }],
  trades: [],
  prices: [],
  cost: { currency: 'EUR', snapshots: [{ date: '2026-01-01', costBasisCents: 700 }], trades },
};

describe('implied trade valuation', () => {
  it('rejects execution prices outside the safe integer range', () => {
    expect(() =>
      pickTradePrice(
        [{ ...trades[0]!, unitsE8: 1, amountCents: Number.MAX_SAFE_INTEGER }],
        '2026-01-04',
      ),
    ).toThrow(RangeError);
  });
  it('does not use a later stored quote ahead of cost when no execution is available', () => {
    const p = {
      ...position,
      cost: { ...position.cost!, trades: [] },
      prices: [{ date: '2026-01-03', priceMicro: 20_000_000, currency: 'EUR' }],
    };
    expect(dailyValuation([p], ['2026-01-01'], new Map()).totalCents).toEqual([700]);
  });
  it('prefers a real price, then latest trade before, earliest trade after, then cost', () => {
    const value = (p: PositionInput, day: string) => dailyValuation([p], [day], new Map());
    expect(
      value(
        { ...position, prices: [{ date: '2026-01-01', priceMicro: 20_000_000, currency: 'EUR' }] },
        '2026-01-06',
      ).totalCents,
    ).toEqual([2_000]);
    expect(value(position, '2026-01-06').totalCents).toEqual([1_500]);
    expect(value(position, '2026-01-04').totalCents).toEqual([1_000]);
    expect(value(position, '2026-01-01').totalCents).toEqual([1_000]);
    expect(
      value({ ...position, cost: { ...position.cost!, trades: [] } }, '2026-01-06').totalCents,
    ).toEqual([700]);
    expect(value(position, '2026-01-06').incomplete).toEqual([]);
  });

  it('uses trade currency and ignores splits and cash-only trades', () => {
    const p = {
      ...position,
      cost: {
        ...position.cost!,
        currency: 'USD',
        trades: [
          ...trades,
          { ...trades[0]!, date: '2026-01-06', kind: 'split' as const, amountCents: 0 },
          { ...trades[0]!, date: '2026-01-07', kind: 'dividend' as const, unitsE8: 0 },
        ],
      },
    };
    expect(
      dailyValuation(
        [p],
        ['2026-01-07'],
        new Map([['USD', [{ date: '2026-01-01', rateMicro: 900_000 }]]]),
      ).totalCents,
    ).toEqual([1_350]);
  });

  it('rounds micro prices and signed cent values half away from zero with large integer products', () => {
    const p = {
      ...position,
      snapshots: [{ date: '2026-01-01', unitsE8: 1e8 }],
      cost: {
        ...position.cost!,
        trades: [{ ...trades[0]!, unitsE8: 2e12, amountCents: 24_691_357 }],
      },
    };
    expect(dailyValuation([p], ['2026-01-04'], new Map()).totalCents).toEqual([1_235]);
    expect(
      dailyValuation(
        [{ ...p, snapshots: [{ date: '2026-01-01', unitsE8: -1e8 }] }],
        ['2026-01-04'],
        new Map(),
      ).totalCents,
    ).toEqual([-1_235]);
    const half = {
      ...p,
      snapshots: [{ date: '2026-01-01', unitsE8: 2e12 }],
      cost: { ...p.cost, trades: [{ ...trades[0]!, unitsE8: 2e12, amountCents: 1 }] },
    };
    expect(dailyValuation([half], ['2026-01-04'], new Map()).totalCents).toEqual([1]);
    expect(pickTradePrice(half.cost.trades, '2026-01-04')?.price.priceMicro).toBe(1);
    const centHalf = {
      ...p,
      cost: { ...p.cost, trades: [{ ...trades[0]!, unitsE8: 2e8, amountCents: 1 }] },
    };
    expect(dailyValuation([centHalf], ['2026-01-04'], new Map()).totalCents).toEqual([1]);
    expect(
      dailyValuation(
        [{ ...centHalf, snapshots: [{ date: '2026-01-01', unitsE8: -1e8 }] }],
        ['2026-01-04'],
        new Map(),
      ).totalCents,
    ).toEqual([-1]);
  });
});
