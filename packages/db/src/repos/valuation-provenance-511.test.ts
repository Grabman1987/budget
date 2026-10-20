import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ValuationLimitError } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, booking, holding, price, security, trade, fxRate, valuation } from '../schema';
import {
  currentValuationSources,
  fallibleNetWorthValuationAsOf,
  holdingValuationExportAsOf,
  netWorthValuationAsOf,
} from './portfolio';
import { runWithRequestMemo } from './request-memo';

const DAY = '2026-09-20';
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
      openingDate: '2026-09-01',
    })
    .run();
});
afterEach(() => opened.close());
function position(id: string, cost: number | null = 10000, currency = 'EUR', accountId = 'depot') {
  opened.db
    .insert(security)
    .values({ id, name: `Synthetic ${id}`, kind: 'stock', currency })
    .run();
  opened.db
    .insert(holding)
    .values({
      id: `holding-${id}`,
      accountId,
      securityId: id,
      asOf: '2026-09-01',
      unitsE8: 100000000,
      costBasisCents: cost,
    })
    .run();
}
function quote(id: string, date: string, currency = 'EUR', priceMicro = 120000000) {
  opened.db
    .insert(price)
    .values({ securityId: id, date, currency, priceMicro, source: 'manual' })
    .run();
}
const sources = () => currentValuationSources(opened.db, DAY);
const one = (id: string) => sources().sources.find((s) => s.securityId === id)!;

describe('current valuation facts from the actual financial read', () => {
  it.each(['strict-first', 'fallible-first'] as const)(
    'isolates safe-native cash result overflow from strict memoized reads (%s)',
    (order) => {
      opened.db
        .insert(account)
        .values({
          id: 'loan',
          name: 'Synthetic loan',
          type: 'loan',
          role: 'debt',
          onBudget: false,
          currency: 'USD',
          openingDate: DAY,
          openingBalanceCents: -4503599627370497,
        })
        .run();
      opened.db.insert(fxRate).values({ currency: 'USD', date: DAY, rateMicro: 3000000 }).run();
      const before = opened.sqlite.serialize();
      runWithRequestMemo(() => {
        if (order === 'strict-first')
          expect(() => netWorthValuationAsOf(opened.db, DAY)).toThrow(ValuationLimitError);
        const read = fallibleNetWorthValuationAsOf(opened.db, DAY);
        expect(read.calculationLimitAccountIds).toEqual(['loan']);
        expect(read.valuation).toMatchObject({
          totalCents: null,
          byAccount: { depot: 0, loan: null },
          missingFxCurrencies: [],
          missingFxByAccount: {},
        });
        expect(Object.keys(read.valuation).sort()).toEqual(
          [
            'totalCents',
            'byAccount',
            'holdingsByAccount',
            'missingFxCurrencies',
            'missingFxByAccount',
            'missingPriceSecurityIds',
            'missingPriceByAccount',
            'incomplete',
          ].sort(),
        );
        expect(() => netWorthValuationAsOf(opened.db, DAY)).toThrow(ValuationLimitError);
        expect(fallibleNetWorthValuationAsOf(opened.db, DAY)).toEqual(read);
      });
      expect(opened.sqlite.serialize().equals(before)).toBe(true);
    },
  );
  it('does not turn an unsafe native principal into a tolerated missing EUR row', () => {
    opened.db
      .insert(account)
      .values({
        id: 'loan',
        name: 'Synthetic loan',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: DAY,
        openingBalanceCents: -4503599627370497,
      })
      .run();
    opened.db
      .insert(booking)
      .values({
        id: 'large-payment',
        accountId: 'loan',
        date: DAY,
        amountCents: -4503599627370497,
        status: 'confirmed',
      })
      .run();
    const before = opened.sqlite.serialize();
    try {
      fallibleNetWorthValuationAsOf(opened.db, DAY);
      throw new Error('Synthetic unsafe native sum must be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ValuationLimitError);
      if (!(error instanceof ValuationLimitError)) throw error;
      expect(error.boundary).toBe('operand');
    }
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });
  it('reads the real dated manual-value table without shadowing it with the result object', () => {
    opened.db
      .insert(account)
      .values({
        id: 'manual',
        name: 'Synthetic manual asset',
        type: 'other_asset',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-09-01',
        openingBalanceCents: 10000,
      })
      .run();
    opened.db
      .insert(valuation)
      .values({
        id: 'manual-value',
        accountId: 'manual',
        date: '2026-09-19',
        valueCents: 12001,
        source: 'manual',
      })
      .run();
    expect(netWorthValuationAsOf(opened.db, DAY)).toMatchObject({
      totalCents: 12001,
      byAccount: { depot: 0, manual: 12001 },
    });
    expect(sources().sources.find((source) => source.accountId === 'manual')).toMatchObject({
      kind: 'cash',
      currency: 'EUR',
      missing: null,
      fx: { kind: 'identity', date: null, source: null },
    });
    expect(sources().quoteReview.count).toBe(0);
  });

  it('retains literal native12000/EUR11400 and chosen quote/FX days, never a later observation', () => {
    position('usd', null, 'USD');
    quote('usd', '2026-09-18', 'USD');
    quote('usd', '2026-09-21', 'USD', 999000000);
    opened.db
      .insert(fxRate)
      .values([
        { currency: 'USD', date: '2026-09-19', rateMicro: 950000, source: 'ecb' },
        { currency: 'USD', date: '2026-09-21', rateMicro: 2000000, source: 'ecb' },
      ])
      .run();
    expect(netWorthValuationAsOf(opened.db, DAY).totalCents).toBe(11400);
    expect(holdingValuationExportAsOf(opened.db, DAY).values[0]).toMatchObject({
      priceMicro: 120000000,
      valueCents: 11400,
      fxRateMicro: 950000,
      priceDate: '2026-09-18',
    });
    expect(one('usd')).toMatchObject({
      kind: 'quote',
      date: '2026-09-18',
      currency: 'USD',
      source: 'manual',
      missing: null,
      quoteNeeded: false,
      fx: { kind: 'rate', date: '2026-09-19', source: 'ecb' },
    });
  });
  it('counts only >7days, while a fresh Friday quote at Sunday still retains its actual day', () => {
    for (const id of ['friday', 'seven', 'eight']) position(id);
    quote('friday', '2026-09-18');
    quote('seven', '2026-09-13');
    quote('eight', '2026-09-12');
    expect(sources().quoteReview).toEqual({ count: 1, securityIds: ['eight'] });
    expect(one('friday')).toMatchObject({ date: '2026-09-18', quoteNeeded: false });
    expect(netWorthValuationAsOf(opened.db, DAY).totalCents).toBe(36000);
  });
  it('never labels a missing FX as identity; missing nativecash stays usable and EUR total null', () => {
    opened.db
      .update(account)
      .set({ currency: 'USD', openingBalanceCents: 12345 })
      .where(eq(account.id, 'depot'))
      .run();
    position('usd', null, 'USD');
    quote('usd', DAY, 'USD');
    expect(netWorthValuationAsOf(opened.db, DAY)).toMatchObject({
      totalCents: null,
      byAccount: { depot: null },
    });
    expect(one('usd')).toMatchObject({
      missing: 'fx',
      quoteNeeded: false,
      fx: { kind: 'missing', date: null, source: null },
    });
    expect(sources().quoteReview.count).toBe(0);
    expect(opened.db.select().from(account).get()?.openingBalanceCents).toBe(12345);
  });
  it('keeps a fresh EUR holding known when unlinked USD cash makes only the account and group EUR total unknown', () => {
    opened.db
      .update(account)
      .set({ currency: 'USD', openingBalanceCents: 12345 })
      .where(eq(account.id, 'depot'))
      .run();
    position('eur', null, 'EUR');
    quote('eur', DAY, 'EUR');
    expect(netWorthValuationAsOf(opened.db, DAY)).toMatchObject({
      totalCents: null,
      byAccount: { depot: null },
      holdingsByAccount: { depot: 12000 },
    });
    expect(one('eur')).toMatchObject({
      kind: 'quote',
      date: DAY,
      currency: 'EUR',
      missing: null,
      fx: { kind: 'identity', date: null, source: null },
    });
    expect(sources().sources.find((source) => source.securityId === null)).toMatchObject({
      kind: 'cash',
      currency: 'USD',
      missing: 'fx',
      fx: { kind: 'missing', date: null, source: null },
    });
    expect(sources().quoteReview).toEqual({ count: 0, securityIds: [] });
    expect(opened.db.select().from(account).get()?.openingBalanceCents).toBe(12345);
  });
  it('records the legacy zeroforeigncash boundary without inventing parity or changing the old numeric policy', () => {
    opened.db.update(account).set({ currency: 'USD' }).where(eq(account.id, 'depot')).run();
    expect(netWorthValuationAsOf(opened.db, DAY).totalCents).toBe(0);
    expect(sources().sources).toEqual([
      expect.objectContaining({
        kind: 'cash',
        currency: 'USD',
        missing: 'fx',
        fx: { kind: 'missing', date: null, source: null },
      }),
    ]);
  });
  it('separates a known-cost estimate from an absent quote AND absent basis without changing legacy totals', () => {
    position('cost');
    position('absent', null);
    expect(one('cost')).toMatchObject({
      kind: 'cost',
      date: null,
      quoteNeeded: true,
      missing: null,
    });
    expect(one('absent')).toMatchObject({
      kind: 'missing',
      date: null,
      quoteNeeded: true,
      missing: 'price',
    });
    expect(sources().quoteReview.securityIds).toEqual(['absent', 'cost']);
    expect(netWorthValuationAsOf(opened.db, DAY).totalCents).toBe(10000);
    expect(netWorthValuationAsOf(opened.db, DAY, { estimate: false }).totalCents).toBeNull();
  });
  it('preserves foreign cost currency and actual FX instead of calling an implied EUR price an observed quote', () => {
    opened.db.update(account).set({ currency: 'USD' }).where(eq(account.id, 'depot')).run();
    position('cost-usd', 10000, 'USD');
    opened.db
      .insert(fxRate)
      .values({ currency: 'USD', date: '2026-09-18', rateMicro: 950000, source: 'ecb' })
      .run();
    expect(netWorthValuationAsOf(opened.db, DAY).totalCents).toBe(9500);
    expect(one('cost-usd')).toMatchObject({
      kind: 'cost',
      currency: 'USD',
      source: null,
      date: null,
      fx: { kind: 'rate', date: '2026-09-18', source: 'ecb' },
    });
  });
  it.each(['2026-09-19', '2026-09-21'])(
    'excludes usable gross execution on%s from quote work and labels lookahead explicitly',
    (date) => {
      position('execution', null);
      opened.db
        .insert(trade)
        .values({
          id: 't',
          accountId: 'depot',
          securityId: 'execution',
          date,
          kind: 'buy',
          unitsE8: 100000000,
          amountCents: 10000,
          feeCents: 250,
          taxCents: 125,
        })
        .run();
      // A prior buy increases held units; a future buy only supplies the approved lookahead price.
      expect(netWorthValuationAsOf(opened.db, DAY).totalCents).toBe(date < DAY ? 20000 : 10000);
      expect(one('execution')).toMatchObject({
        kind: 'execution',
        date,
        source: null,
        lookAhead: date > DAY,
        quoteNeeded: false,
      });
      expect(sources().quoteReview.count).toBe(0);
    },
  );
  it('retains stale-or-missing quote work even when FX is also absent', () => {
    position('stale-fx', null, 'USD');
    quote('stale-fx', '2026-09-12', 'USD');
    position('missing-fx', null, 'USD');
    expect(sources().quoteReview.securityIds).toEqual(['missing-fx', 'stale-fx']);
    expect(one('stale-fx')).toMatchObject({ kind: 'quote', missing: 'fx', quoteNeeded: true });
  });
  it('deduplicates a current positive security across accounts, excluding zero/current-short and historical-only positions', () => {
    position('held');
    position('closed');
    position('short');
    opened.db
      .insert(account)
      .values({
        id: 'second',
        name: 'Synthetic second',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-09-01',
      })
      .run();
    opened.db
      .insert(holding)
      .values([
        {
          id: 'duplicate',
          accountId: 'second',
          securityId: 'held',
          asOf: '2026-09-01',
          unitsE8: 100000000,
        },
        { id: 'closed-now', accountId: 'depot', securityId: 'closed', asOf: DAY, unitsE8: 0 },
        {
          id: 'short-now',
          accountId: 'depot',
          securityId: 'short',
          asOf: DAY,
          unitsE8: -100000000,
        },
      ])
      .run();
    expect(sources().quoteReview).toEqual({ count: 1, securityIds: ['held'] });
  });
  it('keeps exact public money-object shapes and all persisted bytes unchanged by repeated memoized disclosures', () => {
    position('cost');
    const before = opened.sqlite.serialize();
    runWithRequestMemo(() => {
      const money = netWorthValuationAsOf(opened.db, DAY);
      expect(Object.keys(money).sort()).toEqual(
        [
          'byAccount',
          'holdingsByAccount',
          'incomplete',
          'missingFxByAccount',
          'missingFxCurrencies',
          'missingPriceByAccount',
          'missingPriceSecurityIds',
          'totalCents',
        ].sort(),
      );
      const first = sources();
      first.quoteReview.securityIds.length = 0;
      expect(sources().quoteReview.securityIds).toEqual(['cost']);
      expect(netWorthValuationAsOf(opened.db, DAY)).toEqual(money);
      expect(Object.keys(holdingValuationExportAsOf(opened.db, DAY).values[0]!).sort()).toEqual(
        [
          'accountId',
          'securityId',
          'unitsE8',
          'priceMicro',
          'priceCurrency',
          'fxRateMicro',
          'valueCents',
          'quality',
          'priceDate',
        ].sort(),
      );
    });
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });
  it('request memo provenance invalidates on actual writes, preserving the same money branch', () => {
    position('held');
    runWithRequestMemo(() => {
      expect(sources().quoteReview.count).toBe(1);
      quote('held', DAY);
      expect(sources().quoteReview.count).toBe(0);
      expect(netWorthValuationAsOf(opened.db, DAY).totalCents).toBe(12000);
    });
  });
});
