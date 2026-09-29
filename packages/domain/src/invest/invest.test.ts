import { describe, expect, it } from 'vitest';
import {
  chainReturns,
  costBasisCents,
  marketMoveCents,
  marketValueCents,
  monthlyPortfolioReturn,
  terCostCents,
  unitsFor,
  unitsHeld,
} from './invest';

describe('units and market value (exact integer arithmetic)', () => {
  it('value = units x price, rounded to cents, without float drift on large positions', () => {
    // 6.850.000.000 e-8 units (68,5 units) at 1.000,000000 EUR = 68.500,00 EUR
    expect(marketValueCents(6_850_000_000, 1_000_000_000)).toBe(6_850_000);
    // beyond 2^53 in the intermediate product: 685.000 units at 100,00 EUR = 68.500.000,00 EUR
    expect(marketValueCents(68_500_000_000_000, 100_000_000)).toBe(6_850_000_000);
    expect(marketValueCents(1, 1)).toBe(0);
  });

  it('unitsFor is the inverse of marketValueCents within one unit step', () => {
    for (const [c, p] of [
      [50000, 85_123_456],
      [1, 27_000_000_000],
      [123456789, 99_999_999],
    ] as const) {
      const u = unitsFor(c, p);
      expect(Math.abs(marketValueCents(u, p) - c)).toBeLessThanOrEqual(1);
    }
  });

  it('rejects a non-positive price', () => {
    expect(() => unitsFor(100, 0)).toThrow(RangeError);
  });
});

describe('unitsHeld', () => {
  const snapshot = { asOf: '2023-09-30', unitsE8: 1_000_000_000 };
  const trades = [
    { date: '2023-10-31', unitsE8: 200_000_000 },
    { date: '2023-11-30', unitsE8: -50_000_000 },
    { date: '2023-09-15', unitsE8: 999 }, // before the snapshot: already inside it
  ];
  it('is the latest snapshot plus the trades after it, up to the date', () => {
    expect(unitsHeld(snapshot, trades, '2023-10-31')).toBe(1_200_000_000);
    expect(unitsHeld(snapshot, trades, '2023-12-31')).toBe(1_150_000_000);
    expect(unitsHeld(snapshot, trades, '2023-10-15')).toBe(1_000_000_000);
  });
  it('starts from zero without a snapshot', () => {
    expect(unitsHeld(undefined, trades, '2023-12-31')).toBe(200_000_000 - 50_000_000 + 999);
  });
});

describe('returns (TTWROR)', () => {
  it('a month return weights each position by its value at the previous month end', () => {
    const r = monthlyPortfolioReturn([
      { previousValueCents: 900000, returnRate: 0.02 },
      { previousValueCents: 100000, returnRate: -0.1 },
    ]);
    expect(r).toBeCloseTo((900000 * 0.02 - 100000 * 0.1) / 1000000, 12);
  });

  it('chains monthly returns geometrically, independent of cash flows', () => {
    expect(chainReturns([0.1, 0.1])).toBeCloseTo(0.21, 12);
    expect(chainReturns([])).toBe(0);
    expect(chainReturns([-0.5, 1])).toBeCloseTo(0, 12);
  });

  it('no opening value means no return', () => {
    expect(monthlyPortfolioReturn([])).toBe(0);
  });
});

describe('market move and cost', () => {
  it('market move is the value change without the money that was put in', () => {
    expect(
      marketMoveCents({
        previousValueCents: 100000,
        valueCents: 112500,
        netContributionCents: 10000,
      }),
    ).toBe(2500);
  });

  it('cost basis adds buys and fees and reduces proportionally on sales (average cost)', () => {
    const cost = costBasisCents({ unitsE8: 1_000_000_000, costBasisCents: 92000 }, [
      { unitsE8: 500_000_000, amountCents: 60000, feeCents: 100, kind: 'buy' },
      { unitsE8: -750_000_000, amountCents: 90000, feeCents: 0, kind: 'sell' },
    ]);
    // 92.000 + 60.100 = 152.100 for 1,5 units; selling half of it removes 76.050
    expect(cost).toBe(76050);
  });

  it('fund cost is the average value times the TER, summed monthly', () => {
    // 12 months of 100.000,00 EUR at 0,20 % = 200,00 EUR
    expect(
      terCostCents(
        Array.from({ length: 12 }, () => 10_000_000),
        20,
      ),
    ).toBe(20000);
    expect(terCostCents([], 20)).toBe(0);
  });
});
