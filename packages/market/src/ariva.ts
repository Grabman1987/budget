import { addDays, parseMicro } from '@budget/domain';
import { MarketError } from './errors';
import { tableWithHeader } from './html';
import { getText, throttle, type HttpOptions } from './http';
import type { DailyQuote, QuoteSource, SecurityRef } from './types';

export interface ArivaOptions extends HttpOptions {
  /** Off switch (`BUDGET_ARIVA=0`). */
  enabled: boolean;
  baseUrl?: string;
  /** Clock for "which pages cover the window"; tests pin it. */
  now?: () => Date;
  /** Politeness: minimum pause between two requests. Default 1 s, tests pass 0. */
  minIntervalMs?: number;
}

/** What is taken from a stored Ariva quote URL. */
export interface ArivaTarget {
  /** Path of the quote page, e.g. `/etf/<slug>/kurse/historische-kurse`. */
  path: string;
  /** `boerse_id` from the URL's query, if any. */
  exchange: string | undefined;
}

const HOSTS = new Set(['www.ariva.de', 'ariva.de']);
const PATH = /^\/[A-Za-z0-9_\-./]{1,200}$/;
const EXCHANGE = /^[0-9]{1,6}$/;
/** The page without `month` lists the last 30 calendar days; stay inside it. */
const RECENT_DAYS = 27;
/** Month pages reach further back than the PP import needs; never walk more than this. */
const MAX_MONTHS = 36;

/**
 * The quote page of a security as stored from Portfolio Performance
 * (`https://www.ariva.de/<path>/kurse/historische-kurse[?boerse_id=...&...]`). Only https URLs on
 * ariva.de qualify, so a stored URL can never make the server fetch from elsewhere. The numeric
 * security id is not needed: the page itself is addressed by its path.
 */
export function parseArivaUrl(quoteUrl: string | null): ArivaTarget | undefined {
  if (!quoteUrl) return undefined;
  let url: URL;
  try {
    url = new URL(quoteUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.username || url.password)
    return undefined;
  if (!PATH.test(url.pathname) || url.pathname.includes('..') || !url.pathname.includes('/kurse'))
    return undefined;
  const exchange = url.searchParams.get('boerse_id') ?? undefined;
  if (exchange !== undefined && !EXCHANGE.test(exchange)) return undefined;
  return { path: url.pathname, exchange };
}

/** `02.10.26` to `2026-10-02` (two-digit years are 20yy), else undefined. */
function isoDay(text: string): string | undefined {
  const m = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/.exec(text);
  if (!m) return undefined;
  const year = (m[3] as string).length === 2 ? `20${m[3]}` : (m[3] as string);
  return `${year}-${m[2]}-${m[1]}`;
}

const SYMBOLS: Record<string, string> = { '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY' };

/** `129,135 €` into micro-units and the currency named by the cell. */
function parsePriceCell(text: string): { priceMicro: number; currency: string | undefined } {
  const m = /^([0-9][0-9.]*(?:,[0-9]+)?)\s*(\S+)?$/.exec(text);
  if (!m) throw new MarketError('parse', 'price value');
  const unit = m[2];
  try {
    return {
      priceMicro: parseMicro((m[1] as string).replaceAll('.', '').replace(',', '.')),
      currency: unit === undefined ? undefined : (SYMBOLS[unit] ?? unit.toUpperCase()),
    };
  } catch {
    throw new MarketError('parse', 'price value');
  }
}

/**
 * Parse the "Historische Kurse" page of one exchange (HTML, `Datum | Erster | Hoch | Tief |
 * Schluss | | Stuecke | Volumen`) into closes in `from`..`to`. A row marked `*` is today's running
 * session and dropped. A currency other than the security's is refused.
 */
export function parseArivaHtml(
  html: string,
  ref: Pick<SecurityRef, 'currency'>,
  from: string,
  to: string,
): DailyQuote[] {
  const [header, ...rows] = tableWithHeader(html, ['Datum', 'Schluss']);
  const close = (header as string[]).indexOf('Schluss');
  const byDate = new Map<string, number>();
  for (const cells of rows) {
    const date = isoDay(cells[0] ?? '');
    if (!date) continue;
    const text = cells[close] ?? '';
    if (!/[0-9]/.test(text) || date < from || date > to) continue;
    if ((cells[close + 1] ?? '').includes('*')) continue;
    const { priceMicro, currency } = parsePriceCell(text);
    if (currency !== undefined && currency !== ref.currency)
      throw new MarketError('currency_mismatch', `${currency} instead of ${ref.currency}`);
    if (priceMicro > 0) byDate.set(date, priceMicro);
  }
  return [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, priceMicro]) => ({ date, priceMicro }));
}

const monthEnd = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** `YYYY-MM` of every month from `from` to `to`. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7);) {
    out.push(m);
    const [y, mo] = m.split('-').map(Number) as [number, number];
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  return out;
}

/**
 * Ariva historic closes, read from the public "Historische Kurse" page of the security (its URL
 * is stored on the security, copied from Portfolio Performance). Ariva's CSV download needs an
 * account, the HTML table does not and holds the same closes: the last 30 days by default, one
 * page per month with `month=<last day>` for older ones. No credentials are ever involved.
 */
export function arivaSource(options: ArivaOptions): QuoteSource {
  const base = options.baseUrl ?? 'https://www.ariva.de';
  const now = options.now ?? (() => new Date());
  const wait = throttle(options.minIntervalMs ?? 1000, options.sleep);
  const fetchPage = async (path: string, query: Record<string, string>) => {
    await wait();
    return getText(`${base}${path}?${new URLSearchParams(query)}`, options, 'text/html');
  };
  return {
    id: 'ariva',
    supports: (ref) => options.enabled && parseArivaUrl(ref.quoteUrl) !== undefined,
    async history(ref, from, to) {
      if (!options.enabled) throw new MarketError('not_configured', 'Ariva is switched off');
      const target = parseArivaUrl(ref.quoteUrl);
      if (!target) throw new MarketError('not_configured', 'quote url');
      const exchange = ref.quoteExchange ?? target.exchange;
      if (exchange !== undefined && !EXCHANGE.test(exchange))
        throw new MarketError('not_configured', 'exchange');
      const today = now().toISOString().slice(0, 10);
      const query = exchange === undefined ? {} : { boerse_id: exchange };
      const quotes: DailyQuote[] = [];
      if (from >= addDays(today, -RECENT_DAYS)) {
        quotes.push(...parseArivaHtml(await fetchPage(target.path, query), ref, from, to));
      } else {
        const floor = addDays(today, -MAX_MONTHS * 31);
        for (const month of monthsBetween(from < floor ? floor : from, to)) {
          const html = await fetchPage(target.path, { ...query, month: monthEnd(month) });
          quotes.push(...parseArivaHtml(html, ref, from, to));
        }
      }
      return [...new Map(quotes.map((q) => [q.date, q])).values()].sort((a, b) =>
        a.date < b.date ? -1 : 1,
      );
    },
  };
}
