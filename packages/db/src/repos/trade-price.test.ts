import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, fxRate, holding, price, security, trade } from '../schema';
import { holdingValuesAsOf, netWorthDaily, valuationSeries } from './portfolio';
import { allocationInputsAsOf } from './allocation-inputs';
import { portfolioPositions } from './portfolio-positions';
import { namedNotes, runWithValuationNotes } from './valuation-notes';

let opened: OpenedDatabase;
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
      openingDate: '2026-01-01',
    })
    .run();
  opened.db
    .insert(security)
    .values({ id: 's', name: 'Synthetic instrument', kind: 'other', currency: 'EUR' })
    .run();
  opened.db
    .insert(holding)
    .values({
      id: 'h',
      accountId: 'depot',
      securityId: 's',
      asOf: '2026-01-01',
      unitsE8: 1e8,
      costBasisCents: 700,
    })
    .run();
});
afterEach(() => opened.close());

describe('trade prices across valuation reads', () => {
  it('shares foreign execution prices across depots without moving another depot’s units', () => {
    opened.db
      .insert(account)
      .values({
        id: 'foreign',
        name: 'Synthetic foreign depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        currency: 'USD',
        openingDate: '2026-01-01',
      })
      .run();
    opened.db
      .insert(fxRate)
      .values({ currency: 'USD', date: '2026-01-01', rateMicro: 900_000 })
      .run();
    opened.db
      .insert(trade)
      .values([
        {
          id: 'foreign-buy',
          accountId: 'foreign',
          securityId: 's',
          date: '2026-01-03',
          kind: 'buy',
          unitsE8: 2e8,
          amountCents: 2_000,
          feeCents: 100,
        },
        {
          id: 'deleted-buy',
          accountId: 'foreign',
          securityId: 's',
          date: '2026-01-04',
          kind: 'buy',
          unitsE8: 1e8,
          amountCents: 3_000,
          deletedAt: '2026-01-05',
        },
      ])
      .run();
    expect(holdingValuesAsOf(opened.db, '2026-01-02')).toEqual([
      expect.objectContaining({
        accountId: 'depot',
        unitsE8: 1e8,
        valueCents: 900,
        priceCurrency: 'USD',
        quality: 'exact',
      }),
    ]);
    expect(
      valuationSeries(opened.db, { from: '2026-01-06', to: '2026-01-06', accounts: ['depot'] })
        .totalCents,
    ).toEqual([900]);
    expect(netWorthDaily(opened.db, '2026-01-02', '2026-01-02')[0]!.netWorthCents).toBe(900);
    expect(allocationInputsAsOf(opened.db, '2026-01-02').positions).toEqual([
      expect.objectContaining({ securityId: 's', valueCents: 900, valuationQuality: 'exact' }),
    ]);
    expect(portfolioPositions(opened.db, '2026-01-02').positions[0]).toMatchObject({
      valueCents: 900,
      costCents: 700,
      gainCents: 200,
    });
  });
  it('preserves the exact gross cent when the implied price lies between micro-units', () => {
    opened.db
      .insert(holding)
      .values({
        id: 'tiny-price',
        accountId: 'depot',
        securityId: 's',
        asOf: '2026-01-02',
        unitsE8: 2e12,
        costBasisCents: 700,
      })
      .run();
    opened.db
      .insert(trade)
      .values({
        id: 'tiny-execution',
        accountId: 'depot',
        securityId: 's',
        date: '2026-01-03',
        kind: 'buy',
        unitsE8: 2e12,
        amountCents: 1,
      })
      .run();
    expect(holdingValuesAsOf(opened.db, '2026-01-02')[0]!.valueCents).toBe(1);
    expect(valuationSeries(opened.db, { from: '2026-01-02', to: '2026-01-02' }).totalCents).toEqual(
      [1],
    );
  });
  it('uses future and latest past trades before cost, with real rows taking precedence', () => {
    opened.db
      .insert(trade)
      .values([
        {
          id: 'buy',
          accountId: 'depot',
          securityId: 's',
          date: '2026-01-03',
          kind: 'buy',
          unitsE8: 2e8,
          amountCents: 2_000,
          feeCents: 100,
        },
        {
          id: 'sell',
          accountId: 'depot',
          securityId: 's',
          date: '2026-01-05',
          kind: 'sell',
          unitsE8: -1e8,
          amountCents: 1_500,
          feeCents: 80,
          taxCents: 20,
        },
      ])
      .run();
    for (const [day, expected] of [
      ['2026-01-01', 1_000],
      ['2026-01-04', 3_000],
      ['2026-01-06', 3_000],
    ] as const) {
      expect(holdingValuesAsOf(opened.db, day)[0]!.valueCents).toBe(expected);
      expect(valuationSeries(opened.db, { from: day, to: day }).totalCents).toEqual([expected]);
    }
    opened.db
      .insert(price)
      .values({
        securityId: 's',
        date: '2026-01-02',
        priceMicro: 20_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
    expect(holdingValuesAsOf(opened.db, '2026-01-06')[0]!.valueCents).toBe(4_000);
    expect(valuationSeries(opened.db, { from: '2026-01-06', to: '2026-01-06' }).totalCents).toEqual(
      [4_000],
    );
  });

  it('keeps cost as the final fallback without trades', () => {
    expect(holdingValuesAsOf(opened.db, '2026-01-06')[0]).toMatchObject({
      valueCents: 700,
      quality: 'estimated',
    });
    expect(valuationSeries(opened.db, { from: '2026-01-06', to: '2026-01-06' }).totalCents).toEqual(
      [700],
    );
  });

  it('omits closed snapshot positions from the as-of hint despite historical cost estimates', () => {
    opened.db
      .insert(holding)
      .values({
        id: 'closed',
        accountId: 'depot',
        securityId: 's',
        asOf: '2026-01-05',
        unitsE8: 0,
        costBasisCents: 0,
      })
      .run();
    const notes = runWithValuationNotes((read) => {
      valuationSeries(opened.db, { from: '2026-01-01', to: '2026-01-06' });
      return namedNotes(opened.db, read(), '2026-01-06');
    });
    expect(notes).toEqual([]);
  });
});
