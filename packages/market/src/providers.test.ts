import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arivaSource, parseArivaHtml, parseArivaUrl } from './ariva';
import {
  coingeckoSource,
  cryptocalcSource,
  parseCoingeckoChart,
  parseCryptocalcHtml,
  parseCryptocalcUrl,
} from './crypto';
import { ecbSource, parseEcbCsv } from './ecb';
import { MarketError } from './errors';
import { getText } from './http';
import type { SecurityRef } from './types';
import { parseYahooChart, yahooChartSource } from './yahoo';

const data = (name: string) =>
  readFileSync(resolve(import.meta.dirname, '../test-data', name), 'utf8');

const REF: SecurityRef = {
  id: 'sec-1',
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

describe('Crypto sources (cryptocalc table, CoinGecko chart)', () => {
  const CRYPTO_URL = 'https://cryptocalc.cc/bitpanda-kurse/?currency=BTC&fiat=EUR&range=all';
  const NOW = () => new Date('2024-01-06T00:30:00Z');
  const ref = (over: Partial<SecurityRef> = {}): SecurityRef => ({
    ...REF,
    symbol: null,
    quoteUrl: CRYPTO_URL,
    coingeckoId: 'bitcoin',
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

  it('CoinGecko: a 00:00 UTC point is the close of the day before, the running point is dropped', async () => {
    const chart = data('coingecko-market-chart.json');
    expect(parseCoingeckoChart(chart, '2024-01-01', '2024-01-31')).toEqual([
      { date: '2024-01-01', priceMicro: 38_010_120_000 },
      { date: '2024-01-02', priceMicro: 39_000_500_000 },
      { date: '2024-01-03', priceMicro: 39_500_250_000 },
      { date: '2024-01-04', priceMicro: 40_100_000_000 },
    ]);
    const urls: string[] = [];
    const source = coingeckoSource({
      now: NOW,
      minIntervalMs: 0,
      fetch: async (url) => {
        urls.push(String(url));
        return new Response(chart);
      },
    });
    expect(source.id).toBe('coingecko');
    expect(source.supports?.(ref())).toBe(true);
    expect(source.supports?.(ref({ coingeckoId: null }))).toBe(false);
    expect(await source.history(ref(), '2024-01-03', '2024-01-05')).toHaveLength(2);
    expect(urls[0]).toBe(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=eur&days=5&interval=daily',
    );
    for (const coingeckoId of [null, 'bitcoin/../x'])
      expect(
        await kindOf(() => source.history(ref({ coingeckoId }), '2024-01-03', '2024-01-05')),
      ).toBe('not_configured');
    expect(await kindOf(() => parseCoingeckoChart('<html>', '2024-01-01', '2024-01-31'))).toBe(
      'parse',
    );
    const limited = () =>
      parseCoingeckoChart('{"status":{"error_code":429}}', '2024-01-01', '2024-01-31');
    expect(await kindOf(limited)).toBe('parse');
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
