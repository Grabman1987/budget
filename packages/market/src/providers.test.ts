import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arivaSource, parseArivaHtml, parseArivaUrl } from './ariva';
import { coingeckoSource, parseCoingeckoChart } from './coingecko';
import { cryptocalcSource, parseCryptocalcHtml, parseCryptocalcUrl } from './cryptocalc';
import {
  COINGECKO_IDS,
  cryptocalcSymbol,
  deriveCoingeckoId,
  resolveCoingeckoId,
} from './coingecko-ids';
import { ecbSource, parseEcbCsv } from './ecb';
import { MarketError } from './errors';
import { fixtureCpiMonths } from './fixture';
import { chainVpi, parseVpiCsv, parseVpiDataset, vpiSource } from './vpi';
import { getText } from './http';
import type { SecurityRef } from './types';
import { parseYahooChart, yahooChartSource } from './yahoo';

const data = (name: string) =>
  readFileSync(resolve(import.meta.dirname, '../test-data', name), 'utf8');

const REF: SecurityRef = {
  id: 'sec-1',
  kind: 'etf',
  symbol: 'SYN-ETFW',
  fallbackQuoteId: '1234',
  quoteExchange: '7',
  quoteUrl: null,
  coingeckoId: null,
  currency: 'EUR',
  adjusted: false,
};

const respond =
  (body: string, status = 200) =>
  async () =>
    new Response(body, { status });

const kindOf = async (run: () => unknown): Promise<string> => {
  try {
    await run();
  } catch (error) {
    return error instanceof MarketError ? error.kind : 'other';
  }
  return 'none';
};

describe('Yahoo chart parser', () => {
  it('reads unadjusted closes as decimal text into micro-units and skips null bars', () => {
    const quotes = parseYahooChart(data('yahoo-chart.json'), REF, '2024-01-01', '2024-01-31');
    expect(quotes).toEqual([
      { date: '2024-01-02', priceMicro: 85_120_003 },
      { date: '2024-01-03', priceMicro: 85_500_000 },
      { date: '2024-01-05', priceMicro: 86_000_001 },
    ]);
  });

  it('reads the adjusted close when the security asks for it', () => {
    const quotes = parseYahooChart(
      data('yahoo-chart.json'),
      { ...REF, adjusted: true },
      '2024-01-01',
      '2024-01-31',
    );
    expect(quotes.map((q) => q.priceMicro)).toEqual([
      84_000_000, 84_400_000, 84_500_000, 84_900_000,
    ]);
  });

  it('keeps only days inside from..to', () => {
    const quotes = parseYahooChart(data('yahoo-chart.json'), REF, '2024-01-03', '2024-01-04');
    expect(quotes.map((q) => q.date)).toEqual(['2024-01-03']);
  });

  it('drops the bar of a session that is still open', () => {
    const quotes = parseYahooChart(
      data('yahoo-chart-open-session.json'),
      REF,
      '2024-01-01',
      '2024-01-31',
    );
    expect(quotes).toEqual([{ date: '2024-01-05', priceMicro: 86_000_000 }]);
  });

  it('refuses a quote currency that differs from the security', async () => {
    const run = () =>
      parseYahooChart(data('yahoo-chart-usd.json'), REF, '2024-01-01', '2024-01-31');
    expect(await kindOf(run)).toBe('currency_mismatch');
  });

  it('classifies error answers', async () => {
    const run = (text: string) => () => parseYahooChart(text, REF, '2024-01-01', '2024-01-31');
    expect(await kindOf(run(data('yahoo-chart-not-found.json')))).toBe('not_found');
    expect(await kindOf(run('<html>blocked</html>'))).toBe('parse');
    expect(await kindOf(run('{"chart":{"result":[],"error":null}}'))).toBe('empty');
    const noCloses = '{"chart":{"result":[{"meta":{},"timestamp":[1]}],"error":null}}';
    expect(await kindOf(run(noCloses))).toBe('parse');
  });

  it('builds the request from the symbol and needs one', async () => {
    const urls: string[] = [];
    const source = yahooChartSource({
      fetch: async (url) => {
        urls.push(String(url));
        return new Response(data('yahoo-chart.json'));
      },
    });
    expect(source.id).toBe('yfinance');
    expect(source.supports?.(REF)).toBe(true);
    expect(source.supports?.({ ...REF, kind: 'crypto' })).toBe(false);
    expect(await source.history(REF, '2024-01-02', '2024-01-05')).toHaveLength(3);
    expect(urls[0]).toContain('/v8/finance/chart/SYN-ETFW?period1=');
    expect(urls[0]).toContain('interval=1d');
    for (const symbol of [null, 'A/../B'])
      expect(
        await kindOf(() => source.history({ ...REF, symbol }, '2024-01-02', '2024-01-05')),
      ).toBe('not_configured');
  });
});

describe('Ariva historic-quotes page', () => {
  const PAGE = 'https://www.ariva.de/etf/synthetic-world-etf/kurse/historische-kurse';
  const NOW = () => new Date('2024-01-08T01:30:00Z');
  const ref = (over: Partial<SecurityRef> = {}): SecurityRef => ({
    ...REF,
    quoteExchange: null,
    quoteUrl: `${PAGE}?boerse_id=45&go=1`,
    ...over,
  });

  it('reads German decimals and dates from the table and skips rows without a close', () => {
    expect(parseArivaHtml(data('ariva-historic.html'), REF, '2023-12-01', '2024-01-31')).toEqual([
      { date: '2024-01-02', priceMicro: 84_950_000 },
      { date: '2024-01-03', priceMicro: 1_234_500_000 },
      { date: '2024-01-04', priceMicro: 85_470_000 },
      { date: '2024-01-05', priceMicro: 86_010_000 },
    ]);
  });

  it('drops the row of the running session (marked with *) and keeps the range', () => {
    const all = parseArivaHtml(data('ariva-historic.html'), REF, '2024-01-01', '2024-01-08');
    expect(all.some((q) => q.date === '2024-01-08')).toBe(false);
    expect(
      parseArivaHtml(data('ariva-historic.html'), REF, '2024-01-04', '2024-01-04'),
    ).toHaveLength(1);
  });

  it('refuses a page without the price table (login, consent, redesign) and another currency', async () => {
    const run = () => parseArivaHtml(data('ariva-login.html'), REF, '2024-01-01', '2024-01-31');
    expect(await kindOf(run)).toBe('parse');
    const usd = () =>
      parseArivaHtml(data('ariva-historic-usd.html'), REF, '2024-01-01', '2024-01-31');
    expect(await kindOf(usd)).toBe('currency_mismatch');
    expect(
      parseArivaHtml(
        data('ariva-historic-usd.html'),
        { currency: 'USD' },
        '2024-01-01',
        '2024-01-31',
      ),
    ).toHaveLength(2);
  });

  it('only accepts https quote pages on ariva.de', () => {
    expect(parseArivaUrl(`${PAGE}?boerse_id=45`)).toEqual({
      path: '/etf/synthetic-world-etf/kurse/historische-kurse',
      exchange: '45',
    });
    expect(parseArivaUrl('https://ariva.de/x-aktie/kurse/historische-kurse')?.exchange).toBe(
      undefined,
    );
    for (const bad of [
      null,
      '',
      'not a url',
      'http://www.ariva.de/x/kurse/historische-kurse',
      'https://evil.example/www.ariva.de/x/kurse/historische-kurse',
      'https://www.ariva.de.evil.example/x/kurse/historische-kurse',
      'https://user:pw@www.ariva.de/x/kurse/historische-kurse',
      'https://www.ariva.de/x/kurse/historische-kurse?boerse_id=4;5',
      'https://www.ariva.de/etf/x',
    ])
      expect(parseArivaUrl(bad), String(bad)).toBeUndefined();
  });

  it('fetches the 30-day page for a recent window: one request, no credentials', async () => {
    const urls: string[] = [];
    const on = arivaSource({
      enabled: true,
      now: NOW,
      minIntervalMs: 0,
      fetch: async (url, init) => {
        urls.push(String(url));
        expect(JSON.stringify(init?.headers)).not.toMatch(/cookie|authorization/i);
        return new Response(data('ariva-historic.html'));
      },
    });
    expect(on.id).toBe('ariva');
    expect(on.supports?.(ref())).toBe(true);
    expect(on.supports?.(ref({ quoteUrl: null }))).toBe(false);
    expect(on.supports?.(ref({ kind: 'crypto' }))).toBe(false);
    expect(await on.history(ref(), '2024-01-03', '2024-01-07')).toHaveLength(3);
    expect(urls).toEqual([
      'https://www.ariva.de/etf/synthetic-world-etf/kurse/historische-kurse?boerse_id=45',
    ]);
  });

  it('prefers the stored exchange and pages month by month for an older window', async () => {
    const urls: string[] = [];
    const on = arivaSource({
      enabled: true,
      now: NOW,
      minIntervalMs: 0,
      fetch: async (url) => {
        urls.push(String(url));
        return new Response(data('ariva-historic.html'));
      },
    });
    const quotes = await on.history(ref({ quoteExchange: '131' }), '2023-11-15', '2024-01-05');
    expect(urls.map((u) => u.split('?')[1])).toEqual([
      'boerse_id=131&month=2023-11-30',
      'boerse_id=131&month=2023-12-31',
      'boerse_id=131&month=2024-01-31',
    ]);
    // The same fixture page three times: de-duplicated by day.
    expect(quotes.map((q) => q.date)).toEqual([
      '2024-01-02',
      '2024-01-03',
      '2024-01-04',
      '2024-01-05',
    ]);
  });

  it('supports bounded old backfill windows rather than cutting them off at wall-clock today', async () => {
    const urls: string[] = [];
    const on = arivaSource({
      enabled: true,
      now: NOW,
      minIntervalMs: 0,
      fetch: async (url) => {
        urls.push(String(url));
        return new Response(data('ariva-historic.html'));
      },
    });
    await on.history(ref(), '2020-01-01', '2020-02-10');
    expect(urls.map((u) => new URL(u).searchParams.get('month'))).toEqual([
      '2020-01-31',
      '2020-02-29',
    ]);
  });

  it('waits between two requests and refuses when off or without a usable url', async () => {
    const pauses: number[] = [];
    const on = arivaSource({
      enabled: true,
      now: NOW,
      minIntervalMs: 5_000,
      sleep: async (ms) => void pauses.push(ms),
      fetch: async () => new Response(data('ariva-historic.html')),
    });
    await on.history(ref(), '2024-01-03', '2024-01-05');
    await on.history(ref(), '2024-01-03', '2024-01-05');
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toBeGreaterThan(0);
    const off = arivaSource({ enabled: false, fetch: respond(data('ariva-historic.html')) });
    expect(await kindOf(() => off.history(ref(), '2024-01-01', '2024-01-31'))).toBe(
      'not_configured',
    );
    for (const over of [
      { quoteUrl: null },
      { quoteUrl: 'https://evil.example/kurse/x' },
      { quoteExchange: '4;5' },
    ])
      expect(await kindOf(() => on.history(ref(over), '2024-01-03', '2024-01-05'))).toBe(
        'not_configured',
      );
  });

  it('classifies a login page as parse and a 404 as not_found', async () => {
    const page = arivaSource({
      enabled: true,
      now: NOW,
      minIntervalMs: 0,
      fetch: respond(data('ariva-login.html')),
    });
    expect(await kindOf(() => page.history(ref(), '2024-01-03', '2024-01-05'))).toBe('parse');
    const gone = arivaSource({
      enabled: true,
      now: NOW,
      minIntervalMs: 0,
      fetch: respond('', 404),
    });
    expect(await kindOf(() => gone.history(ref(), '2024-01-03', '2024-01-05'))).toBe('not_found');
  });
});

describe('cryptocalc fallback source', () => {
  const CRYPTO_URL = 'https://cryptocalc.cc/bitpanda-kurse/?currency=BTC&fiat=EUR&range=all';
  const NOW = () => new Date('2024-01-06T00:30:00Z');
  const ref = (over: Partial<SecurityRef> = {}): SecurityRef => ({
    ...REF,
    symbol: null,
    quoteUrl: CRYPTO_URL,
    kind: 'crypto',
    coingeckoId: null,
    ...over,
  });

  it('cryptocalc: reads the Schluss column and drops the running UTC day', () => {
    const page = data('cryptocalc-prices.html');
    expect(parseCryptocalcHtml(page, '2024-01-01', '2024-01-31', '2024-01-05')).toEqual([
      { date: '2024-01-02', priceMicro: 39_000_000_000 },
      { date: '2024-01-03', priceMicro: 39_500_000_000 },
      { date: '2024-01-04', priceMicro: 40_100_000_000 },
    ]);
    expect(parseCryptocalcHtml(page, '2024-01-01', '2024-01-31', '2024-01-06')).toHaveLength(4);
  });

  it('cryptocalc: only cryptocalc.cc, and the page currency must be the security currency', async () => {
    expect(parseCryptocalcUrl(CRYPTO_URL)).toEqual({
      path: '/bitpanda-kurse/',
      currency: 'BTC',
      fiat: 'EUR',
    });
    for (const bad of [
      null,
      'https://evil.example/bitpanda-kurse/?currency=BTC&fiat=EUR',
      'https://cryptocalc.cc.evil.example/bitpanda-kurse/?currency=BTC&fiat=EUR',
      'http://cryptocalc.cc/bitpanda-kurse/?currency=BTC&fiat=EUR',
      'https://cryptocalc.cc/bitpanda-kurse/?currency=B/../TC&fiat=EUR',
      'https://cryptocalc.cc/bitpanda-kurse/',
    ])
      expect(parseCryptocalcUrl(bad), String(bad)).toBeUndefined();
    const urls: string[] = [];
    const source = cryptocalcSource({
      now: NOW,
      minIntervalMs: 0,
      fetch: async (url) => {
        urls.push(String(url));
        return new Response(data('cryptocalc-prices.html'));
      },
    });
    expect(source.id).toBe('cryptocalc');
    expect(await source.history(ref(), '2024-01-03', '2024-01-05')).toHaveLength(3);
    expect(urls[0]).toBe('https://cryptocalc.cc/bitpanda-kurse/?currency=BTC&fiat=EUR&range=month');
    await source.history(ref(), '2023-10-01', '2024-01-05');
    expect(urls[1]).toContain('range=year');
    const kind = (over: Partial<SecurityRef>) =>
      kindOf(() => source.history(ref(over), '2024-01-03', '2024-01-05'));
    expect(await kind({ currency: 'USD' })).toBe('currency_mismatch');
    expect(await kind({ quoteUrl: null })).toBe('not_configured');
    const blocked = () =>
      parseCryptocalcHtml('<html>blocked</html>', '2024-01-01', '2024-01-31', '2024-02-01');
    expect(await kindOf(blocked)).toBe('parse');
  });

  it('is only a fallback: not for a coin with a CoinGecko id, nor for other kinds', () => {
    const source = cryptocalcSource({ fetch: respond('') });
    expect(source.supports?.(ref())).toBe(true);
    expect(source.supports?.(ref({ coingeckoId: 'bitcoin' }))).toBe(false);
    expect(source.supports?.(ref({ kind: 'etf' }))).toBe(false);
    expect(source.supports?.(ref({ quoteUrl: null }))).toBe(false);
  });
});

describe('CoinGecko source (primary for crypto)', () => {
  const NOW = () => new Date('2024-01-06T00:30:00Z');
  const ref = (over: Partial<SecurityRef> = {}): SecurityRef => ({
    ...REF,
    kind: 'crypto',
    symbol: null,
    coingeckoId: 'bitcoin',
    ...over,
  });
  const chart = () => data('coingecko-market-chart.json');
  const kind = (source: ReturnType<typeof coingeckoSource>, over: Partial<SecurityRef>) =>
    kindOf(() => source.history(ref(over), '2024-01-03', '2024-01-05'));

  it('a 00:00 UTC point is the close of the day before, the running point is dropped', () => {
    expect(parseCoingeckoChart(chart(), '2024-01-01', '2024-01-31')).toEqual([
      { date: '2024-01-01', priceMicro: 38_010_120_000 },
      { date: '2024-01-02', priceMicro: 39_000_500_000 },
      { date: '2024-01-03', priceMicro: 39_500_250_000 },
      { date: '2024-01-04', priceMicro: 40_100_000_000 },
    ]);
    expect(parseCoingeckoChart(chart(), '2024-01-03', '2024-01-03')).toHaveLength(1);
  });

  it('asks for the daily chart in the security currency, one request, needs a coin id', async () => {
    const urls: string[] = [];
    const source = coingeckoSource({
      now: NOW,
      minIntervalMs: 0,
      fetch: async (url) => {
        urls.push(String(url));
        return new Response(chart());
      },
    });
    expect(source.id).toBe('coingecko');
    expect(source.supports?.(ref())).toBe(true);
    expect(source.supports?.(ref({ coingeckoId: null }))).toBe(false);
    expect(await source.history(ref(), '2024-01-03', '2024-01-05')).toHaveLength(2);
    expect(urls).toEqual([
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=eur&days=5&interval=daily',
    ]);
    expect(await kind(source, { coingeckoId: null })).toBe('not_configured');
    expect(await kind(source, { coingeckoId: 'bitcoin/../x' })).toBe('not_configured');
    expect(await kind(source, { currency: 'eur' })).toBe('not_configured');
  });

  it('classifies a non-chart answer (HTML, API error body) as parse', async () => {
    expect(await kindOf(() => parseCoingeckoChart('<html>', '2024-01-01', '2024-01-31'))).toBe(
      'parse',
    );
    const limited = () =>
      parseCoingeckoChart('{"status":{"error_code":429}}', '2024-01-01', '2024-01-31');
    expect(await kindOf(limited)).toBe('parse');
  });

  it('spaces requests of the free tier apart (6 s by default)', async () => {
    const pauses: number[] = [];
    const source = coingeckoSource({
      now: NOW,
      sleep: async (ms) => void pauses.push(ms),
      fetch: async () => new Response(chart()),
    });
    await source.history(ref(), '2024-01-03', '2024-01-05');
    await source.history(ref({ coingeckoId: 'ethereum' }), '2024-01-03', '2024-01-05');
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toBeGreaterThan(5_000);
    expect(pauses[0]).toBeLessThanOrEqual(6_000);
  });

  it('on HTTP 429 waits Retry-After, then the doubling backoff, and gives up as rate_limited', async () => {
    const pauses: number[] = [];
    const answers = [
      new Response('slow down', { status: 429, headers: { 'retry-after': '45' } }),
      new Response('slow down', { status: 429 }),
      new Response(chart()),
    ];
    const source = coingeckoSource({
      now: NOW,
      minIntervalMs: 0,
      sleep: async (ms) => void pauses.push(ms),
      fetch: async () => answers.shift() as Response,
    });
    expect(await source.history(ref(), '2024-01-03', '2024-01-05')).toHaveLength(2);
    // First retry follows the server's Retry-After, the second the doubled backoff (20 s x 2).
    expect(pauses).toEqual([45_000, 40_000]);
    const always = coingeckoSource({
      now: NOW,
      minIntervalMs: 0,
      sleep: async () => undefined,
      fetch: async () => new Response('', { status: 429 }),
    });
    expect(await kind(always, {})).toBe('rate_limited');
  });
});

describe('coin ids from ticker and name', () => {
  it('resolves a ticker through the curated table, also from a cryptocalc link', () => {
    expect(deriveCoingeckoId({ symbol: 'BTC' })).toEqual({
      status: 'resolved',
      id: 'bitcoin',
      symbol: 'BTC',
      via: 'symbol',
    });
    expect(deriveCoingeckoId({ symbol: 'eth-eur', name: 'Ethereum' })).toMatchObject({
      status: 'resolved',
      id: 'ethereum',
    });
    const link = 'https://cryptocalc.cc/bitpanda-kurse/?currency=LINK&fiat=EUR&range=all';
    expect(cryptocalcSymbol(link)).toBe('LINK');
    expect(deriveCoingeckoId({ quoteUrl: link, name: 'Chainlink' })).toMatchObject({
      status: 'resolved',
      id: 'chainlink',
      symbol: 'LINK',
    });
    expect(deriveCoingeckoId({ quoteUrl: link })).toMatchObject({ id: 'chainlink' });
    expect(deriveCoingeckoId({ symbol: 'BCH', name: 'Bitcoin Cash' })).toMatchObject({
      status: 'resolved',
      id: 'bitcoin-cash',
    });
  });

  it('uses the name only when there is no ticker at all', () => {
    expect(deriveCoingeckoId({ name: 'Solana' })).toMatchObject({
      status: 'resolved',
      id: 'solana',
      via: 'name',
    });
    expect(deriveCoingeckoId({ name: 'Bitcoin und Ethereum Mix' })).toEqual({
      status: 'unresolved',
      reason: 'no_symbol',
      symbol: undefined,
    });
    expect(deriveCoingeckoId({ name: 'Irgendein Token' })).toMatchObject({ status: 'unresolved' });
  });

  it('reports instead of guessing: unknown or leveraged tickers, ticker and name that disagree', () => {
    expect(deriveCoingeckoId({ symbol: 'BTC2L', name: 'Bitcoin 2x Long' })).toEqual({
      status: 'unresolved',
      reason: 'unknown_symbol',
      symbol: 'BTC2L',
    });
    expect(deriveCoingeckoId({ symbol: 'XYZ9', name: 'Bitcoin' })).toMatchObject({
      status: 'unresolved',
      reason: 'unknown_symbol',
    });
    expect(deriveCoingeckoId({ symbol: 'BTC', name: 'Cardano' })).toEqual({
      status: 'unresolved',
      reason: 'name_conflict',
      symbol: 'BTC',
    });
    expect(cryptocalcSymbol('https://evil.example/?currency=BTC')).toBeUndefined();
    expect(cryptocalcSymbol('https://cryptocalc.cc/x/?currency=B/../C')).toBeUndefined();
  });

  it('covers the coins the PP import needs and exports the resolver shape', () => {
    const needed: Array<[string, string]> = [
      ['BTC', 'bitcoin'],
      ['ETH', 'ethereum'],
      ['XRP', 'ripple'],
      ['ADA', 'cardano'],
      ['SOL', 'solana'],
      ['AVAX', 'avalanche-2'],
      ['VSN', 'vision-3'],
      ['LINK', 'chainlink'],
      ['CC', 'canton-network'],
    ];
    for (const [symbol, id] of needed) expect(resolveCoingeckoId(symbol, null), symbol).toBe(id);
    expect(resolveCoingeckoId('ETH', 'Ethereum')).toBe('ethereum');
    expect(resolveCoingeckoId(null, 'Cardano')).toBe('cardano');
    // Not on CoinGecko under that name (CoinGecko's "best" is another token) or leveraged: undefined.
    for (const symbol of ['BEST', 'BTC2L', 'ETH2L', 'XYZ9', null])
      expect(resolveCoingeckoId(symbol, 'Bitpanda Produkt'), String(symbol)).toBeUndefined();
    expect(resolveCoingeckoId('BTC', 'Cardano')).toBeUndefined();
  });

  it('the curated table has plain ids and uppercase tickers only', () => {
    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      expect(symbol).toMatch(/^[A-Z0-9]{2,12}$/);
      expect(id).toMatch(/^[a-z0-9][a-z0-9\-_.]{0,80}$/);
    }
  });
});

describe('ECB SDMX CSV parser and source', () => {
  it('inverts units-per-EUR to EUR-per-unit on integers and skips empty observations', () => {
    expect(parseEcbCsv(data('ecb-exr-usd.csv'), '2024-01-01', '2024-01-31')).toEqual([
      { date: '2024-01-02', rateMicro: 912_742 },
      { date: '2024-01-03', rateMicro: 915_835 },
      { date: '2024-01-05', rateMicro: 913_492 },
    ]);
  });

  it('handles quoted fields with commas and keeps the range', () => {
    expect(parseEcbCsv(data('ecb-exr-usd.csv'), '2024-01-03', '2024-01-03')).toHaveLength(1);
  });

  it('rejects a foreign CSV and bad currencies', async () => {
    expect(await kindOf(() => parseEcbCsv('a,b\n1,2\n', '2024-01-01', '2024-01-31'))).toBe('parse');
    const urls: string[] = [];
    const source = ecbSource({
      fetch: async (url) => {
        urls.push(String(url));
        return new Response(data('ecb-exr-usd.csv'));
      },
    });
    expect(await source.history('USD', '2024-01-01', '2024-01-31')).toHaveLength(3);
    expect(urls[0]).toContain('/EXR/D.USD.EUR.SP00.A?startPeriod=2024-01-01&endPeriod=2024-01-31');
    for (const bad of ['EUR', 'usd', 'US', 'USD/../x'])
      expect(await kindOf(() => source.history(bad, '2024-01-01', '2024-01-31')), bad).toBe(
        'not_configured',
      );
  });
});

describe('getText (timeouts, backoff, errors without URLs)', () => {
  const sleeps: number[] = [];
  const opts = (fetchImpl: typeof fetch, retries = 2) => ({
    fetch: fetchImpl,
    retries,
    backoffMs: 100,
    sleep: async (ms: number) => void sleeps.push(ms),
  });

  it('retries 429 and 5xx with doubling delays, then succeeds', async () => {
    sleeps.length = 0;
    const statuses = [429, 503, 200];
    const seen: Array<Record<string, string>> = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      seen.push(init?.headers as Record<string, string>);
      return new Response('ok', { status: statuses.shift() as number });
    }) as unknown as typeof fetch;
    expect(await getText('https://example.test/x?token=SECRET', opts(fetchImpl))).toBe('ok');
    expect(sleeps).toEqual([100, 200]);
    expect(seen[0]?.['user-agent']).toMatch(/^budget-app\//);
  });

  it('gives up with a classified error that does not contain the URL', async () => {
    const fetchImpl = (async () =>
      new Response('secret body', { status: 500 })) as unknown as typeof fetch;
    const error = await getText('https://example.test/x?token=SECRET', opts(fetchImpl, 1)).catch(
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(MarketError);
    expect((error as Error).message).toBe('http: 500');
  });

  it('does not retry 404 or other 4xx', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    expect(await kindOf(() => getText('https://example.test/', opts(fetchImpl)))).toBe('not_found');
    expect(calls).toBe(1);
  });

  it('classifies network failures and timeouts without leaking the URL', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed: https://example.test/?token=SECRET');
    }) as unknown as typeof fetch;
    const error = await getText('https://example.test/', opts(down, 0)).catch(
      (e: unknown) => e as Error,
    );
    expect((error as Error).message).toBe('network');
    const slow = (async () => {
      throw new DOMException('The operation was aborted', 'TimeoutError');
    }) as unknown as typeof fetch;
    expect(await kindOf(() => getText('https://example.test/', opts(slow, 0)))).toBe('timeout');
  });
});

describe('Statistik Austria VPI (synthetic OGD files, both index bases)', () => {
  it('reads the monthly total index with its decimal comma into micro-units and skips sub-indices and annual rows', () => {
    expect(parseVpiCsv(data('vpi-ogd.csv'))).toEqual([
      { month: '2024-01', indexMicro: 110_400_000 },
      { month: '2024-02', indexMicro: 111_100_000 },
      { month: '2024-03', indexMicro: 111_600_000 },
      { month: '2025-12', indexMicro: 120_000_000 },
    ]);
  });
  it('refuses a file with other columns and a broken value, and says empty for no rows', async () => {
    expect(await kindOf(() => parseVpiCsv('a;b\n1;2\n'))).toBe('parse');
    const broken = data('vpi-ogd.csv').replace('110,40000', 'abc');
    expect(await kindOf(() => parseVpiCsv(broken))).toBe('parse');
    const header = data('vpi-ogd.csv').split('\n')[0] as string;
    expect(
      await kindOf(() => vpiSource({ fetch: respond(`${header}\n`) as never }).monthly()),
    ).toBe('empty');
  });
  it('reads the annual averages and both file layouts of the total index', () => {
    const old = parseVpiDataset(data('vpi-ogd.csv'));
    expect(old.annual).toEqual([
      { year: 2024, indexMicro: 111_000_000 },
      { year: 2025, indexMicro: 118_000_000 },
    ]);
    expect(old.months.at(-1)).toEqual({ month: '2025-12', indexMicro: 120_000_000 });
    const next = parseVpiDataset(data('vpi-ogd-new-base.csv'));
    expect(next.months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(next.months[0]?.indexMicro).toBe(100_500_000);
    expect(next.annual).toEqual([]);
  });
  it('chains the new base onto the old one by the annual average of the base year', () => {
    const older = parseVpiDataset(data('vpi-ogd.csv'));
    const newer = parseVpiDataset(data('vpi-ogd-new-base.csv'));
    const chained = chainVpi(older, newer);
    // 100,5 x 118,0 / 100 = 118,59; the old months stay as published.
    expect(chained.slice(-4)).toEqual([
      { month: '2025-12', indexMicro: 120_000_000 },
      { month: '2026-01', indexMicro: 118_590_000 },
      { month: '2026-02', indexMicro: 119_180_000 },
      { month: '2026-03', indexMicro: 119_770_000 },
    ]);
    expect(chained).toHaveLength(older.months.length + 3);
    // The same month in both files keeps the old value.
    const overlap = chainVpi(older, { months: [{ month: '2025-12', indexMicro: 1 }], annual: [] });
    expect(overlap).toEqual(older.months);
  });
  it('falls back to the mean of the twelve old months of the base year and never guesses without them', () => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: `2025-${String(i + 1).padStart(2, '0')}`,
      indexMicro: (110 + i) * 1_000_000,
    }));
    const newer = { months: [{ month: '2026-01', indexMicro: 100_000_000 }], annual: [] };
    // Mean of 110..121 is 115,5.
    expect(chainVpi({ months, annual: [] }, newer).at(-1)).toEqual({
      month: '2026-01',
      indexMicro: 115_500_000,
    });
    expect(chainVpi({ months: months.slice(0, 11), annual: [] }, newer)).toHaveLength(11);
  });
  it('fetches both files through the injected fetch and chains them; a missing new file leaves the old series', async () => {
    const urls: string[] = [];
    const bodies: Record<string, string> = {
      'https://example.invalid/old.csv': data('vpi-ogd.csv'),
      'https://example.invalid/new.csv': data('vpi-ogd-new-base.csv'),
    };
    const make = (missingNew: boolean) =>
      vpiSource({
        fetch: (async (input: unknown) => {
          const url = String(input);
          urls.push(url);
          if (missingNew && url.endsWith('new.csv')) return new Response('', { status: 404 });
          return new Response(bodies[url] ?? '');
        }) as never,
        oldUrl: 'https://example.invalid/old.csv',
        newUrl: 'https://example.invalid/new.csv',
      });
    const source = make(false);
    expect(source.series).toBe('vpi');
    expect((await source.monthly()).at(-1)?.month).toBe('2026-03');
    expect(urls).toEqual(['https://example.invalid/old.csv', 'https://example.invalid/new.csv']);
    expect((await make(true).monthly()).at(-1)?.month).toBe('2025-12');
    expect(await kindOf(() => vpiSource({ fetch: respond('', 404) as never }).monthly())).toBe(
      'not_found',
    );
  });
  it('has a synthetic fixture series that is smooth and ends where asked', () => {
    const rows = fixtureCpiMonths('2025-12');
    expect(rows[0]?.month).toBe('2021-01');
    expect(rows.at(-1)?.month).toBe('2025-12');
    expect(rows).toHaveLength(60);
    expect(
      rows.every(
        (r, i) => i === 0 || r.indexMicro >= (rows[i - 1] as { indexMicro: number }).indexMicro,
      ),
    ).toBe(true);
  });
});
