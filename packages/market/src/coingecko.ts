import { addDays, parseMicro } from '@budget/domain';
import { MarketError } from './errors';
import { getText, throttle, type HttpOptions } from './http';
import type { DailyQuote, QuoteSource, SecurityRef } from './types';

export interface CoingeckoOptions extends HttpOptions {
  baseUrl?: string;
  /** Clock: the running UTC day is never a close. Tests pin it. */
  now?: () => Date;
  /**
   * Politeness toward the keyless free tier (about 5-15 calls a minute): minimum pause between
   * two requests. Default 6 s; tests pass 0.
   */
  minIntervalMs?: number;
}

const utcDay = (date: Date) => date.toISOString().slice(0, 10);

const COIN_ID = /^[a-z0-9][a-z0-9\-_.]{0,80}$/;
/** CoinGecko's free tier reaches back one year. */
const COINGECKO_MAX_DAYS = 365;
/** On 429 the free tier asks for a pause: retry three times, 20 s then doubling (or Retry-After). */
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = 20_000;

interface MarketChart {
  prices?: Array<[number, number]>;
}

/**
 * Parse CoinGecko's `market_chart?interval=daily` answer. A point stamped 00:00 UTC is the price
 * at that instant, i.e. the close of the day before, and is stored under that day; the trailing
 * point of the running day is dropped.
 */
export function parseCoingeckoChart(text: string, from: string, to: string): DailyQuote[] {
  let body: MarketChart;
  try {
    body = JSON.parse(text) as MarketChart;
  } catch {
    throw new MarketError('parse', 'not JSON');
  }
  if (!Array.isArray(body.prices)) throw new MarketError('parse', 'no prices');
  const byDate = new Map<string, number>();
  for (const point of body.prices) {
    const [ts, value] = point;
    if (typeof ts !== 'number' || typeof value !== 'number')
      throw new MarketError('parse', 'point');
    if (ts % 86_400_000 !== 0) continue;
    const date = addDays(utcDay(new Date(ts)), -1);
    if (date < from || date > to) continue;
    let priceMicro: number;
    try {
      priceMicro = parseMicro(String(value));
    } catch {
      throw new MarketError('parse', 'price value');
    }
    if (priceMicro > 0) byDate.set(date, priceMicro);
  }
  return [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, priceMicro]) => ({ date, priceMicro }));
}

/**
 * CoinGecko (keyless public API): the only source for crypto. Daily closes for a coin id in the
 * security's currency (EUR), one request per coin, spaced `minIntervalMs` apart; on HTTP 429 it
 * waits (`Retry-After`, else 20 s doubling) and retries three times before reporting
 * `rate_limited`, which the next night's run picks up again.
 */
export function coingeckoSource(options: CoingeckoOptions): QuoteSource {
  const base = options.baseUrl ?? 'https://api.coingecko.com';
  const now = options.now ?? (() => new Date());
  const wait = throttle(options.minIntervalMs ?? 6000, options.sleep);
  const http: HttpOptions = {
    ...options,
    retries: options.retries ?? RATE_LIMIT_RETRIES,
    backoffMs: options.backoffMs ?? RATE_LIMIT_BACKOFF_MS,
  };
  return {
    id: 'coingecko',
    supports: (ref: SecurityRef) => ref.coingeckoId !== null && COIN_ID.test(ref.coingeckoId),
    async history(ref, from, to) {
      if (!ref.coingeckoId || !COIN_ID.test(ref.coingeckoId))
        throw new MarketError('not_configured', 'coin id');
      if (!/^[A-Z]{3}$/.test(ref.currency)) throw new MarketError('not_configured', 'currency');
      const today = utcDay(now());
      const age = Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000);
      const days = Math.min(Math.max(age, 1) + 2, COINGECKO_MAX_DAYS);
      const query = new URLSearchParams({
        vs_currency: ref.currency.toLowerCase(),
        days: String(days),
        interval: 'daily',
      });
      await wait();
      const text = await getText(
        `${base}/api/v3/coins/${ref.coingeckoId}/market_chart?${query}`,
        http,
        'application/json',
      );
      return parseCoingeckoChart(text, from, to);
    },
  };
}
