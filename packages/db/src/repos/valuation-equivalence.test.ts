import {
  addDays,
  costBasisOnDay,
  costInEur,
  valueAtPrice,
  PRICE_BACKFILL_TOLERANCE_DAYS,
  pickPrice,
  pickTradePrice,
  unitsHeld,
  type DatedPrice,
  type RateTable,
} from '@budget/domain';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, booking, fxRate, holding, price, security, trade } from '../schema';
import {
  holdingValuationExportAsOf,
  holdingValuesAsOf,
  netWorthAsOf,
  netWorthValuationAsOf,
} from './portfolio';
import { runWithRequestMemo } from './request-memo';
import { runWithValuationNotes } from './valuation-notes';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());

/**
 * The valuation of positions as it was written before the price lookup went per security by index:
 * the whole `price` table is read, cut per held security, and `pickPrice` chooses. Kept here as the
 * reference the optimised read must match value for value.
 */
function reference(db: OpenedDatabase['db'], asOf: string, estimate: boolean) {
  const live = new Set(
    db
      .select({ id: security.id })
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => s.id),
  );
  const currencies = new Map(
    db
      .select({ id: account.id, currency: account.currency })
      .from(account)
      .all()
      .map((a) => [a.id, a.currency]),
  );
  const snapshots = db
    .select()
    .from(holding)
    .where(and(lte(holding.asOf, asOf), isNull(holding.deletedAt)))
    .all();
  const allTrades = db
    .select()
    .from(trade)
    .where(isNull(trade.deletedAt))
    .orderBy(trade.date, trade.id)
    .all();
  const trades = allTrades.filter((t) => t.date <= asOf);
  const held = new Set<string>();
  for (const r of [...snapshots, ...trades]) if (live.has(r.securityId)) held.add(r.securityId);
  const bySecurity = new Map<string, DatedPrice[]>();
  const rows = estimate
    ? db
        .select()
        .from(price)
        .where(lte(price.date, addDays(asOf, PRICE_BACKFILL_TOLERANCE_DAYS)))
        .orderBy(price.date)
        .all()
    : db.select().from(price).where(lte(price.date, asOf)).orderBy(price.date).all();
  for (const p of rows) {
    if (!held.has(p.securityId)) continue;
    const list = bySecurity.get(p.securityId) ?? [];
    if (p.date > asOf && list.length > 0 && (list[list.length - 1] as DatedPrice).date > asOf)
      continue;
    list.push({ date: p.date, priceMicro: p.priceMicro, currency: p.currency });
    bySecurity.set(p.securityId, list);
  }
  const rates = db.select().from(fxRate).where(lte(fxRate.date, asOf)).all();
  const table = new Map<string, { date: string; rateMicro: number }[]>();
  for (const r of [...rates].sort((a, b) => a.date.localeCompare(b.date))) {
    const list = table.get(r.currency) ?? [];
    list.push({ date: r.date, rateMicro: r.rateMicro });
    table.set(r.currency, list);
  }
  const rateOf = (currency: string) =>
    currency === 'EUR'
      ? 1_000_000
      : rates
          .filter((r) => r.currency === currency && r.date <= asOf)
          .sort((a, b) => b.date.localeCompare(a.date))[0]?.rateMicro;
  const keys = new Map<string, { accountId: string; securityId: string }>();
  for (const r of [...snapshots, ...trades])
    if (live.has(r.securityId)) keys.set(`${r.accountId} ${r.securityId}`, r);
  const values: unknown[] = [];
  const missing: string[] = [];
  for (const { accountId, securityId } of keys.values()) {
    const mine = <T extends { accountId: string; securityId: string }>(list: T[]) =>
      list.filter((r) => r.accountId === accountId && r.securityId === securityId);
    const mySnapshots = mine(snapshots);
    const myTrades = mine(trades);
    const snapshot = [...mySnapshots].sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
    const units = unitsHeld(
      snapshot ? { asOf: snapshot.asOf, unitsE8: snapshot.unitsE8 } : undefined,
      myTrades,
      asOf,
    );
    if (units === 0) continue;
    const prices = bySecurity.get(securityId) ?? [];
    const choice =
      pickPrice(prices, asOf, false) ??
      (estimate
        ? pickTradePrice(
            allTrades
              .filter((t) => t.securityId === securityId)
              .map((t) => ({ ...t, currency: currencies.get(t.accountId) ?? 'EUR' })),
            asOf,
          )
        : undefined);
    if (!choice) {
      const accountCurrency = currencies.get(accountId) ?? 'EUR';
      const cost = {
        currency: accountCurrency,
        snapshots: mySnapshots.map((r) => ({ date: r.asOf, costBasisCents: r.costBasisCents })),
        trades: myTrades,
      };
      const basis = estimate
        ? costBasisOnDay(
            mySnapshots.map((r) => ({ date: r.asOf, unitsE8: r.unitsE8 })),
            cost,
            asOf,
          )
        : null;
      const eur =
        basis === null ? null : costInEur(basis, accountCurrency, table as RateTable, asOf);
      if (eur === null) {
        missing.push(`${accountId} ${securityId}`);
        continue;
      }
      values.push({
        accountId,
        securityId,
        unitsE8: units,
        priceMicro: Math.round((eur * 1e12) / units),
        priceCurrency: 'EUR',
        fxRateMicro: 1_000_000,
        valueCents: eur,
        quality: 'estimated',
        priceDate: null,
      });
      continue;
    }
    const { priceMicro, currency: priceCurrency } = choice.price;
    const fxRateMicro = rateOf(priceCurrency);
    if (fxRateMicro === undefined) {
      missing.push(`fx ${accountId} ${securityId}`);
      continue;
    }
    values.push({
      accountId,
      securityId,
      unitsE8: units,
      priceMicro,
      priceCurrency,
      fxRateMicro,
      valueCents: valueAtPrice(units, choice, fxRateMicro),
      quality: choice.quality,
      priceDate: choice.price.date,
    });
  }
  const byKey = (a: { accountId: string; securityId: string }, b: typeof a) =>
    a.accountId.localeCompare(b.accountId) || a.securityId.localeCompare(b.securityId);
  return {
    values: (values as { accountId: string; securityId: string }[]).sort(byKey),
    missing: missing.sort(),
  };
}

/** Small deterministic generator, so a failing day can be reproduced. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function seedScenario(seed: number) {
  const next = random(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const day = (offset: number) => addDays('2026-01-01', offset);
  const db = opened.db;
  for (const [id, currency] of [
    ['depot-a', 'EUR'],
    ['depot-b', 'EUR'],
    ['depot-usd', 'USD'],
  ] as const)
    db.insert(account)
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
  const securities = [
    ['eur-1', 'EUR'],
    ['eur-2', 'EUR'],
    ['usd-1', 'USD'],
    ['none', 'EUR'],
    ['gone', 'EUR'],
  ] as const;
  for (const [id, currency] of securities)
    db.insert(security)
      .values({
        id,
        name: id,
        kind: 'stock',
        currency,
        ...(id === 'gone' ? { deletedAt: 'x' } : {}),
      })
      .run();
  for (let d = 0; d < 280; d += 7)
    db.insert(fxRate)
      .values({ date: day(d), currency: 'USD', rateMicro: 900_000 + d * 100 })
      .run();
  for (const [id, currency] of securities) {
    if (id === 'none') continue;
    // Sparse quotes with long gaps, a start well after the first holding day, and some after the end.
    const start = int(0, 90);
    for (let d = start; d < 300; d += int(1, 40))
      db.insert(price)
        .values({
          securityId: id,
          date: day(d),
          priceMicro: int(1_000_000, 90_000_000),
          currency,
          source: 'manual',
        })
        .run();
  }
  for (const accountId of ['depot-a', 'depot-b', 'depot-usd'])
    for (const [securityId] of securities) {
      if (next() < 0.35) continue;
      if (next() < 0.4)
        db.insert(holding)
          .values({
            id: `h-${accountId}-${securityId}`,
            accountId,
            securityId,
            asOf: day(int(0, 20)),
            unitsE8: int(1, 500) * 100_000_000,
            costBasisCents: next() < 0.8 ? int(1_000, 90_000) : null,
          })
          .run();
      for (let n = int(0, 4); n > 0; n--) {
        const kind = next() < 0.75 ? 'buy' : 'sell';
        db.insert(trade)
          .values({
            id: `t-${accountId}-${securityId}-${n}`,
            accountId,
            securityId,
            date: day(int(10, 250)),
            kind,
            unitsE8: (kind === 'buy' ? 1 : -1) * int(1, 200) * 10_000_000,
            amountCents: int(1_000, 80_000),
          })
          .run();
      }
    }
  return { days: Array.from({ length: 40 }, () => day(int(-5, 320))) };
}

describe('holding valuation: indexed price lookup equals the full-table read', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`scenario ${seed}: every position, price, quality and value agrees on every day`, () => {
      const { days } = seedScenario(seed);
      let positions = 0;
      for (const asOf of days) {
        for (const estimate of [true, false]) {
          const expected = reference(opened.db, asOf, estimate);
          const got = holdingValuationExportAsOf(opened.db, asOf, { estimate });
          expect(got.values, `${asOf} estimate=${estimate}`).toEqual(expected.values);
          expect(
            [
              ...got.missingPricePositions.map((p) => `${p.accountId} ${p.securityId}`),
              ...got.missingFxPositions.map((p) => `fx ${p.accountId} ${p.securityId}`),
            ].sort(),
            `${asOf} estimate=${estimate}`,
          ).toEqual(expected.missing);
          positions += got.values.length;
        }
      }
      // The scenario must actually exercise priced, stale and estimated positions.
      expect(positions).toBeGreaterThan(100);
    });
  }

  it('covers every quality including cost-only snapshots', () => {
    seedScenario(7);
    opened.db
      .insert(security)
      .values({ id: 'cost-only', name: 'Synthetic cost-only', kind: 'stock', currency: 'EUR' })
      .run();
    opened.db
      .insert(holding)
      .values({
        id: 'cost-only-h',
        accountId: 'depot-a',
        securityId: 'cost-only',
        asOf: '2026-01-01',
        unitsE8: 1e8,
        costBasisCents: 700,
      })
      .run();
    const qualities = new Set<string>();
    for (let d = -10; d < 330; d += 3)
      for (const v of holdingValuationExportAsOf(opened.db, addDays('2026-01-01', d)).values)
        qualities.add(v.quality);
    expect([...qualities].sort()).toEqual(['estimated', 'exact', 'stale']);
  });
});

describe('request memo of valuations', () => {
  const insertBooking = (id: string, amountCents: number) =>
    opened.db
      .insert(booking)
      .values({ id, accountId: 'cash', date: '2026-03-01', amountCents, status: 'confirmed' })
      .run();
  const seedCash = () =>
    opened.db
      .insert(account)
      .values({
        id: 'cash',
        name: 'Cash',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
        openingBalanceCents: 1_000,
      })
      .run();

  it('does nothing outside a request and gives the same numbers inside one', () => {
    seedScenario(3);
    const outside = netWorthValuationAsOf(opened.db, '2026-06-30');
    const inside = runWithValuationNotes(() => {
      const first = netWorthValuationAsOf(opened.db, '2026-06-30');
      const second = netWorthValuationAsOf(opened.db, '2026-06-30');
      expect(second).toEqual(first);
      expect(netWorthAsOf(opened.db, '2026-06-30').totalCents).toBe(first.totalCents);
      expect(holdingValuesAsOf(opened.db, '2026-06-30').length).toBeGreaterThan(0);
      return first;
    });
    expect(inside).toEqual(outside);
  });

  it('never serves a value across a write of the same request', () => {
    seedCash();
    runWithRequestMemo(() => {
      expect(netWorthValuationAsOf(opened.db, '2026-06-30').totalCents).toBe(1_000);
      insertBooking('b1', 250);
      expect(netWorthValuationAsOf(opened.db, '2026-06-30').totalCents).toBe(1_250);
      // A rolled-back write does not leave a stale entry either.
      expect(() =>
        opened.db.transaction((tx) => {
          tx.update(account)
            .set({ openingBalanceCents: 5_000 })
            .where(eq(account.id, 'cash'))
            .run();
          expect(netWorthValuationAsOf(tx, '2026-06-30').totalCents).toBe(5_250);
          // The plain handle inside an open transaction sees the same state and is not memoised.
          expect(netWorthValuationAsOf(opened.db, '2026-06-30').totalCents).toBe(5_250);
          throw new Error('rollback');
        }),
      ).toThrow('rollback');
      expect(netWorthValuationAsOf(opened.db, '2026-06-30').totalCents).toBe(1_250);
    });
  });

  it('hands out copies: a caller that edits a result does not change the next answer', () => {
    seedScenario(2);
    runWithRequestMemo(() => {
      const first = netWorthValuationAsOf(opened.db, '2026-06-30');
      const reference = structuredClone(first);
      first.byAccount['depot-a'] = 123;
      first.missingFxCurrencies.push('XXX');
      const holdings = holdingValuesAsOf(opened.db, '2026-06-30');
      const copy = structuredClone(holdings);
      holdings.splice(0, holdings.length);
      expect(netWorthValuationAsOf(opened.db, '2026-06-30')).toEqual(reference);
      expect(holdingValuesAsOf(opened.db, '2026-06-30')).toEqual(copy);
    });
  });
});
