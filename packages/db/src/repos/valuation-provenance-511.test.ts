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
import { debtsAsOf } from './debts';

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

function aggregateCash(values: readonly number[], currency = 'EUR') {
  values.forEach((openingBalanceCents, index) => {
    opened.db
      .insert(account)
      .values({
        id: `aggregate-${index}`,
        name: `Synthetic aggregate ${index}`,
        type: 'checking',
        role: 'budget',
        onBudget: false,
        currency,
        openingDate: DAY,
        openingBalanceCents,
        sortOrder: index + 1,
      })
      .run();
  });
}
function aggregatePosition(id: string, unitsE8: number, priceMicro: number, currency = 'EUR') {
  opened.db
    .insert(security)
    .values({ id, name: `Synthetic ${id}`, kind: 'stock', currency })
    .run();
  opened.db
    .insert(holding)
    .values({
      id: `holding-${id}`,
      securityId: id,
      accountId: 'depot',
      asOf: DAY,
      unitsE8,
      costBasisCents: null,
    })
    .run();
  quote(id, DAY, currency, priceMicro);
}
function aggregateReadOnly(check: () => void) {
  const before = opened.sqlite.serialize();
  try {
    check();
  } finally {
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  }
}
function aggregateResultLimit(read: () => unknown) {
  let caught: unknown;
  try {
    read();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ValuationLimitError);
  if (!(caught instanceof ValuationLimitError))
    throw new Error('Expected typed valuation result limit');
  expect(caught.boundary).toBe('result');
  expect(caught.message).toBe('Valuation result exceeds safe integer range');
}

describe('literal exact shared aggregate boundaries, using actual stored account and holding reads', () => {
  it.each([1, -1])(
    'keeps a safe account final when cash cancels an overflowing holdings subtotal (%s)',
    (sign) => {
      opened.db
        .update(account)
        .set({ openingBalanceCents: -sign * 9007199254740991 })
        .where(eq(account.id, 'depot'))
        .run();
      aggregatePosition('aggregate-held-0', sign * 1000000000000, 9007199254740991);
      aggregatePosition('aggregate-held-1', sign * 100000000, 20000);
      aggregateReadOnly(() => {
        const read = fallibleNetWorthValuationAsOf(opened.db, DAY);
        expect(read.valuation).toMatchObject({
          holdingsByAccount: { depot: null },
          byAccount: { depot: sign === 1 ? 2 : -2 },
          totalCents: sign === 1 ? 2 : -2,
        });
        expect(read.calculationLimitAccountIds).toEqual([]);
        expect(read.calculationLimitAccountSigns).toEqual({});
        const debts = debtsAsOf(opened.db, DAY);
        expect(debts.totalEurCents).toBe(sign === 1 ? 0 : 2);
        expect(
          debts.accounts.map((row) => ({
            id: row.id,
            cents: row.owedEurCents,
            reason: row.unavailableReason,
          })),
        ).toEqual(sign === 1 ? [] : [{ id: 'depot', cents: 2, reason: null }]);
      });
    },
  );
  it.each([1, -1])(
    'identifies an overflowing account final without hiding its safe holding subtotal (%s)',
    (sign) => {
      opened.db
        .update(account)
        .set({ openingBalanceCents: sign * 9007199254740991 })
        .where(eq(account.id, 'depot'))
        .run();
      aggregatePosition('aggregate-held', sign * 100000000, 20000);
      aggregateReadOnly(() => {
        const read = fallibleNetWorthValuationAsOf(opened.db, DAY);
        expect(read.valuation).toMatchObject({
          holdingsByAccount: { depot: sign === 1 ? 2 : -2 },
          byAccount: { depot: null },
          totalCents: null,
        });
        expect(read.calculationLimitAccountIds).toEqual(['depot']);
        expect(read.calculationLimitAccountSigns).toEqual({ depot: sign });
      });
    },
  );
  it.each([1, -1])(
    'uses the exact overflow sign rather than opposite native cash to select debt rows (%s)',
    (sign) => {
      opened.db
        .update(account)
        .set({ openingBalanceCents: -sign })
        .where(eq(account.id, 'depot'))
        .run();
      aggregatePosition('aggregate-held-0', sign * 1000000000000, 9007199254740991);
      aggregatePosition('aggregate-held-1', sign * 1000000000000, 9007199254740991);
      aggregateReadOnly(() => {
        const read = fallibleNetWorthValuationAsOf(opened.db, DAY);
        expect(read.valuation).toMatchObject({
          holdingsByAccount: { depot: null },
          byAccount: { depot: null },
          totalCents: null,
        });
        expect(read.calculationLimitAccountIds).toEqual(['depot']);
        expect(read.calculationLimitAccountSigns).toEqual({ depot: sign });
        const debts = debtsAsOf(opened.db, DAY);
        expect(debts.totalEurCents).toBe(sign === 1 ? 0 : null);
        expect(
          debts.accounts.map((row) => ({
            id: row.id,
            cents: row.owedEurCents,
            reason: row.unavailableReason,
          })),
        ).toEqual(sign === 1 ? [] : [{ id: 'depot', cents: null, reason: 'calculation_limit' }]);
      });
    },
  );
  it.each([
    [9007199254740991, 2, -9007199254740991],
    [9007199254740991, -9007199254740991, 2],
    [2, 9007199254740991, -9007199254740991],
    [2, -9007199254740991, 9007199254740991],
    [-9007199254740991, 9007199254740991, 2],
    [-9007199254740991, 2, 9007199254740991],
  ])('retains literal positive cancellation2 for account order %j', (...values) => {
    aggregateCash(values);
    aggregateReadOnly(() => {
      const read = netWorthValuationAsOf(opened.db, DAY);
      expect(read.totalCents).toBe(2);
      expect(values.map((_, index) => read.byAccount[`aggregate-${index}`])).toEqual(values);
    });
  });
  it.each([
    [-9007199254740991, -2, 9007199254740991],
    [-9007199254740991, 9007199254740991, -2],
    [-2, -9007199254740991, 9007199254740991],
    [-2, 9007199254740991, -9007199254740991],
    [9007199254740991, -9007199254740991, -2],
    [9007199254740991, -2, -9007199254740991],
  ])('retains literal negative cancellation−2 for account order %j', (...values) => {
    aggregateCash(values);
    aggregateReadOnly(() => expect(netWorthValuationAsOf(opened.db, DAY).totalCents).toBe(-2));
  });
  it.each([1, -1])(
    'sums quoted signed holdings to literal ±2 without losing an intermediate cent (%s)',
    (sign) => {
      aggregatePosition('aggregate-held-0', sign * 1000000000000, 9007199254740991);
      aggregatePosition('aggregate-held-1', sign * 100000000, 20000);
      aggregatePosition('aggregate-held-2', -sign * 1000000000000, 9007199254740991);
      aggregateReadOnly(() => {
        expect(netWorthValuationAsOf(opened.db, DAY)).toMatchObject({
          holdingsByAccount: { depot: sign === 1 ? 2 : -2 },
          byAccount: { depot: sign === 1 ? 2 : -2 },
          totalCents: sign === 1 ? 2 : -2,
        });
      });
    },
  );
  it.each([1, -1])('sums mixed cash and holdings at the final account boundary (%s)', (sign) => {
    opened.db
      .update(account)
      .set({ openingBalanceCents: sign * 9007199254740991 })
      .where(eq(account.id, 'depot'))
      .run();
    aggregatePosition('aggregate-held-0', sign * 100000000, 20000);
    aggregatePosition('aggregate-held-1', -sign * 1000000000000, 9007199254740991);
    aggregateReadOnly(() =>
      expect(netWorthValuationAsOf(opened.db, DAY)).toMatchObject({
        holdingsByAccount: { depot: sign === 1 ? -9007199254740989 : 9007199254740989 },
        byAccount: { depot: sign === 1 ? 2 : -2 },
        totalCents: sign === 1 ? 2 : -2,
      }),
    );
  });
  it.each([1, -1])('rejects an unsafe final overall aggregate with safe operands (%s)', (sign) => {
    aggregateCash([sign * 9007199254740991, sign * 2]);
    aggregateReadOnly(() => aggregateResultLimit(() => netWorthValuationAsOf(opened.db, DAY)));
  });
  it.each([1, -1])(
    'rejects an unsafe final holding subtotal even if cash cancels the account (%s)',
    (sign) => {
      opened.db
        .update(account)
        .set({ openingBalanceCents: -sign * 9007199254740991 })
        .where(eq(account.id, 'depot'))
        .run();
      aggregatePosition('aggregate-held-0', sign * 1000000000000, 9007199254740991);
      aggregatePosition('aggregate-held-1', sign * 100000000, 20000);
      aggregateReadOnly(() => aggregateResultLimit(() => netWorthValuationAsOf(opened.db, DAY)));
    },
  );
  it.each([1, -1])('rejects an unsafe cash-plus-holding account final aggregate (%s)', (sign) => {
    opened.db
      .update(account)
      .set({ openingBalanceCents: sign * 9007199254740991 })
      .where(eq(account.id, 'depot'))
      .run();
    aggregatePosition('aggregate-held', sign * 100000000, 20000);
    aggregateReadOnly(() => aggregateResultLimit(() => netWorthValuationAsOf(opened.db, DAY)));
  });
  it('keeps a partial overall sum unknown when another account lacks FX', () => {
    aggregateCash([9007199254740991, 2]);
    opened.db
      .update(account)
      .set({ currency: 'USD', openingBalanceCents: 1 })
      .where(eq(account.id, 'depot'))
      .run();
    aggregateReadOnly(() =>
      expect(netWorthValuationAsOf(opened.db, DAY)).toMatchObject({
        totalCents: null,
        byAccount: { depot: null, 'aggregate-0': 9007199254740991, 'aggregate-1': 2 },
        missingFxCurrencies: ['USD'],
        missingFxByAccount: { depot: ['USD'] },
      }),
    );
  });
  it('keeps incomplete holdings unknown instead of range-checking a partial subtotal', () => {
    aggregatePosition('aggregate-held-0', 1000000000000, 9007199254740991);
    aggregatePosition('aggregate-held-1', 100000000, 20000);
    aggregatePosition('aggregate-held-2', 100000000, 1000000, 'USD');
    aggregateReadOnly(() =>
      expect(netWorthValuationAsOf(opened.db, DAY)).toMatchObject({
        totalCents: null,
        byAccount: { depot: null },
        holdingsByAccount: { depot: null },
        missingFxCurrencies: ['USD'],
        missingFxByAccount: { depot: ['USD'] },
      }),
    );
  });
  it('keeps strict missing-price holdings unknown before validating a partial subtotal', () => {
    aggregatePosition('aggregate-held-0', 1000000000000, 9007199254740991);
    aggregatePosition('aggregate-held-1', 100000000, 20000);
    position('aggregate-held-2', null);
    aggregateReadOnly(() =>
      expect(netWorthValuationAsOf(opened.db, DAY, { estimate: false })).toMatchObject({
        totalCents: null,
        byAccount: { depot: null },
        holdingsByAccount: { depot: null },
        missingPriceSecurityIds: ['aggregate-held-2'],
        missingPriceByAccount: { depot: ['aggregate-held-2'] },
      }),
    );
  });
  it('preserves cash-only negative zero while the overall seeded sum is positive zero', () => {
    opened.db
      .update(account)
      .set({ currency: 'USD', openingBalanceCents: -1 })
      .where(eq(account.id, 'depot'))
      .run();
    opened.db.insert(fxRate).values({ currency: 'USD', date: DAY, rateMicro: 1 }).run();
    aggregateReadOnly(() => {
      const read = netWorthValuationAsOf(opened.db, DAY);
      expect(Object.is(read.byAccount.depot, -0)).toBe(true);
      expect(Object.is(read.totalCents, 0)).toBe(true);
    });
  });
  it('preserves positive zero after a real holding addition to negative-zero cash', () => {
    opened.db
      .update(account)
      .set({ currency: 'USD', openingBalanceCents: -1 })
      .where(eq(account.id, 'depot'))
      .run();
    opened.db.insert(fxRate).values({ currency: 'USD', date: DAY, rateMicro: 1 }).run();
    aggregatePosition('aggregate-tiny-held', 1, 1);
    aggregateReadOnly(() => {
      const read = netWorthValuationAsOf(opened.db, DAY);
      expect(Object.is(read.holdingsByAccount.depot, 0)).toBe(true);
      expect(Object.is(read.byAccount.depot, 0)).toBe(true);
      expect(Object.is(read.totalCents, 0)).toBe(true);
    });
  });
  it.each(['strict-first', 'fallible-first'] as const)(
    'keeps safe individual debt rows when only the total exceeds the range (%s)',
    (order) => {
      aggregateCash([-9007199254740991, -1]);
      aggregateReadOnly(() =>
        runWithRequestMemo(() => {
          if (order === 'strict-first')
            aggregateResultLimit(() => netWorthValuationAsOf(opened.db, DAY));
          const read = fallibleNetWorthValuationAsOf(opened.db, DAY);
          expect(read.calculationLimitAccountIds).toEqual([]);
          expect(read.valuation).toMatchObject({
            totalCents: null,
            byAccount: {
              depot: 0,
              'aggregate-0': -9007199254740991,
              'aggregate-1': -1,
            },
          });
          aggregateResultLimit(() => netWorthValuationAsOf(opened.db, DAY));
          expect(fallibleNetWorthValuationAsOf(opened.db, DAY)).toEqual(read);
          const debts = debtsAsOf(opened.db, DAY);
          expect(debts.totalEurCents).toBeNull();
          expect(debts.unavailableReason).toBe('calculation_limit');
          expect(debts.accounts.map((row) => row.owedEurCents)).toEqual([9007199254740991, 1]);
          expect(debts.accounts.map((row) => row.unavailableReason)).toEqual([null, null]);
        }),
      );
    },
  );
});
