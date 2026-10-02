import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arivaSource, parseArivaCsv } from './ariva';
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
  symbol: 'SYN-ETFW',
  fallbackQuoteId: '1234',
  quoteExchange: '7',
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

describe('Ariva CSV parser and source', () => {
  it('reads German decimals and dates, skips rows without a close', () => {
    expect(parseArivaCsv(data('ariva-historic.csv'), '2023-12-01', '2024-01-31')).toEqual([
      { date: '2024-01-03', priceMicro: 1_234_500_000 },
      { date: '2024-01-04', priceMicro: 85_470_000 },
      { date: '2024-01-05', priceMicro: 86_010_000 },
    ]);
  });

  it('refuses an HTML page (login) instead of a CSV', async () => {
    const run = () => parseArivaCsv(data('ariva-login.html'), '2024-01-01', '2024-01-31');
    expect(await kindOf(run)).toBe('parse');
  });

  it('is off unless enabled, and needs a numeric id', async () => {
    const off = arivaSource({ enabled: false, fetch: respond(data('ariva-historic.csv')) });
    expect(await kindOf(() => off.history(REF, '2024-01-01', '2024-01-31'))).toBe('not_configured');
    const urls: string[] = [];
    const on = arivaSource({
      enabled: true,
      fetch: async (url) => {
        urls.push(String(url));
        return new Response(data('ariva-historic.csv'));
      },
    });
    expect(on.id).toBe('ariva');
    expect(await on.history(REF, '2024-01-03', '2024-01-05')).toHaveLength(3);
    expect(urls[0]).toContain('secu=1234&boerse_id=7');
    expect(urls[0]).toContain('min_time=03.01.2024&max_time=05.01.2024');
    for (const fallbackQuoteId of ['12;3', null])
      expect(
        await kindOf(() => on.history({ ...REF, fallbackQuoteId }, '2024-01-01', '2024-01-31')),
      ).toBe('not_configured');
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
