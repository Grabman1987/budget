import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, fxRate, holding, price, security, trade } from '../schema';
import { portfolioSummary, positionLines } from './portfolio-summary';
import { investmentPreferences, setInvestmentCostMethod } from './investment-preferences';
import { seedBasics } from './test-helpers';

const E8 = 100_000_000;
let opened: OpenedDatabase;

function addAccount(id: string, currency = 'EUR') {
  opened.db
    .insert(account)
    .values({
      id,
      name: id,
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      currency,
      openingDate: '2026-01-01',
    })
    .run();
}

function addSecurity(id = 'stock') {
  opened.db
    .insert(security)
    .values({ id, name: id, kind: 'stock', currency: 'EUR', terBp: 0 })
    .run();
}

function addTrade(
  id: string,
  accountId: string,
  date: string,
  kind: 'buy' | 'sell',
  unitsE8: number,
  amountCents: number,
  feeCents = 0,
  taxCents = 0,
  securityId = 'stock',
) {
  opened.db
    .insert(trade)
    .values({
      id,
      accountId,
      securityId,
      date,
      kind,
      unitsE8,
      amountCents,
      feeCents,
      taxCents,
    })
    .run();
}

function addSnapshot(
  id: string,
  accountId: string,
  date: string,
  unitsE8: number,
  basis: number | null,
) {
  opened.db
    .insert(holding)
    .values({
      id,
      accountId,
      securityId: 'stock',
      asOf: date,
      unitsE8,
      costBasisCents: basis,
    })
    .run();
}

function summary(today = '2026-02-01') {
  return portfolioSummary(opened.db, { today });
}

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});

afterEach(() => opened.close());

describe('portfolio realized gains', () => {
  beforeEach(() => {
    addAccount('depot');
    addSecurity();
    // Cost-method cases require a genuinely priced history, independent of execution amounts.
    opened.db
      .insert(price)
      .values({
        securityId: 'stock',
        date: '2025-12-31',
        priceMicro: 100_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
  });

  it('keeps a fully sold position gain when there are no current units', () => {
    addTrade('buy', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('sell', 'depot', '2026-01-02', 'sell', -E8, 12_000);

    expect(summary().realizedGainCents).toBe(2_000);
    expect(positionLines(opened.db, '2026-02-01')).toEqual([]);
    expect(summary().positions).toEqual([]);
  });

  it('keeps a known gain when a later zero-unit snapshot has null basis', () => {
    addTrade('buy', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('sell', 'depot', '2026-01-02', 'sell', -E8, 12_000);
    addSnapshot('zero-unknown-basis', 'depot', '2026-01-03', 0, null);

    expect(summary().realizedGainCents).toBe(2_000);
  });

  it('calculates later documented trades after a zero-unit snapshot with null basis', () => {
    addSnapshot('empty-unknown-basis', 'depot', '2026-01-01', 0, null);
    addTrade('buy-after-empty', 'depot', '2026-01-02', 'buy', E8, 10_000);
    addTrade('sell-after-empty', 'depot', '2026-01-03', 'sell', -E8, 12_000);

    expect(summary().realizedGainCents).toBe(2_000);
  });

  it('uses FIFO basis for partial sales from different purchase costs', () => {
    setInvestmentCostMethod(opened.db, 'fifo', { actor: 'test' });
    addTrade('buy-first', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('buy-second', 'depot', '2026-01-02', 'buy', E8, 20_000);
    addTrade('sell-first-lot', 'depot', '2026-01-03', 'sell', -E8, 16_000);

    expect(summary().realizedGainCents).toBe(6_000);
  });

  it.each(['average', 'fifo'] as const)(
    'keeps documented %s lots through a matching pre-sale snapshot checkpoint',
    (method) => {
      setInvestmentCostMethod(opened.db, method, { actor: 'test' });
      addTrade('buy-cheap', 'depot', '2026-01-01', 'buy', E8, 10_000);
      addTrade('buy-expensive', 'depot', '2026-01-02', 'buy', E8, 20_000);
      addSnapshot('checkpoint', 'depot', '2026-01-03', 2 * E8, 30_000);
      addSnapshot('repeat-checkpoint-without-basis', 'depot', '2026-01-04', 2 * E8, null);
      addTrade('sell-one', 'depot', '2026-01-05', 'sell', -E8, 18_000);
      opened.db
        .insert(price)
        .values({
          securityId: 'stock',
          date: '2026-02-01',
          priceMicro: 180_000_000,
          currency: 'EUR',
          source: 'manual',
        })
        .run();

      expect(summary()).toMatchObject(
        method === 'fifo'
          ? { realizedGainCents: 8_000, costCents: 20_000 }
          : { realizedGainCents: 3_000, costCents: 15_000 },
      );
    },
  );

  it('keeps FIFO lots across broker-average checkpoints after sales', () => {
    setInvestmentCostMethod(opened.db, 'fifo', { actor: 'test' });
    addTrade('buy-cheap', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('buy-expensive', 'depot', '2026-01-02', 'buy', E8, 20_000);
    addTrade('sell-cheap', 'depot', '2026-01-03', 'sell', -E8, 18_000);
    // PP exports an average basis here; it agrees with the documented average method, while FIFO
    // still has the original 200 EUR lot. The checkpoint must not discard that lot identity.
    addSnapshot('broker-average-checkpoint', 'depot', '2026-01-04', E8, 15_000);
    opened.db
      .insert(price)
      .values({
        securityId: 'stock',
        date: '2026-01-04',
        priceMicro: 260_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();

    expect(summary('2026-01-04')).toMatchObject({ costCents: 20_000, realizedGainCents: 8_000 });

    addTrade('sell-expensive', 'depot', '2026-01-05', 'sell', -E8, 26_000);
    expect(summary().realizedGainCents).toBe(14_000);
  });

  it('uses a real snapshot basis correction as the new opening basis', () => {
    setInvestmentCostMethod(opened.db, 'fifo', { actor: 'test' });
    addTrade('buy-cheap', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('buy-expensive', 'depot', '2026-01-02', 'buy', E8, 20_000);
    addSnapshot('corrected-checkpoint', 'depot', '2026-01-03', 2 * E8, 31_000);
    addTrade('sell-one', 'depot', '2026-01-04', 'sell', -E8, 18_000);

    expect(summary().realizedGainCents).toBe(2_500);
  });

  it('defaults to average and recalculates both realized gain and remaining basis after a switch', () => {
    addTrade('buy-cheap', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('buy-expensive', 'depot', '2026-01-02', 'buy', E8, 20_000);
    addTrade('sell-one', 'depot', '2026-01-03', 'sell', -E8, 18_000);
    opened.db
      .insert(price)
      .values({
        securityId: 'stock',
        date: '2026-02-01',
        priceMicro: 180_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();

    expect(investmentPreferences(opened.db)).toEqual({ costMethod: 'average' });
    expect(summary()).toMatchObject({
      realizedGainCents: 3_000,
      costCents: 15_000,
      gainCents: 3_000,
    });
    expect(summary().positions[0]?.realizedGainCents).toBe(3_000);
    setInvestmentCostMethod(opened.db, 'fifo', { actor: 'test' });
    expect(summary()).toMatchObject({
      realizedGainCents: 8_000,
      costCents: 20_000,
      gainCents: -2_000,
    });
    expect(summary().positions[0]?.realizedGainCents).toBe(8_000);
    setInvestmentCostMethod(opened.db, 'average', { actor: 'test' });
    expect(summary().realizedGainCents).toBe(3_000);
  });

  it('does not manufacture an average basis when new buys mix with an unknown opening pool', () => {
    addSnapshot('unknown-opening', 'depot', '2026-01-01', E8, null);
    addTrade('mixed-buy', 'depot', '2026-01-02', 'buy', E8, 10_000);
    addTrade('sell-mixed-pool', 'depot', '2026-01-03', 'sell', -2 * E8, 30_000);
    addTrade('known-buy', 'depot', '2026-01-04', 'buy', E8, 10_000);
    addTrade('known-sell', 'depot', '2026-01-05', 'sell', -E8, 12_000);

    expect(summary().realizedGainCents).toBe(2_000);
  });

  it('orders same-day purchases before sales when checking backed units', () => {
    addTrade('sale-first-by-id', 'depot', '2026-01-01', 'sell', -E8, 12_000);
    addTrade('buy-second-by-id', 'depot', '2026-01-01', 'buy', E8, 10_000);

    expect(summary().realizedGainCents).toBe(2_000);
  });

  it('keeps backed earlier gains when a later sale is overdrawn', () => {
    addTrade('buy', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('backed-sale', 'depot', '2026-01-02', 'sell', -E8, 12_000);
    addTrade('overdrawn-sale', 'depot', '2026-01-03', 'sell', -E8, 15_000);

    expect(summary().realizedGainCents).toBe(2_000);
  });

  it('resumes known gains after unknown opening units are fully sold', () => {
    addSnapshot('unknown-opening', 'depot', '2026-01-01', E8, null);
    addTrade('sell-unknown', 'depot', '2026-01-02', 'sell', -E8, 12_000);
    addTrade('known-buy', 'depot', '2026-01-03', 'buy', E8, 10_000);
    addTrade('known-sale', 'depot', '2026-01-04', 'sell', -E8, 13_000);

    expect(summary().realizedGainCents).toBe(3_000);
  });

  it('retains a realized partial sale while pricing the remaining holding separately', () => {
    addTrade('buy', 'depot', '2026-01-01', 'buy', 2 * E8, 20_000);
    addTrade('sell-half', 'depot', '2026-01-02', 'sell', -E8, 12_000);
    opened.db
      .insert(price)
      .values({
        securityId: 'stock',
        date: '2026-02-01',
        priceMicro: 110_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();

    const result = summary();
    expect(result.realizedGainCents).toBe(2_000);
    expect(result.positions[0]).toMatchObject({
      unitsE8: E8,
      costCents: 10_000,
      gainCents: 1_000,
      realizedGainCents: 2_000,
    });
  });

  it('preserves sold gains across a later repurchase', () => {
    addTrade('buy-first', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('sell-first', 'depot', '2026-01-02', 'sell', -E8, 12_000);
    addTrade('buy-again', 'depot', '2026-01-03', 'buy', E8, 9_000);
    opened.db
      .insert(price)
      .values({
        securityId: 'stock',
        date: '2026-02-01',
        priceMicro: 100_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();

    expect(summary().realizedGainCents).toBe(2_000);
    expect(summary().positions[0]).toMatchObject({ costCents: 9_000, realizedGainCents: 2_000 });
  });

  it('adds known gains across accounts without collapsing live positions', () => {
    addAccount('second');
    for (const depot of ['depot', 'second']) {
      addTrade(`${depot}-buy`, depot, '2026-01-01', 'buy', E8, 10_000);
      addTrade(`${depot}-sell`, depot, '2026-01-02', 'sell', -E8, 12_000);
    }

    expect(summary().realizedGainCents).toBe(4_000);
    expect(summary().positions).toEqual([]);
  });

  it('retains gains observed before and between later holding snapshots', () => {
    addTrade('buy-before', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('sell-before', 'depot', '2026-01-02', 'sell', -E8, 12_000);
    addSnapshot('snapshot-one', 'depot', '2026-01-03', E8, 15_000);
    addTrade('sell-after', 'depot', '2026-01-04', 'sell', -E8, 18_000);
    addSnapshot('snapshot-zero', 'depot', '2026-01-05', 0, 0);

    expect(summary().realizedGainCents).toBe(5_000);
    expect(summary().positions).toEqual([]);
  });

  it('does not treat unknown snapshot basis as zero profit basis', () => {
    addSnapshot('unknown-opening', 'depot', '2026-01-01', E8, null);
    addTrade('sell-unknown', 'depot', '2026-01-02', 'sell', -E8, 12_000);

    expect(summary().realizedGainCents).toBe(0);
    expect(summary().realizedGainComplete).toBe(false);
  });

  it.each(['average', 'fifo'] as const)(
    'keeps a live unknown basis and unrealized gain unavailable under %s',
    (method) => {
      setInvestmentCostMethod(opened.db, method, { actor: 'test' });
      addSnapshot('unknown-live', 'depot', '2026-01-01', E8, null);
      opened.db
        .insert(price)
        .values({
          securityId: 'stock',
          date: '2026-02-01',
          priceMicro: 120_000_000,
          currency: 'EUR',
          source: 'manual',
        })
        .run();
      expect(summary()).toMatchObject({ valueCents: 12_000, costCents: null, gainCents: null });
      expect(summary().positions[0]).toMatchObject({ costCents: null, gainCents: null });
    },
  );

  it('recovers a documented live basis after an unknown pool closes and a new purchase follows', () => {
    addSnapshot('unknown-live', 'depot', '2026-01-01', E8, null);
    addTrade('sell-unknown', 'depot', '2026-01-02', 'sell', -E8, 12_000);
    addTrade('new-known-buy', 'depot', '2026-01-03', 'buy', E8, 10_000);
    opened.db
      .insert(price)
      .values({
        securityId: 'stock',
        date: '2026-02-01',
        priceMicro: 120_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
    expect(summary()).toMatchObject({
      costCents: 10_000,
      gainCents: 2_000,
      realizedGainComplete: false,
    });
  });

  it('recovers remaining documented FIFO lots when only the older unknown lot is sold', () => {
    addSnapshot('unknown-opening', 'depot', '2026-01-01', E8, null);
    addTrade('known-buy', 'depot', '2026-01-02', 'buy', E8, 10_000);
    addTrade('sell-oldest', 'depot', '2026-01-03', 'sell', -E8, 12_000);
    opened.db
      .insert(price)
      .values({
        securityId: 'stock',
        date: '2026-02-01',
        priceMicro: 120_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
    expect(summary()).toMatchObject({
      costCents: null,
      gainCents: null,
      realizedGainComplete: false,
    });
    setInvestmentCostMethod(opened.db, 'fifo', { actor: 'test' });
    expect(summary()).toMatchObject({
      costCents: 10_000,
      gainCents: 2_000,
      realizedGainComplete: false,
    });
  });

  it('does not require FX for a stale snapshot that no sale uses', () => {
    opened.db.update(account).set({ currency: 'USD' }).where(eq(account.id, 'depot')).run();
    opened.db
      .insert(fxRate)
      .values([
        { date: '2026-01-01', currency: 'USD', rateMicro: 500_000, source: 'ecb' },
        { date: '2026-01-03', currency: 'USD', rateMicro: 500_000, source: 'ecb' },
        { date: '2026-01-04', currency: 'USD', rateMicro: 500_000, source: 'ecb' },
      ])
      .run();
    addTrade('buy-before-snapshot', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addSnapshot('stale-no-rate', 'depot', '2026-01-02', E8, 99_000);
    addSnapshot('used-snapshot', 'depot', '2026-01-03', E8, 15_000);
    addTrade('sale', 'depot', '2026-01-04', 'sell', -E8, 18_000);

    expect(summary().realizedGainCents).toBe(1_500);
  });

  it('uses a checkpoint when optional source-history comparison lacks an earlier FX rate', () => {
    opened.db.update(account).set({ currency: 'USD' }).where(eq(account.id, 'depot')).run();
    opened.db
      .insert(fxRate)
      .values([
        { date: '2026-01-02', currency: 'USD', rateMicro: 500_000, source: 'ecb' },
        { date: '2026-01-03', currency: 'USD', rateMicro: 500_000, source: 'ecb' },
        { date: '2026-01-04', currency: 'USD', rateMicro: 500_000, source: 'ecb' },
      ])
      .run();
    addTrade('buy-no-historical-rate', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addSnapshot('checkpoint', 'depot', '2026-01-02', E8, 10_000);
    addTrade('sale-with-rate', 'depot', '2026-01-03', 'sell', -E8, 12_000);
    addTrade('new-buy-with-rate', 'depot', '2026-01-04', 'buy', E8, 6_000);
    opened.db
      .insert(price)
      .values({
        securityId: 'stock',
        date: '2026-01-04',
        priceMicro: 30_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();

    expect(positionLines(opened.db, '2026-01-04')[0]).toMatchObject({
      costCents: 3_000,
      realizedGainCents: 1_000,
    });
  });

  it('does not count future or soft-deleted sales', () => {
    addTrade('buy', 'depot', '2026-01-01', 'buy', E8, 10_000);
    addTrade('future-sale', 'depot', '2026-03-01', 'sell', -E8, 12_000);
    addTrade('deleted-sale', 'depot', '2026-01-02', 'sell', -E8, 12_000);
    opened.db
      .update(trade)
      .set({ deletedAt: '2026-01-03T00:00:00.000Z' })
      .where(eq(trade.id, 'deleted-sale'))
      .run();

    expect(summary().realizedGainCents).toBe(0);
  });

  it('includes buy fees and subtracts sell fees and taxes from the realized result', () => {
    addTrade('buy', 'depot', '2026-01-01', 'buy', E8, 10_000, 100);
    addTrade('sell', 'depot', '2026-01-02', 'sell', -E8, 12_000, 50, 100);
    const raw = opened.db.select().from(trade).all();

    expect(summary().realizedGainCents).toBe(1_750);
    setInvestmentCostMethod(opened.db, 'fifo', { actor: 'test' });
    expect(summary().realizedGainCents).toBe(1_750);
    expect(opened.db.select().from(trade).all()).toEqual(raw);
  });
});
