import { parseMicro } from '@budget/domain';
import { parseCsv } from './csv';
import { MarketError } from './errors';
import { getText, type HttpOptions } from './http';
import type { DailyQuote, QuoteSource } from './types';

export interface ArivaOptions extends HttpOptions {
  /** Off until the owner has confirmed access (docs/market-data.md). */
  enabled: boolean;
  baseUrl?: string;
}

const ID = /^[0-9]{1,12}$/;
const toArivaDate = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** `2024-01-05` or `05.01.2024` to ISO, else undefined. */
function isoDay(text: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/** German decimal (`1.234,56`) to micro-units. */
const germanMicro = (text: string) => parseMicro(text.replaceAll('.', '').replace(',', '.'));

/** Parse the historic CSV (`Datum;Erster;Hoch;Tief;Schlusskurs;...`) into closes in `from`..`to`. */
export function parseArivaCsv(text: string, from: string, to: string): DailyQuote[] {
  if (/<html|<!doctype/i.test(text.slice(0, 500))) throw new MarketError('parse', 'not a CSV');
  const rows = parseCsv(text, ';');
  if (rows.length === 0) return [];
  const first = rows[0] as Record<string, string>;
  if (!('Datum' in first) || !('Schlusskurs' in first)) throw new MarketError('parse', 'columns');
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const date = isoDay(row['Datum'] ?? '');
    const close = row['Schlusskurs'] ?? '';
    if (!date || close === '' || date < from || date > to) continue;
    let priceMicro: number;
    try {
      priceMicro = germanMicro(close);
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
 * Ariva historic quotes as CSV per security id (`fallbackQuoteId`) and exchange (`quoteExchange`).
 * Fallback only, and disabled unless switched on.
 */
export function arivaSource(options: ArivaOptions): QuoteSource {
  const base = options.baseUrl ?? 'https://www.ariva.de';
  return {
    id: 'ariva',
    async history(ref, from, to) {
      if (!options.enabled) throw new MarketError('not_configured', 'Ariva is switched off');
      if (!ref.fallbackQuoteId || !ID.test(ref.fallbackQuoteId))
        throw new MarketError('not_configured', 'fallback id');
      if (ref.quoteExchange && !ID.test(ref.quoteExchange))
        throw new MarketError('not_configured', 'exchange');
      const url =
        `${base}/quote/historic/historic_quote.csv?secu=${ref.fallbackQuoteId}` +
        (ref.quoteExchange ? `&boerse_id=${ref.quoteExchange}` : '') +
        `&clean_split=1&clean_payout=0&clean_bezug=1` +
        `&min_time=${toArivaDate(from)}&max_time=${toArivaDate(to)}&trenner=%3B&go=Download`;
      return parseArivaCsv(await getText(url, options, 'text/csv'), from, to);
    },
  };
}
