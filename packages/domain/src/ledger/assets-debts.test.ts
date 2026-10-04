import { describe, expect, it } from 'vitest';
import { assetsDebtsOf, monthEnds, netWorthChange, type AccountMeta } from './assets-debts';

const meta: Record<string, AccountMeta> = {
  giro: { id: 'giro', name: 'Giro', type: 'checking' },
  tg: { id: 'tg', name: 'Tagesgeld', type: 'savings' },
  depot: { id: 'depot', name: 'Depot', type: 'brokerage' },
  card: { id: 'card', name: 'Karte', type: 'credit_card' },
  loan: { id: 'loan', name: 'Kredit', type: 'loan' },
  cash: { id: 'cash', name: 'Bargeld', type: 'cash' },
  odd: { id: 'odd', name: 'Sonderkonto', type: 'mystery' },
};
const metaOf = (id: string) => meta[id];

describe('assetsDebtsOf', () => {
  it('puts loans and credit cards in the red under debts and adds up to the net worth', () => {
    const day = assetsDebtsOf(
      { giro: 120_000, tg: 500_000, depot: 800_000, card: -45_000, loan: -300_000 },
      metaOf,
    );
    expect(day.assetsCents).toBe(1_420_000);
    expect(day.debtsCents).toBe(-345_000);
    expect(day.netCents).toBe(1_420_000 - 345_000);
    expect(day.assets.map((a) => a.accountId)).toEqual(['depot', 'tg', 'giro']);
    expect(day.debts.map((a) => a.accountId)).toEqual(['loan', 'card']);
    expect(day.debts[0]).toMatchObject({ typeLabel: 'Kredit', valueCents: -300_000 });
  });

  it('a cash account below zero is a debt, an overpaid card an asset', () => {
    const day = assetsDebtsOf({ giro: -12_345, card: 5_000, tg: 100_000 }, metaOf);
    expect(day.debts.map((a) => [a.accountId, a.valueCents])).toEqual([['giro', -12_345]]);
    expect(day.assets.map((a) => a.accountId)).toEqual(['tg', 'card']);
    expect(day.netCents).toBe(-12_345 + 5_000 + 100_000);
  });

  it('leaves accounts at zero out and keeps unknown types under their key', () => {
    const day = assetsDebtsOf({ cash: 0, odd: 700 }, metaOf);
    expect(day.assets).toEqual([
      {
        accountId: 'odd',
        name: 'Sonderkonto',
        type: 'mystery',
        typeLabel: 'mystery',
        valueCents: 700,
      },
    ]);
    expect(day.debts).toEqual([]);
  });

  it('no accounts, no figures', () => {
    expect(assetsDebtsOf({}, metaOf)).toEqual({
      assetsCents: 0,
      debtsCents: 0,
      netCents: 0,
      assets: [],
      debts: [],
    });
  });

  it('orders ties by name and refuses an unknown account', () => {
    const day = assetsDebtsOf({ giro: 100, tg: 100 }, metaOf);
    expect(day.assets.map((a) => a.name)).toEqual(['Giro', 'Tagesgeld']);
    expect(() => assetsDebtsOf({ ghost: 1 }, metaOf)).toThrow(RangeError);
  });
});

describe('netWorthChange', () => {
  it('is the difference in cents and relative to the start', () => {
    const change = netWorthChange(1_000_000, 1_250_000);
    expect(change).toEqual({
      startCents: 1_000_000,
      endCents: 1_250_000,
      deltaCents: 250_000,
      deltaRate: 0.25,
    });
  });

  it('uses the size of a negative start, so paying down debt shows as a gain', () => {
    expect(netWorthChange(-100_000, -50_000).deltaRate).toBe(0.5);
    expect(netWorthChange(100_000, -50_000).deltaRate).toBe(-1.5);
  });

  it('has no percentage from a start of zero', () => {
    expect(netWorthChange(0, 500).deltaRate).toBeNull();
    expect(netWorthChange(0, 500).deltaCents).toBe(500);
  });
});

describe('monthEnds', () => {
  it('reads every month end of a calendar range and today for the running month', () => {
    expect(monthEnds('2026-06-30', '2026-09-17')).toEqual([
      { month: '2026-07', date: '2026-07-31', partial: false },
      { month: '2026-08', date: '2026-08-31', partial: false },
      { month: '2026-09', date: '2026-09-17', partial: true },
    ]);
  });

  it('starts in the month of the start day when it is the first of the month', () => {
    expect(monthEnds('2023-10-01', '2023-12-31').map((m) => m.month)).toEqual([
      '2023-10',
      '2023-11',
      '2023-12',
    ]);
  });

  it('treats the last day of a month as a complete month', () => {
    expect(monthEnds('2026-07-31', '2026-08-31')).toEqual([
      { month: '2026-08', date: '2026-08-31', partial: false },
    ]);
  });

  it('an empty window still reads its own month', () => {
    expect(monthEnds('2026-09-17', '2026-09-17')).toEqual([
      { month: '2026-09', date: '2026-09-17', partial: true },
    ]);
  });
});
