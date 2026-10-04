import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, holding, price, security, trade } from '../schema';
import {
  holdingValuesAsOf,
  netWorthAsOf,
  netWorthDaily,
  netWorthValuationAsOf,
  valuationSeries,
} from './portfolio';
import { namedNotes, runWithValuationNotes } from './valuation-notes';

/**
 * Regression: an instrument that was held in the past and is closed or expired now (a knocked-out
 * warrant) has no quote at all and `prices_enabled = 0`. Every historical valuation on a day it was
 * held used to throw, and with it every net-worth and report page. Synthetic data only.
 */
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  const db = opened.db;
  db.insert(account)
    .values([
      {
        id: 'cash',
        name: 'Synthetic cash',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
        openingBalanceCents: 100_000,
      },
      {
        id: 'depot',
        name: 'Synthetic depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-01-01',
      },
    ])
    .run();
  db.insert(security)
    .values([
      { id: 'etf', name: 'Synthetic ETF', kind: 'etf', currency: 'EUR' },
      { id: 'ko', name: 'Synthetic warrant', kind: 'other', currency: 'EUR', pricesEnabled: false },
    ])
    .run();
  // The ETF is held all the time and priced every day of the window.
  db.insert(holding)
    .values({
      id: 'etf-h',
      accountId: 'depot',
      securityId: 'etf',
      asOf: '2026-01-01',
      unitsE8: 10e8,
      costBasisCents: 90_000,
    })
    .run();
  for (let day = 1; day <= 20; day++)
    db.insert(price)
      .values({
        securityId: 'etf',
        date: `2026-01-${String(day).padStart(2, '0')}`,
        priceMicro: 100_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
  // The warrant: bought on 6.1. for 200,00 + 1,00 fee, knocked out (sold for nothing) on 14.1.
  db.insert(trade)
    .values([
      {
        id: 'ko-buy',
        securityId: 'ko',
        accountId: 'depot',
        date: '2026-01-06',
        kind: 'buy',
        unitsE8: 100e8,
        amountCents: 20_000,
        feeCents: 100,
      },
      {
        id: 'ko-out',
        securityId: 'ko',
        accountId: 'depot',
        date: '2026-01-14',
        kind: 'sell',
        unitsE8: -100e8,
        amountCents: 0,
      },
    ])
    .run();
});
afterEach(() => opened.close());

const ETF = 100_000; // 10 units x 100,00
describe('held in the past, never priced', () => {
  it('net worth on a day it was held works and values it at cost, flagged estimated', () => {
    const during = netWorthAsOf(opened.db, '2026-01-10');
    expect(during.totalCents).toBe(100_000 + ETF + 20_100);
    expect(during.incomplete).toEqual([
      expect.objectContaining({ securityId: 'ko', quality: 'estimated' }),
    ]);
    expect(
      holdingValuesAsOf(opened.db, '2026-01-10').map((h) => [h.securityId, h.quality]),
    ).toEqual([
      ['etf', 'exact'],
      ['ko', 'estimated'],
    ]);
    // Before it was bought and after it was knocked out it contributes nothing and is no issue.
    for (const day of ['2026-01-05', '2026-01-14', '2026-01-20']) {
      const valuation = netWorthValuationAsOf(opened.db, day);
      expect(valuation.totalCents).toBe(100_000 + ETF);
      expect(valuation.incomplete).toEqual([]);
    }
  });

  it('the daily series spans the whole holding window without failing', () => {
    const series = valuationSeries(opened.db, { from: '2026-01-04', to: '2026-01-16' });
    const warrant = series.positions.find((p) => p.securityId === 'ko')!;
    expect(warrant.quality).toBe('estimated');
    // 6.1. to 13.1.: eight held days at the cost, nothing before and after.
    expect(warrant.valueCents).toEqual([0, 0, ...Array(8).fill(20_100), 0, 0, 0]);
    expect(series.incomplete).toEqual([
      {
        accountId: 'depot',
        securityId: 'ko',
        quality: 'estimated',
        days: 8,
        from: '2026-01-06',
        to: '2026-01-13',
      },
    ]);
    const days = netWorthDaily(opened.db, '2026-01-02', '2026-01-18');
    expect(days).toHaveLength(17);
    expect(days.find((d) => d.date === '2026-01-10')!.netWorthCents).toBe(
      netWorthAsOf(opened.db, '2026-01-10').totalCents,
    );
  });

  it('series and point valuation agree on every day', () => {
    const series = valuationSeries(opened.db, { from: '2026-01-02', to: '2026-01-18' });
    series.days.forEach((day, i) => {
      expect(netWorthAsOf(opened.db, day).totalCents - 100_000, day).toBe(series.totalCents[i]);
    });
  });

  it('reports the securities of one request as notes, merged and named', () => {
    const { notes, named } = runWithValuationNotes((read) => {
      netWorthAsOf(opened.db, '2026-01-10');
      netWorthAsOf(opened.db, '2026-01-12');
      valuationSeries(opened.db, { from: '2026-01-04', to: '2026-01-16' });
      const found = read();
      return { notes: found, named: namedNotes(opened.db, found) };
    });
    expect(notes).toEqual([
      { securityId: 'ko', quality: 'estimated', from: '2026-01-06', to: '2026-01-13' },
    ]);
    expect(named[0]!.name).toBe('Synthetic warrant');
    // Outside a request nothing is collected.
    expect(() => netWorthAsOf(opened.db, '2026-01-10')).not.toThrow();
  });
});
