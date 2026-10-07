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
  it('values a position without any quote at its cost basis, flagged as an estimate', () => {
    const valuation = netWorthValuationAsOf(opened.db, TODAY);
    expect(valuation).toMatchObject({
      totalCents: 10000,
      byAccount: { depot: 10000 },
      holdingsByAccount: { depot: 10000 },
      missingFxCurrencies: [],
      missingPriceSecurityIds: [],
      incomplete: [
        {
          accountId: 'depot',
          securityId: 's',
          quality: 'estimated',
          days: 1,
          from: TODAY,
          to: TODAY,
        },
      ],
    });
    expect(holdingValuesAsOf(opened.db, TODAY)).toEqual([
      expect.objectContaining({
        securityId: 's',
        valueCents: 10000,
        quality: 'estimated',
        priceDate: null,
      }),
    ]);
    expect(positions()).toMatchObject({ valueCents: 10000, costCents: 10000, gainCents: 0 });
    expect(positions().classes[0]!.positions[0]!.accounts[0]).toMatchObject({
      valueStatus: 'estimated',
      valueCents: 10000,
    });
    for (const read of [netWorthAsOf, accountValuesAsOf, positionLines])
      expect(() => read(opened.db, TODAY)).not.toThrow();
    expect(() => portfolioSummary(opened.db, { today: TODAY })).not.toThrow();
  });
  it('the strict rule (no estimate) keeps the quote explicitly unavailable', () => {
    const strict = { estimate: false };
    expect(netWorthValuationAsOf(opened.db, TODAY, strict)).toMatchObject({
      totalCents: null,
      byAccount: { depot: null },
      holdingsByAccount: { depot: null },
      missingPriceSecurityIds: ['s'],
      missingPriceByAccount: { depot: ['s'] },
      incomplete: [],
    });
    expect(() => valuationSeries(opened.db, { from: TODAY, to: TODAY }, strict)).toThrow(/Kurs/);
  });
  it('a position without cost basis and quote adds nothing and is flagged missing', () => {
    opened.db.update(holding).set({ costBasisCents: null }).run();
    const valuation = netWorthValuationAsOf(opened.db, TODAY);
    expect(valuation).toMatchObject({
      totalCents: 0,
      missingPriceSecurityIds: ['s'],
      missingPriceByAccount: { depot: ['s'] },
      incomplete: [expect.objectContaining({ securityId: 's', quality: 'missing' })],
    });
    expect(holdingValuesAsOf(opened.db, TODAY)).toEqual([]);
    expect(positions()).toMatchObject({ valueCents: null });
    expect(() => netWorthAsOf(opened.db, TODAY)).not.toThrow();
  });
  it('a quote of 120 sets the value; earlier days without trades retain the cost', () => {
    quote(TODAY, 120_000_000);
    expect(positions()).toMatchObject({ valueCents: 12000, costCents: 10000, gainCents: 2000 });
    expect(netWorthAsOf(opened.db, TODAY).totalCents).toBe(12000);
    // 16.09. has neither an earlier quote nor a trade: the cost remains the estimate.
    const without = valuationSeries(opened.db, { from: '2026-09-16', to: TODAY });
    expect(without.totalCents).toEqual([10000, 12000]);
    expect(without.positions[0]!.quality).toBe('estimated');
    expect(without.incomplete).toEqual([
      expect.objectContaining({ securityId: 's', quality: 'estimated', days: 1 }),
    ]);
    // Far from any quote the cost basis is used.
    expect(valuationSeries(opened.db, { from: '2026-09-02', to: '2026-09-02' }).totalCents).toEqual(
      [10000],
    );
    quote('2026-09-16', 100_000_000);
    const exact = valuationSeries(opened.db, { from: '2026-09-16', to: TODAY });
    expect(exact.totalCents).toEqual([10000, 12000]);
    expect(exact.incomplete).toEqual([]);
    expect(netWorthDaily(opened.db, TODAY, TODAY)).toEqual([
      expect.objectContaining({
        netWorthCents: 12000,
        changeCents: 2000,
        marketCents: 2000,
        ownCents: 0,
      }),
    ]);
  });
  it('retains every missing-FX reason while estimated and unaffected account values stay known', () => {
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
      missingPriceSecurityIds: [],
      incomplete: [expect.objectContaining({ securityId: 's', quality: 'estimated' })],
    });
    expect(positionCostDetailsAsOf(opened.db, TODAY)).toEqual([
      expect.objectContaining({ securityId: 's', costCents: 10000, gainCents: 0 }),
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
