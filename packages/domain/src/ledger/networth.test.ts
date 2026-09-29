import { describe, expect, it } from 'vitest';
import { netWorthAttribution, netWorthSeries } from './networth';

describe('net worth', () => {
  it('is the sum of account balances (debts negative) plus investments at market value', () => {
    const series = netWorthSeries({
      dates: ['2026-08-31', '2026-09-17'],
      balancesAt: (d) =>
        d === '2026-08-31'
          ? new Map([
              ['giro', 100000],
              ['kredit', -1250000],
            ])
          : new Map([
              ['giro', 161700],
              ['kredit', -1217600],
            ]),
      investmentValueAt: (d) => (d === '2026-08-31' ? 8600000 : 8800000),
    });
    expect(series).toEqual([
      { date: '2026-08-31', netWorthCents: 100000 - 1250000 + 8600000 },
      { date: '2026-09-17', netWorthCents: 161700 - 1217600 + 8800000 },
    ]);
  });

  it('splits the change into own contribution and market', () => {
    expect(
      netWorthAttribution({
        previousCents: 8000000,
        currentCents: 8473000,
        marketMoveCents: 250000,
      }),
    ).toEqual({
      changeCents: 473000,
      marketCents: 250000,
      ownCents: 223000,
    });
  });
});
