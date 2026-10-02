import { parseMicro } from '@budget/domain';
import { MarketError } from './errors';
import { tableWithHeader } from './html';
import { getText, throttle, type HttpOptions } from './http';
import type { DailyQuote, QuoteSource } from './types';

/** Options of the cryptocalc fallback source. */
export interface CryptocalcOptions extends HttpOptions {
  baseUrl?: string;
  /** Clock: the running UTC day is never a close. Tests pin it. */
  now?: () => Date;
  /** Politeness: minimum pause between two requests. Default 1 s, tests pass 0. */
  minIntervalMs?: number;
}

const utcDay = (date: Date) => date.toISOString().slice(0, 10);

/** What is taken from a stored cryptocalc quote URL. */
export interface CryptocalcTarget {
  /** Path of the price page (`/bitpanda-kurse/`). */
  path: string;
  /** Coin ticker (`BTC`). */
  currency: string;
  /** Fiat currency the page quotes in (`EUR`). */
  fiat: string;
}

const PATH = /^\/[a-z0-9\-/]{1,100}$/;

/**
 * The price page from Portfolio Performance (`https://cryptocalc.cc/bitpanda-kurse/?currency=BTC
 * &fiat=EUR&range=all`). Only https on cryptocalc.cc qualifies; `range` is chosen per request.
 */
export function parseCryptocalcUrl(quoteUrl: string | null): CryptocalcTarget | undefined {
  if (!quoteUrl) return undefined;
  let url: URL;
  try {
    url = new URL(quoteUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'cryptocalc.cc' || url.username)
    return undefined;
  const currency = url.searchParams.get('currency') ?? '';
  const fiat = url.searchParams.get('fiat') ?? '';
  if (!PATH.test(url.pathname) || !/^[A-Z0-9]{2,12}$/.test(currency) || !/^[A-Z]{3}$/.test(fiat))
    return undefined;
  return { path: url.pathname, currency, fiat };
}

/** `02.10.2026` to `2026-10-02`. */
const isoDay = (text: string): string | undefined => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

/**
 * Parse the price table (`Datum | Erster | Hoch | Tief | Schluss`, German decimals, no currency
 * in the cells: the page's `fiat` is the currency) into closes in `from`..`to`. A day that is not
 * over in UTC (`today` and later) is dropped: its close is only the price so far.
 */
export function parseCryptocalcHtml(
  html: string,
  from: string,
  to: string,
  today: string,
): DailyQuote[] {
  const [header, ...rows] = tableWithHeader(html, ['Datum', 'Schluss']);
  const close = (header as string[]).indexOf('Schluss');
  const byDate = new Map<string, number>();
  for (const cells of rows) {
    const date = isoDay(cells[0] ?? '');
    const text = cells[close] ?? '';
    if (!date || text === '' || date < from || date > to || date >= today) continue;
    let priceMicro: number;
    try {
      priceMicro = parseMicro(text.replaceAll('.', '').replace(',', '.'));
    } catch {
      throw new MarketError('parse', 'price value');
    }
    if (priceMicro > 0) byDate.set(date, priceMicro);
  }
  return [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, priceMicro]) => ({ date, priceMicro }));
}

/** The smallest `range` of the page that reaches back to `from` (the table starts at the newest day). */
function rangeFor(from: string, today: string): string {
  const age = Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000);
  if (age <= 28) return 'month';
  if (age <= 88) return 'three_months';
  if (age <= 360) return 'year';
  return 'all';
}

/**
 * Crypto closes in the quote currency of the page (EUR), from the price table of the page that
 * Portfolio Performance uses as its feed. One request per coin; the daily candle is the UTC day.
 */
export function cryptocalcSource(options: CryptocalcOptions): QuoteSource {
  const base = options.baseUrl ?? 'https://cryptocalc.cc';
  const now = options.now ?? (() => new Date());
  const wait = throttle(options.minIntervalMs ?? 1000, options.sleep);
  return {
    id: 'cryptocalc',
    supports: (ref) =>
      ref.kind === 'crypto' &&
      ref.coingeckoId === null &&
      parseCryptocalcUrl(ref.quoteUrl) !== undefined,
    async history(ref, from, to) {
      const target = parseCryptocalcUrl(ref.quoteUrl);
      if (!target) throw new MarketError('not_configured', 'quote url');
      if (target.fiat !== ref.currency)
        throw new MarketError('currency_mismatch', `${target.fiat} instead of ${ref.currency}`);
      const today = utcDay(now());
      const query = new URLSearchParams({
        currency: target.currency,
        fiat: target.fiat,
        range: rangeFor(from, today),
      });
      await wait();
      const html = await getText(`${base}${target.path}?${query}`, options, 'text/html');
      return parseCryptocalcHtml(html, from, to, today);
    },
  };
}
