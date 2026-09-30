import { invertRateMicro, parseMicro } from '@budget/domain';
import { parseCsv } from './csv';
import { MarketError } from './errors';
import { getText, type HttpOptions } from './http';
import type { DailyRate, FxSource } from './types';

export interface EcbOptions extends HttpOptions {
  baseUrl?: string;
}

const CURRENCY = /^[A-Z]{3}$/;

/**
 * Parse the ECB Data Portal SDMX CSV (`format=csvdata`). The ECB quotes units of the currency per
 * 1 EUR (`OBS_VALUE`); the schema stores EUR per unit, so every rate is inverted on integers
 * (`invertRateMicro`: 10^12 / x, rounded half up once). Days without a rate are skipped.
 */
export function parseEcbCsv(text: string, from: string, to: string): DailyRate[] {
  const rows = parseCsv(text, ',');
  if (rows.length === 0) return [];
  const first = rows[0] as Record<string, string>;
  if (!('TIME_PERIOD' in first) || !('OBS_VALUE' in first))
    throw new MarketError('parse', 'columns');
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const date = row['TIME_PERIOD'] ?? '';
    const value = row['OBS_VALUE'] ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value === '' || date < from || date > to) continue;
    try {
      byDate.set(date, invertRateMicro(parseMicro(value)));
    } catch {
      throw new MarketError('parse', 'rate value');
    }
  }
  return [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, rateMicro]) => ({ date, rateMicro }));
}

/** ECB reference rates `EXR/D.{CUR}.EUR.SP00.A`, daily, full history on request. Needs no key. */
export function ecbSource(options: EcbOptions): FxSource {
  const base = options.baseUrl ?? 'https://data-api.ecb.europa.eu';
  return {
    async history(currency, from, to) {
      if (!CURRENCY.test(currency) || currency === 'EUR')
        throw new MarketError('not_configured', 'currency');
      const url =
        `${base}/service/data/EXR/D.${currency}.EUR.SP00.A` +
        `?startPeriod=${from}&endPeriod=${to}&format=csvdata`;
      return parseEcbCsv(await getText(url, options, 'text/csv'), from, to);
    },
  };
}
