import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, holding, price, security } from '../schema';
import {
  accountValuesAsOf,
  holdingValuesAsOf,
  netWorthAsOf,
  netWorthDaily,
  netWorthValuationAsOf,
  valuationSeries,
} from './portfolio';
import { portfolioPositions } from './portfolio-positions';
import { portfolioSummary, positionCostDetailsAsOf, positionLines } from './portfolio-summary';
let opened: OpenedDatabase;
const TODAY = '2026-09-17';
beforeEach(() => {
  opened = createTestDatabase();
  opened.db
    .insert(account)
    .values({
      id: 'depot',
      name: 'Synthetic depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-09-01',
    })
    .run();
  opened.db
    .insert(security)
    .values({ id: 's', name: 'Synthetic instrument', kind: 'stock', currency: 'EUR' })
    .run();
  opened.db
    .insert(holding)
    .values({
      id: 'h',
      accountId: 'depot',
      securityId: 's',
      asOf: '2026-09-01',
      unitsE8: 100_000_000,
      costBasisCents: 10_000,
    })
    .run();
});
afterEach(() => opened.close());
const quote = (date: string, priceMicro: number) =>
  opened.db
    .insert(price)
    .values({ securityId: 's', date, priceMicro, currency: 'EUR', source: 'manual' })
    .run();
const positions = () => portfolioPositions(opened.db, TODAY);
describe('held positions without market quotes', () => {
  it('keeps known basis but exposes null current values and explicit missing-price metadata', () => {
    const valuation = netWorthValuationAsOf(opened.db, TODAY);
    expect(valuation).toMatchObject({
      totalCents: null,
      byAccount: { depot: null },
      holdingsByAccount: { depot: null },
      missingFxCurrencies: [],
      missingPriceSecurityIds: ['s'],
      missingPriceByAccount: { depot: ['s'] },
    });
    expect(positions()).toMatchObject({ valueCents: null, costCents: 10000, gainCents: null });
    expect(positionCostDetailsAsOf(opened.db, TODAY)).toEqual([
      expect.objectContaining({
        accountId: 'depot',
        securityId: 's',
        costCents: 10000,
        gainCents: null,
        basisStatus: 'known',
      }),
    ]);
    for (const read of [holdingValuesAsOf, netWorthAsOf, accountValuesAsOf, positionLines])
      expect(() => read(opened.db, TODAY)).toThrow(/price/i);
    expect(() => portfolioSummary(opened.db, { today: TODAY })).toThrow(/price/i);
  });
  it('a quote of120 establishes current value/gain but cannot invent a prior value or120 market gain', () => {
    quote(TODAY, 120_000_000);
    expect(positions()).toMatchObject({ valueCents: 12000, costCents: 10000, gainCents: 2000 });
    expect(netWorthAsOf(opened.db, TODAY).totalCents).toBe(12000);
    expect(() => valuationSeries(opened.db, { from: '2026-09-16', to: TODAY })).toThrow(/price/i);
    expect(() => netWorthDaily(opened.db, TODAY, TODAY)).toThrow(/price/i);
    expect(() => portfolioSummary(opened.db, { today: TODAY })).toThrow(/price/i);
    quote('2026-09-16', 100_000_000);
    expect(valuationSeries(opened.db, { from: '2026-09-16', to: TODAY }).totalCents).toEqual([
      10000, 12000,
    ]);
    expect(netWorthDaily(opened.db, TODAY, TODAY)).toEqual([
      expect.objectContaining({
        netWorthCents: 12000,
        changeCents: 2000,
        marketCents: 2000,
        ownCents: 0,
      }),
    ]);
  });
  it('retains every missing-price and missing-FX reason while keeping unaffected account values known', () => {
    opened.db
      .insert(account)
      .values({
        id: 'cash',
        name: 'Synthetic cash',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-09-01',
        openingBalanceCents: 5000,
      })
      .run();
    opened.db
      .insert(security)
      .values({ id: 'chf', name: 'Synthetic CHF instrument', kind: 'stock', currency: 'CHF' })
      .run();
    opened.db
      .insert(holding)
      .values({
        id: 'chf-held',
        accountId: 'depot',
        securityId: 'chf',
        asOf: '2026-09-01',
        unitsE8: 100_000_000,
        costBasisCents: 2000,
      })
      .run();
    opened.db
      .insert(price)
      .values({
        securityId: 'chf',
        date: '2026-09-01',
        priceMicro: 30_000_000,
        currency: 'CHF',
        source: 'manual',
      })
      .run();
    expect(netWorthValuationAsOf(opened.db, TODAY)).toMatchObject({
      totalCents: null,
      byAccount: { cash: 5000, depot: null },
      holdingsByAccount: { depot: null },
      missingFxCurrencies: ['CHF'],
      missingFxByAccount: { depot: ['CHF'] },
      missingPriceSecurityIds: ['s'],
      missingPriceByAccount: { depot: ['s'] },
    });
    expect(positionCostDetailsAsOf(opened.db, TODAY)).toEqual([
      expect.objectContaining({ securityId: 's', costCents: 10000, gainCents: null }),
      expect.objectContaining({ securityId: 'chf', costCents: 2000, gainCents: null }),
    ]);
    expect(positions()).toMatchObject({ valueCents: null, costCents: 12000, gainCents: null });
  });
  it('zero-held positions need no quote', () => {
    opened.db.update(holding).set({ unitsE8: 0 }).run();
    expect(netWorthAsOf(opened.db, TODAY).totalCents).toBe(0);
    expect(holdingValuesAsOf(opened.db, TODAY)).toEqual([]);
    expect(netWorthDaily(opened.db, TODAY, TODAY)[0]).toMatchObject({
      marketCents: 0,
      changeCents: 0,
    });
  });
});
