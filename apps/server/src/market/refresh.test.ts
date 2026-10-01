import {
  createTestDatabase,
  priceSeries,
  priceStand,
  schema,
  sqliteOf,
  upsertFxRate,
  upsertPrice,
  type Db,
} from '@budget/db';
import {
  fixtureFxSource,
  fixtureQuoteSource,
  MarketError,
  type FxSource,
  type MarketSources,
  type QuoteSource,
  type SecurityRef,
} from '@budget/market';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshFx, refreshPrices } from './refresh';
import { marketModeFromEnv } from './sources';

let db: Db;

const addSecurity = (over: Partial<typeof schema.security.$inferInsert> = {}) =>
  db
    .insert(schema.security)
    .values({ id: 's1', name: 'Synthetischer Welt-ETF', kind: 'etf', symbol: 'SYN-A', ...over })
    .run();

const addTrade = (date: string, securityId = 's1') => {
  db.insert(schema.account)
    .values({
      id: 'depot',
      name: 'Depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2023-10-01',
    })
    .onConflictDoNothing()
    .run();
  db.insert(schema.trade)
    .values({
      id: `t-${date}`,
      securityId,
      accountId: 'depot',
      date,
      kind: 'buy',
      unitsE8: 100_000_000,
      amountCents: 10_000,
    })
    .run();
};

const inbox = () =>
  db.select().from(schema.inboxItem).where(eq(schema.inboxItem.kind, 'stale_value')).all();

/** A source that answers from a script and records what it was asked. */
function scripted(
  id: 'yfinance' | 'ariva',
  answer: (
    ref: SecurityRef,
    from: string,
    to: string,
  ) => Array<{ date: string; priceMicro: number }>,
): QuoteSource & { calls: Array<{ from: string; to: string }> } {
  const calls: Array<{ from: string; to: string }> = [];
  return {
    id,
    calls,
    async history(ref, from, to) {
      calls.push({ from, to });
      return answer(ref, from, to);
    },
  };
}
const failing = (id: 'yfinance' | 'ariva', kind: 'network' | 'http' = 'network') =>
  scripted(id, () => {
    throw new MarketError(kind, 'https://secret.example/?token=abc');
  });
const noFx: FxSource = { history: async () => [] };
const sourcesOf = (
  quotes: QuoteSource,
  fallbackQuotes?: QuoteSource,
  fx = noFx,
): MarketSources => ({
  quotes,
  fallbackQuotes,
  fx,
});

beforeEach(() => {
  db = createTestDatabase().db;
});

describe('refreshPrices', () => {
  it('records when a price is first fetched so the price stand has a timestamp', async () => {
    addSecurity();
    const source = scripted('yfinance', () => [{ date: '2026-09-30', priceMicro: 5_100_000 }]);

    const result = await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });

    expect(result.bySource.yfinance.rows).toBe(1);
    expect(priceStand(db, '2026-09-30')).toMatchObject({ priceDate: '2026-09-30' });
    expect(priceStand(db, '2026-09-30').priceAt ?? '').toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    );
    expect(db.select().from(schema.priceAudit).all()).toMatchObject([
      {
        securityId: 's1',
        date: '2026-09-30',
        oldPriceMicro: null,
        newPriceMicro: 5_100_000,
        oldSource: null,
        newSource: 'yfinance',
      },
    ]);
  });

  it('backfills from min(first trade, 2023-10-01) minus 7 days, stores the source', async () => {
    addSecurity();
    addTrade('2023-06-15');
    const source = scripted('yfinance', (_r, from) => [{ date: from, priceMicro: 100_000_000 }]);
    const result = await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });
    expect(source.calls).toEqual([{ from: '2023-06-08', to: '2026-09-30' }]);
    expect(result.bySource.yfinance).toEqual({ securities: 1, rows: 1 });
    expect(priceSeries(db, 's1')[0]).toMatchObject({ date: '2023-06-08', source: 'yfinance' });
  });

  it('starts at 2023-09-24 when the first trade is later, or there is none', async () => {
    addSecurity();
    addTrade('2024-02-01');
    addSecurity({ id: 's2', symbol: 'SYN-B', name: 'Zweiter' });
    const source = scripted('yfinance', () => [{ date: '2026-01-02', priceMicro: 1_000_000 }]);
    await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });
    expect(source.calls).toEqual([
      { from: '2023-09-24', to: '2026-09-30' },
      { from: '2023-09-24', to: '2026-09-30' },
    ]);
  });

  it('continues the day after the newest network price, and is idempotent', async () => {
    addSecurity();
    upsertPrice(db, {
      securityId: 's1',
      date: '2026-09-28',
      priceMicro: 5_000_000,
      currency: 'EUR',
      source: 'yfinance',
    });
    const source = scripted('yfinance', (_r, from) => [
      { date: from, priceMicro: 5_100_000 },
      { date: '2026-09-30', priceMicro: 5_200_000 },
    ]);
    const first = await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });
    expect(source.calls[0]).toEqual({ from: '2026-09-29', to: '2026-09-30' });
    expect(first.bySource.yfinance.rows).toBe(2);
    expect(db.select().from(schema.priceAudit).all()).toMatchObject([
      {
        date: '2026-09-29',
        oldPriceMicro: null,
        oldSource: null,
        newSource: 'yfinance',
      },
      {
        date: '2026-09-30',
        oldPriceMicro: null,
        oldSource: null,
        newSource: 'yfinance',
      },
    ]);
    const auditRows = db.select().from(schema.priceAudit).all();
    // Second run: the newest day is today, nothing to fetch.
    const second = await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });
    expect(second).toMatchObject({ tracked: 1, upToDate: 1 });
    expect(source.calls).toHaveLength(1);
    expect(priceSeries(db, 's1')).toHaveLength(3);
    // The same answer written again changes nothing, not even the audit trail.
    await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });
    expect(db.select().from(schema.priceAudit).all()).toEqual(auditRows);
  });

  it('never overwrites a manual price and does not count it as the newest network day', async () => {
    addSecurity();
    upsertPrice(db, {
      securityId: 's1',
      date: '2026-09-29',
      priceMicro: 7_000_000,
      currency: 'EUR',
      source: 'manual',
    });
    const source = scripted('yfinance', () => [
      { date: '2026-09-29', priceMicro: 9_000_000 },
      { date: '2026-09-30', priceMicro: 9_100_000 },
    ]);
    const result = await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });
    expect(result.protectedManual).toBe(1);
    expect(result.bySource.yfinance.rows).toBe(1);
    const series = priceSeries(db, 's1');
    expect(series.find((p) => p.date === '2026-09-29')).toMatchObject({
      priceMicro: 7_000_000,
      source: 'manual',
    });
    // The manual day was refused, so the backfill still started at the floor, not after it.
    expect(source.calls[0]?.from).toBe('2023-09-24');
    expect(db.select().from(schema.priceAudit).all()).toMatchObject([
      { date: '2026-09-30', oldPriceMicro: null, oldSource: null, newSource: 'yfinance' },
    ]);
  });

  it('does not timestamp a refresh when every returned quote is protected manual data', async () => {
    addSecurity();
    upsertPrice(db, {
      securityId: 's1',
      date: '2026-09-30',
      priceMicro: 7_000_000,
      currency: 'EUR',
      source: 'manual',
    });
    const source = scripted('yfinance', () => [{ date: '2026-09-30', priceMicro: 9_000_000 }]);

    const result = await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });

    expect(result.protectedManual).toBe(1);
    expect(result.bySource.yfinance.rows).toBe(0);
    expect(db.select().from(schema.priceAudit).all()).toEqual([]);
    expect(priceStand(db, '2026-09-30')).toEqual({ priceDate: '2026-09-30', priceAt: null });
  });

  it('uses the fallback when the primary fails or answers with nothing', async () => {
    addSecurity({ fallbackQuoteId: '1234' });
    addSecurity({ id: 's2', symbol: 'SYN-B', name: 'B', fallbackQuoteId: '99' });
    const ariva = scripted('ariva', (_r, from) => [{ date: from, priceMicro: 3_000_000 }]);
    const byId = (ref: SecurityRef) => ref.id;
    const primary = scripted('yfinance', (ref) => {
      if (byId(ref) === 's1') throw new MarketError('http', '503');
      return [];
    });
    const result = await refreshPrices(db, sourcesOf(primary, ariva), { today: '2026-09-30' });
    expect(result.bySource.ariva).toEqual({ securities: 2, rows: 2 });
    expect(result.failed).toEqual([]);
    expect(priceSeries(db, 's1')[0]?.source).toBe('ariva');
    expect(priceSeries(db, 's2')[0]?.source).toBe('ariva');
    expect(db.select().from(schema.priceAudit).all()).toHaveLength(2);
    expect(
      db
        .select()
        .from(schema.priceAudit)
        .all()
        .every((r) => r.newSource === 'ariva'),
    ).toBe(true);
    expect(inbox()).toHaveLength(0);
  });

  it('opens one stale_value item per security and error class, once, when all sources fail', async () => {
    addSecurity();
    const logs: string[] = [];
    const sources = sourcesOf(failing('yfinance'), failing('ariva', 'http'));
    const result = await refreshPrices(db, sources, {
      today: '2026-09-30',
      log: (m) => logs.push(m),
    });
    expect(result.failed).toEqual([{ securityId: 's1', errors: ['network', 'http'] }]);
    expect(db.select().from(schema.priceAudit).all()).toEqual([]);
    expect(priceStand(db, '2026-09-30')).toEqual({ priceDate: null, priceAt: null });
    expect(
      inbox()
        .map((i) => i.detail)
        .sort(),
    ).toEqual(['Fehlerklasse: http', 'Fehlerklasse: network']);
    expect(
      inbox().every((i) => i.refType === 'security' && i.refId === 's1' && !i.resolvedAt),
    ).toBe(true);
    // Running again does not pile up items.
    await refreshPrices(db, sources, { today: '2026-09-30' });
    expect(inbox()).toHaveLength(2);
    // Nothing secret reaches the log or the inbox.
    expect(JSON.stringify([logs, inbox()])).not.toMatch(/secret|token/);
    expect(db.select().from(schema.priceAudit).all()).toEqual([]);
  });

  it('closes the items when prices flow again', async () => {
    addSecurity();
    await refreshPrices(db, sourcesOf(failing('yfinance')), { today: '2026-09-30' });
    expect(inbox().filter((i) => !i.resolvedAt)).toHaveLength(1);
    const ok = scripted('yfinance', (_r, from) => [{ date: from, priceMicro: 1_000_000 }]);
    await refreshPrices(db, sourcesOf(ok), { today: '2026-09-30' });
    expect(inbox().filter((i) => !i.resolvedAt)).toHaveLength(0);
    expect(inbox()[0]?.resolution).toBeTruthy();
  });

  it('an empty answer is only a failure after a full week without quotes', async () => {
    addSecurity();
    upsertPrice(db, {
      securityId: 's1',
      date: '2026-09-25',
      priceMicro: 1_000_000,
      currency: 'EUR',
      source: 'yfinance',
    });
    const empty = scripted('yfinance', () => []);
    // Saturday to Sunday: no trading day, no news.
    await refreshPrices(db, sourcesOf(empty), { today: '2026-09-27' });
    expect(inbox()).toHaveLength(0);
    // Six weekdays later: stale.
    const result = await refreshPrices(db, sourcesOf(empty), { today: '2026-10-05' });
    expect(result.failed).toEqual([{ securityId: 's1', errors: ['empty'] }]);
    expect(inbox().map((i) => i.detail)).toEqual(['Fehlerklasse: empty']);
    expect(db.select().from(schema.priceAudit).all()).toEqual([]);
    expect(priceStand(db, '2026-10-05')).toEqual({ priceDate: '2026-09-25', priceAt: null });
  });

  it('rolls back an initial price and its refresh timestamp as one transaction', async () => {
    addSecurity();
    sqliteOf(db).exec(`
      CREATE TRIGGER reject_initial_price_audit BEFORE INSERT ON price_audit
      WHEN NEW.old_price_micro IS NULL
      BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;
    `);
    const source = scripted('yfinance', () => [{ date: '2026-09-30', priceMicro: 5_100_000 }]);

    const result = await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });

    expect(result.failed).toHaveLength(1);
    expect(priceSeries(db, 's1')).toEqual([]);
    expect(db.select().from(schema.priceAudit).all()).toEqual([]);
    expect(priceStand(db, '2026-09-30')).toEqual({ priceDate: null, priceAt: null });
  });

  it('skips securities that are switched off or have no quote id', async () => {
    addSecurity({ pricesEnabled: false });
    addSecurity({ id: 's2', symbol: null, name: 'P2P', kind: 'p2p' });
    const source = scripted('yfinance', () => []);
    const result = await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });
    expect(result.tracked).toBe(0);
    expect(source.calls).toHaveLength(0);
  });

  it('passes the per-security adjusted option and the quote currency to the source', async () => {
    addSecurity({ quoteAdjusted: true, currency: 'USD' });
    const seen: SecurityRef[] = [];
    const source = scripted('yfinance', (ref) => {
      seen.push(ref);
      return [{ date: '2026-09-29', priceMicro: 1_000_000 }];
    });
    await refreshPrices(db, sourcesOf(source), { today: '2026-09-30' });
    expect(seen[0]).toMatchObject({ adjusted: true, currency: 'USD', symbol: 'SYN-A' });
    expect(priceSeries(db, 's1')[0]?.currency).toBe('USD');
  });

  it('works with the fixture source: deterministic and through the stored prices', async () => {
    addSecurity();
    const anchors = [
      { date: '2023-09-30', priceMicro: 50_000_000 },
      { date: '2023-10-31', priceMicro: 52_000_000 },
    ];
    for (const a of anchors)
      upsertPrice(db, { securityId: 's1', ...a, currency: 'EUR', source: 'yfinance' });
    const sources: MarketSources = {
      quotes: fixtureQuoteSource({
        anchorsFor: (ref) =>
          priceSeries(db, ref.id).map((p) => ({ date: p.date, value: p.priceMicro })),
      }),
      fx: noFx,
    };
    const result = await refreshPrices(db, sources, { today: '2023-11-10' });
    expect(result.bySource.yfinance.rows).toBe(8);
    expect(priceSeries(db, 's1').at(-1)?.date).toBe('2023-11-10');
  });
});

describe('refreshFx', () => {
  it('reads currencies from accounts, securities and expected versions; full history first, then daily', async () => {
    db.insert(schema.account)
      .values({
        id: 'a',
        name: 'USD-Konto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        currency: 'USD',
        openingDate: '2023-10-01',
      })
      .run();
    addSecurity({ currency: 'GBP' });
    const asked: Array<[string, string, string]> = [];
    const fx: FxSource = {
      async history(currency, from, to) {
        asked.push([currency, from, to]);
        return [{ date: to, rateMicro: 900_000 }];
      },
    };
    const sources = sourcesOf(failing('yfinance'), undefined, fx);
    const first = await refreshFx(db, sources, { today: '2026-09-30' });
    expect(asked).toEqual([
      ['GBP', '1999-01-04', '2026-09-30'],
      ['USD', '1999-01-04', '2026-09-30'],
    ]);
    expect(first.bySource.ecb).toEqual({ currencies: 2, rows: 2 });
    // Next day: only the new day is fetched; the same day again fetches nothing.
    await refreshFx(db, sourcesOf(failing('yfinance'), undefined, fx), { today: '2026-10-01' });
    expect(asked.slice(2)).toEqual([
      ['GBP', '2026-10-01', '2026-10-01'],
      ['USD', '2026-10-01', '2026-10-01'],
    ]);
    const again = await refreshFx(db, sources, { today: '2026-10-01' });
    expect(again).toMatchObject({ currencies: 2, upToDate: 2 });
    expect(asked).toHaveLength(4);
    const rows = db
      .select()
      .from(schema.fxRate)
      .where(and(eq(schema.fxRate.currency, 'USD')))
      .all();
    expect(rows.map((r) => r.date)).toEqual(['2026-09-30', '2026-10-01']);
    expect(rows[0]?.source).toBe('ecb');
  });

  it('reports an error per currency with an inbox item, and ignores EUR', async () => {
    db.insert(schema.account)
      .values({
        id: 'a',
        name: 'USD-Konto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        currency: 'USD',
        openingDate: '2023-10-01',
      })
      .run();
    addSecurity();
    const fx: FxSource = {
      async history() {
        throw new MarketError('rate_limited');
      },
    };
    const result = await refreshFx(db, sourcesOf(failing('yfinance'), undefined, fx), {
      today: '2026-09-30',
    });
    expect(result.failed).toEqual([{ currency: 'USD', errors: ['rate_limited'] }]);
    expect(inbox()).toMatchObject([
      { refType: 'fx', refId: 'USD', detail: 'Fehlerklasse: rate_limited' },
    ]);
    await refreshFx(db, sourcesOf(failing('yfinance'), undefined, fx), { today: '2026-09-30' });
    expect(inbox()).toHaveLength(1);
  });

  it('fixture rates run through the stored rates', async () => {
    db.insert(schema.account)
      .values({
        id: 'a',
        name: 'USD-Konto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        currency: 'USD',
        openingDate: '2023-10-01',
      })
      .run();
    upsertFxRate(db, { date: '2026-09-14', currency: 'USD', rateMicro: 921_000, source: 'ecb' });
    const fx = fixtureFxSource({
      anchorsFor: () => [{ date: '2026-09-14', value: 921_000 }],
    });
    const result = await refreshFx(db, sourcesOf(failing('yfinance'), undefined, fx), {
      today: '2026-09-18',
    });
    expect(result.bySource.ecb.rows).toBe(4);
  });
});

describe('marketModeFromEnv', () => {
  it('defaults to fixture outside production and live in production; the variable wins', () => {
    expect(marketModeFromEnv({})).toBe('fixture');
    expect(marketModeFromEnv({ NODE_ENV: 'test' })).toBe('fixture');
    expect(marketModeFromEnv({ NODE_ENV: 'production' })).toBe('live');
    expect(marketModeFromEnv({ NODE_ENV: 'production', BUDGET_MARKET_SOURCES: 'fixture' })).toBe(
      'fixture',
    );
    expect(marketModeFromEnv({ BUDGET_MARKET_SOURCES: 'live' })).toBe('live');
    expect(() => marketModeFromEnv({ BUDGET_MARKET_SOURCES: 'yahoo' })).toThrow();
  });
});
