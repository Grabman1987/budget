import { describe, expect, it } from 'vitest';
import { documentedRealizedGain, documentedCostOf, type ProductTrade } from './cost';

const E8 = 100_000_000;
const row = (
  date: string,
  kind: ProductTrade['kind'],
  units: number,
  cents: number,
): ProductTrade => ({
  date,
  kind,
  unitsE8: units * E8,
  amountCents: cents,
  feeCents: 0,
  taxCents: 0,
});

describe('documented cost arithmetic', () => {
  it('distinguishes moving average from FIFO for differently priced purchases', () => {
    const trades = [
      row('2026-01-01', 'buy', 1, 10_000),
      row('2026-01-02', 'buy', 1, 20_000),
      row('2026-01-03', 'sell', -1, 18_000),
    ];
    expect(documentedRealizedGain(trades)).toEqual({ cents: 3_000, complete: true });
    expect(documentedRealizedGain(trades, undefined, 'fifo')).toEqual({
      cents: 8_000,
      complete: true,
    });
  });

  it('retains an earlier documented gain but marks an uncovered sale incomplete', () => {
    const trades = [
      row('2026-01-01', 'buy', 1, 10_000),
      row('2026-01-02', 'sell', -1, 12_000),
      row('2026-01-03', 'sell', -1, 30_000),
    ];
    expect(documentedRealizedGain(trades)).toEqual({ cents: 2_000, complete: false });
  });

  it('keeps a mixed unknown average pool unknown and restarts cost after closure', () => {
    const trades = [
      row('2026-01-01', 'buy', 1, 10_000),
      row('2026-01-02', 'sell', -2, 30_000),
      row('2026-01-03', 'buy', 1, 10_000),
      row('2026-01-04', 'sell', -1, 12_000),
    ];
    expect(documentedRealizedGain(trades, { unitsE8: E8, costBasisCents: null })).toEqual({
      cents: 2_000,
      complete: false,
    });
    expect(documentedCostOf(trades, { unitsE8: E8, costBasisCents: null })).toMatchObject({
      unitsE8: 0,
      costBasisCents: 0,
    });
    expect(documentedCostOf(trades.slice(0, 1), { unitsE8: E8, costBasisCents: null })).toBeNull();
  });

  it('scales unknown and known FIFO quantities through a split without guessing old cost', () => {
    const trades = [
      row('2026-01-01', 'buy', 1, 10_000),
      row('2026-01-02', 'split', 2, 0),
      row('2026-01-03', 'sell', -2, 30_000),
      row('2026-01-04', 'sell', -2, 30_000),
    ];
    expect(documentedRealizedGain(trades, { unitsE8: E8, costBasisCents: null }, 'fifo')).toEqual({
      cents: 20_000,
      complete: false,
    });
  });
});
