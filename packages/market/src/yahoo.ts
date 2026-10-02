import { addDays, parseMicro } from '@budget/domain';
import { MarketError } from './errors';
import { getText, type HttpOptions } from './http';
import type { DailyQuote, QuoteSource, SecurityRef } from './types';

export interface YahooOptions extends HttpOptions {
  baseUrl?: string;
}

const SYMBOL = /^[A-Za-z0-9.^=\-_]{1,30}$/;
const epoch = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);

/** The raw text of a JSON number array, so prices are read as decimal text, never as floats. */
function rawNumbers(text: string, pattern: RegExp): string[] | undefined {
  const match = pattern.exec(text);
  return match ? (match[1] as string).split(',').map((t) => t.trim()) : undefined;
}

interface ChartMeta {
  currency?: string;
  gmtoffset?: number;
  regularMarketTime?: number;
  currentTradingPeriod?: { regular?: { start?: number; end?: number } };
}
interface ChartResult {
  meta?: ChartMeta;
  timestamp?: number[];
}
interface ChartBody {
  chart?: { result?: ChartResult[] | null; error?: { code?: string } | null };
}

/**
 * Parse a Yahoo chart answer (`/v8/finance/chart`, `interval=1d`) into daily closes inside
 * `from`..`to`. The day of a bar is its date on the exchange (timestamp + `gmtoffset`). A bar of
 * a trading session that is still open is dropped: its "close" is only the last trade so far.
 */
export function parseYahooChart(
  text: string,
  ref: Pick<SecurityRef, 'currency' | 'adjusted'>,
  from: string,
  to: string,
): DailyQuote[] {
  let body: ChartBody;
  try {
    body = JSON.parse(text) as ChartBody;
  } catch {
    throw new MarketError('parse', 'not JSON');
  }
  const chart = body.chart;
  if (!chart) throw new MarketError('parse', 'no chart');
  if (chart.error) throw new MarketError(chart.error.code === 'Not Found' ? 'not_found' : 'http');
  const result = chart.result?.[0];
  if (!result) throw new MarketError('empty');
  const { meta = {}, timestamp = [] } = result;
  if (meta.currency !== undefined && meta.currency !== ref.currency)
    throw new MarketError('currency_mismatch', `${meta.currency} instead of ${ref.currency}`);
  if (timestamp.length === 0) return [];
  const raw = ref.adjusted
    ? rawNumbers(text, /"adjclose"\s*:\s*\[\s*\{\s*"adjclose"\s*:\s*\[([^\]]*)\]/)
    : rawNumbers(text, /"close"\s*:\s*\[([^\]]*)\]/);
  if (!raw || raw.length !== timestamp.length) throw new MarketError('parse', 'close series');

  const offset = meta.gmtoffset ?? 0;
  const session = meta.currentTradingPeriod?.regular;
  const open =
    session?.start !== undefined &&
    session.end !== undefined &&
    meta.regularMarketTime !== undefined &&
    meta.regularMarketTime < session.end;
  const byDate = new Map<string, number>();
  timestamp.forEach((ts, i) => {
    const token = raw[i] as string;
    if (token === 'null' || !Number.isFinite(ts)) return;
    if (open && ts >= (session.start as number)) return;
    const date = new Date((ts + offset) * 1000).toISOString().slice(0, 10);
    if (date < from || date > to) return;
    let priceMicro: number;
    try {
      priceMicro = parseMicro(token);
    } catch {
      throw new MarketError('parse', 'price value');
    }
    if (priceMicro > 0) byDate.set(date, priceMicro);
  });
  return [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, priceMicro]) => ({ date, priceMicro }));
}

/**
 * Yahoo chart endpoint (the one yfinance reads), daily close. Unadjusted unless the security asks
 * for the adjusted close. Needs no key.
 */
export function yahooChartSource(options: YahooOptions): QuoteSource {
  const base = options.baseUrl ?? 'https://query1.finance.yahoo.com';
  return {
    id: 'yfinance',
    supports: (ref) => ref.symbol !== null,
    async history(ref, from, to) {
      if (!ref.symbol || !SYMBOL.test(ref.symbol))
        throw new MarketError('not_configured', 'symbol');
      // One day of slack on each side: bars are dated on the exchange, periods are UTC.
      const url =
        `${base}/v8/finance/chart/${encodeURIComponent(ref.symbol)}` +
        `?period1=${epoch(addDays(from, -1))}&period2=${epoch(addDays(to, 2))}` +
        `&interval=1d&events=history&includeAdjustedClose=true`;
      return parseYahooChart(await getText(url, options, 'application/json'), ref, from, to);
    },
  };
}
