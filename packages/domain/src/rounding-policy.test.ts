import { describe, expect, it } from 'vitest';
import { averageRateCents } from './goals/goals';
import { changeBp } from './heute/net-worth';
import { averageCost, terCostCents, type CostTrade } from './invest/invest';
import { ratioBp } from './kpi/ratios';

/**
 * Call sites of the rounding policy (docs/rounding.md): half away from zero, symmetric, exact.
 * Negative half-way ties are the only place where the former Math.round (ties towards +Infinity)
 * gave another result.
 */
describe('derived cents follow one rounding policy', () => {
  it('rounds the average monthly rate half away from zero', () => {
    expect(averageRateCents([1, 0])).toBe(1);
    expect(averageRateCents([-1, 0])).toBe(-1); // was 0 (Math.round(-0.5))
    expect(averageRateCents([-3, 0])).toBe(-2); // was -1
    expect(averageRateCents([])).toBe(0);
  });

  it('rounds the change in basis points half away from zero', () => {
    expect(changeBp(20_001, 20_000)).toBe(1); // +0.5 bp
    expect(changeBp(19_999, 20_000)).toBe(-1); // -0.5 bp, was 0
    expect(changeBp(110, 100)).toBe(1000);
    expect(changeBp(-90, -100)).toBe(1000); // the previous value counts by its magnitude
    expect(changeBp(5, 0)).toBeNull();
  });

  it('keeps ratioBp symmetric', () => {
    expect(ratioBp(1, 20_000)).toBe(1);
    expect(ratioBp(-1, 20_000)).toBe(-1);
    expect(ratioBp(1, 0)).toBeNull();
  });

  it('rounds fund costs half away from zero', () => {
    expect(terCostCents([60_000], 1)).toBe(1);
    expect(terCostCents([-60_000], 1)).toBe(-1); // was 0
    expect(terCostCents([1_000_000], 20)).toBe(167); // 166.67
  });

  it('computes the average cost of units sold exactly beyond 2^53 intermediates', () => {
    const sell: CostTrade = {
      kind: 'sell',
      unitsE8: -2_000_000_000_000,
      amountCents: 0,
      feeCents: 0,
    };
    const result = averageCost(
      { unitsE8: 3_000_000_000_000, costBasisCents: 9_007_199_254_740_990 },
      [sell],
    );
    expect(result.costBasisCents).toBe(3_002_399_751_580_330);
    expect(result.realizedGainCents).toBe(-6_004_799_503_160_660);
  });
});
