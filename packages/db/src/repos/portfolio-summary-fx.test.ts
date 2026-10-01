import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, fxRate, holding, price, security, trade } from '../schema';
import { MissingFxRateError } from './errors';
import { portfolioSummary, positionLines } from './portfolio-summary';
import { seedBasics } from './test-helpers';

const E8 = 100_000_000;
let opened: OpenedDatabase;

function addAccount(id: string, currency: string) {
  opened.db
    .insert(account)
    .values({
      id,
      name: `Depot ${id}`,
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      currency,
      openingDate: '2023-10-01',
    })
    .run();
}

function addSecurity(id: string, currency: string, terBp = 0) {
  opened.db
    .insert(security)
    .values({ id, name: `Security ${id}`, kind: 'stock', currency, terBp })
    .run();
}

function addRate(date: string, currency: string, rateMicro: number) {
  opened.db.insert(fxRate).values({ date, currency, rateMicro, source: 'ecb' }).run();
}

function addPrice(securityId: string, date: string, priceMicro: number, currency: string) {
  opened.db
    .insert(price)
    .values({ securityId, date, priceMicro, currency, source: 'manual' })
    .run();
}

function addTrade(
  id: string,
  accountId: string,
  securityId: string,
  date: string,
  kind: 'buy' | 'sell' | 'dividend' | 'interest' | 'fee' | 'split',
  amountCents: number,
  options: { unitsE8?: number; feeCents?: number; taxCents?: number } = {},
) {
  opened.db
    .insert(trade)
    .values({
      id,
      accountId,
      securityId,
      date,
      kind,
      unitsE8: options.unitsE8 ?? 0,
      amountCents,
      feeCents: options.feeCents ?? 0,
      taxCents: options.taxCents ?? 0,
    })
    .run();
}

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});

afterEach(() => opened.close());

describe('portfolio summary FX normalization', () => {
  it('uses historical account FX for cost and current price FX for market value', () => {
    addAccount('usd-depot', 'USD');
    addSecurity('usd-security', 'USD');
    addRate('2026-01-10', 'USD', 500_000);
    addRate('2026-02-10', 'USD', 800_000);
    addTrade('usd-buy', 'usd-depot', 'usd-security', '2026-01-10', 'buy', 10_000, {
      unitsE8: 10 * E8,
    });
    addPrice('usd-security', '2026-02-10', 10_000_000, 'USD');

    const summary = portfolioSummary(opened.db, { today: '2026-02-10' });
    expect(summary.valueCents).toBe(8_000);
    expect(summary.costCents).toBe(5_000);
    expect(summary.gainCents).toBe(3_000);
  });

  it('keeps EUR account costs in EUR when the security price is in USD', () => {
    addAccount('eur-depot', 'EUR');
    addSecurity('usd-quote', 'USD');
    addRate('2026-01-10', 'USD', 500_000);
    addRate('2026-02-10', 'USD', 800_000);
    addTrade('eur-buy', 'eur-depot', 'usd-quote', '2026-01-10', 'buy', 10_000, {
      unitsE8: 10 * E8,
    });
    addPrice('usd-quote', '2026-02-10', 10_000_000, 'USD');

    const line = positionLines(opened.db, '2026-02-10')[0];
    expect(line).toMatchObject({ valueCents: 8_000, costCents: 10_000, gainCents: -2_000 });
  });

  it('converts buy fees and 12-month dividend and interest amounts on each event date', () => {
    addAccount('usd-income-depot', 'USD');
    addSecurity('usd-income-security', 'USD');
    addRate('2025-12-01', 'USD', 500_000);
    addRate('2026-01-01', 'USD', 600_000);
    addRate('2026-02-01', 'USD', 700_000);
    addRate('2026-03-01', 'USD', 400_000);
    addRate('2026-04-01', 'USD', 800_000);
    addTrade('buy-fee', 'usd-income-depot', 'usd-income-security', '2025-12-01', 'buy', 10_000, {
      unitsE8: 10 * E8,
      feeCents: 200,
    });
    addTrade(
      'dividend',
      'usd-income-depot',
      'usd-income-security',
      '2026-01-01',
      'dividend',
      1_000,
      {
        feeCents: 50,
        taxCents: 100,
      },
    );
    addTrade('interest', 'usd-income-depot', 'usd-income-security', '2026-02-01', 'interest', 500, {
      feeCents: 10,
      taxCents: 50,
    });
    addTrade('standalone-fee', 'usd-income-depot', 'usd-income-security', '2026-03-01', 'fee', 300);
    addPrice('usd-income-security', '2026-04-01', 10_000_000, 'USD');

    const summary = portfolioSummary(opened.db, { today: '2026-04-01' });
    expect(summary.costs.feesCents).toBe(257);
    expect(summary.income).toEqual({ grossCents: 950, taxCents: 95, feeCents: 37, netCents: 818 });
  });

  it('converts the latest snapshot basis on its date and ignores older snapshots', () => {
    addAccount('snapshot-depot', 'USD');
    addSecurity('snapshot-security', 'USD');
    addRate('2026-01-01', 'USD', 500_000);
    addRate('2026-02-01', 'USD', 600_000);
    addRate('2026-03-01', 'USD', 800_000);
    opened.db
      .insert(holding)
      .values({
        id: 'old-snapshot',
        accountId: 'snapshot-depot',
        securityId: 'snapshot-security',
        asOf: '2025-12-01',
        unitsE8: E8,
        costBasisCents: 99_000,
      })
      .run();
    opened.db
      .insert(holding)
      .values({
        id: 'latest-snapshot',
        accountId: 'snapshot-depot',
        securityId: 'snapshot-security',
        asOf: '2026-01-01',
        unitsE8: E8,
        costBasisCents: 10_000,
      })
      .run();
    addTrade('later-buy', 'snapshot-depot', 'snapshot-security', '2026-02-01', 'buy', 10_000, {
      unitsE8: E8,
    });
    addPrice('snapshot-security', '2026-03-01', 50_000_000, 'USD');

    const line = positionLines(opened.db, '2026-03-01')[0];
    expect(line).toMatchObject({
      unitsE8: 2 * E8,
      valueCents: 8_000,
      costCents: 11_000,
      gainCents: -3_000,
    });
  });

  it('reports the historical missing rate date even when a later rate values the position', () => {
    addAccount('missing-rate-depot', 'USD');
    addSecurity('missing-rate-security', 'USD');
    addRate('2026-02-10', 'USD', 800_000);
    addTrade(
      'missing-rate-buy',
      'missing-rate-depot',
      'missing-rate-security',
      '2026-01-10',
      'buy',
      10_000,
      {
        unitsE8: 10 * E8,
      },
    );
    addPrice('missing-rate-security', '2026-02-10', 10_000_000, 'USD');

    expect(() => positionLines(opened.db, '2026-02-10')).toThrowError(
      new MissingFxRateError('USD', '2026-01-10'),
    );
  });

  it('does not need an FX rate for a split with no monetary amounts', () => {
    addAccount('split-depot', 'USD');
    addSecurity('eur-quote', 'EUR');
    opened.db
      .insert(holding)
      .values({
        id: 'zero-cost-opening',
        accountId: 'split-depot',
        securityId: 'eur-quote',
        asOf: '2026-01-10',
        unitsE8: E8,
        costBasisCents: 0,
      })
      .run();
    addTrade('split-no-cash', 'split-depot', 'eur-quote', '2026-02-01', 'split', 0, {
      unitsE8: E8,
    });
    addPrice('eur-quote', '2026-02-10', 5_000_000, 'EUR');

    const line = positionLines(opened.db, '2026-02-10')[0];
    expect(line).toMatchObject({ unitsE8: 2 * E8, valueCents: 1_000, costCents: 0 });
  });

  it('reports a missing historical snapshot rate despite an available current rate', () => {
    addAccount('missing-snapshot-depot', 'USD');
    addSecurity('missing-snapshot-security', 'USD');
    opened.db
      .insert(holding)
      .values({
        id: 'missing-snapshot',
        accountId: 'missing-snapshot-depot',
        securityId: 'missing-snapshot-security',
        asOf: '2026-01-10',
        unitsE8: E8,
        costBasisCents: 10_000,
      })
      .run();
    addRate('2026-02-10', 'USD', 800_000);
    addPrice('missing-snapshot-security', '2026-02-10', 10_000_000, 'USD');
    expect(() => positionLines(opened.db, '2026-02-10')).toThrowError(
      new MissingFxRateError('USD', '2026-01-10'),
    );
  });
});
