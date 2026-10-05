import { createTestDatabase, priceSeries, schema, type Db } from '@budget/db';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshMarket } from './timer';
import { createMarketSources } from './sources';

const data = (name: string) =>
  readFileSync(resolve(import.meta.dirname, '../../../../packages/market/test-data', name), 'utf8');

let db: Db;
beforeEach(() => {
  db = createTestDatabase().db;
});

const add = (id: string, over: Partial<typeof schema.security.$inferInsert>) =>
  db
    .insert(schema.security)
    .values({ id, name: id, kind: 'etf', ...over })
    .run();

/** Routes by host, like the real services; records what was asked, never touches the network. */
function network() {
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const host = new URL(url).hostname;
    if (host === 'www.ariva.de') return new Response(data('ariva-historic.html'));
    if (host === 'cryptocalc.cc') return new Response(data('cryptocalc-prices.html'));
    if (host === 'api.coingecko.com') return new Response(data('coingecko-market-chart.json'));
    if (host === 'query1.finance.yahoo.com') return new Response(data('yahoo-chart.json'));
    if (host === 'data-api.ecb.europa.eu') return new Response(data('ecb-exr-usd.csv'));
    return new Response('unexpected host', { status: 500 });
  }) as typeof fetch;
  return { urls, http: { fetch: fetchImpl, sleep: async () => undefined } };
}

describe('createMarketSources (live)', () => {
  it('Ariva is primary, CoinGecko primary for crypto, cryptocalc its fallback, Yahoo the last resort', async () => {
    add('etf', { quoteUrl: 'https://www.ariva.de/etf/syn/kurse/historische-kurse?boerse_id=45' });
    add('btc', { kind: 'crypto', coingeckoId: 'bitcoin', symbol: 'BTC-EUR' });
    add('eth', { kind: 'crypto', coingeckoId: 'ethereum' });
    add('no-id', {
      kind: 'crypto',
      symbol: 'XYZ-EUR',
      quoteUrl: 'https://www.ariva.de/krypto/syn/kurse/historische-kurse',
    });
    // Bitpanda-only product: no coin id, so the cryptocalc fallback (from the PP link) prices it.
    add('lev', {
      kind: 'crypto',
      quoteUrl: 'https://cryptocalc.cc/bitpanda-kurse/?currency=BTC2L&fiat=EUR&range=all',
    });
    add('yahoo-only', { symbol: 'SYN-ETFW' });
    const net = network();
    const sources = createMarketSources(db, 'live', {}, net.http);
    expect(sources.quotes.id).toBe('ariva');
    expect(sources.moreQuotes?.map((s) => s.id)).toEqual(['coingecko', 'cryptocalc']);
    expect(sources.fallbackQuotes?.id).toBe('yfinance');
    const { prices } = await refreshMarket(db, sources, '2024-01-04');
    expect(prices.bySource.ariva.securities).toBe(5);
    expect(prices.bySource.coingecko.securities).toBe(2);
    expect(prices.bySource.cryptocalc.securities).toBe(1);
    expect(priceSeries(db, 'lev')[0]?.source).toBe('cryptocalc');
    expect(prices.bySource.yfinance.securities).toBe(1);
    // A crypto security without a coin id is reported, never priced by Ariva or Yahoo.
    expect(prices.failed).toEqual([{ securityId: 'no-id', errors: ['not_configured'] }]);
    expect(priceSeries(db, 'etf').map((p) => p.source)).toContain('ariva');
    expect(priceSeries(db, 'btc').at(-1)).toMatchObject({
      date: '2024-01-04',
      priceMicro: 40_100_000_000,
      source: 'coingecko',
    });
    expect(urlsOf(net.urls, 'api.coingecko.com')).toHaveLength(2);
    expect(urlsOf(net.urls, 'cryptocalc.cc')).toHaveLength(1);
    expect(urlsOf(net.urls, 'query1.finance.yahoo.com')).toHaveLength(1);
  });

  it('BUDGET_ARIVA=0 switches Ariva off: its securities are reported, nothing is fetched there', async () => {
    add('etf', { quoteUrl: 'https://www.ariva.de/etf/syn/kurse/historische-kurse' });
    const net = network();
    const sources = createMarketSources(db, 'live', { BUDGET_ARIVA: '0' }, net.http);
    const { prices } = await refreshMarket(db, sources, '2024-01-04');
    expect(prices.failed).toEqual([{ securityId: 'etf', errors: ['not_configured'] }]);
    expect(urlsOf(net.urls, 'www.ariva.de')).toHaveLength(0);
  });
});

const urlsOf = (urls: string[], host: string) => urls.filter((u) => new URL(u).hostname === host);
