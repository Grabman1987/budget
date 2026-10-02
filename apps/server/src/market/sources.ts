import { fxSeries, priceSeries, type Db } from '@budget/db';
import {
  arivaSource,
  coingeckoSource,
  cryptocalcSource,
  ecbSource,
  fixtureCpiSource,
  fixtureFxSource,
  fixtureQuoteSource,
  vpiSource,
  yahooChartSource,
  type HttpOptions,
  type MarketSources,
} from '@budget/market';

export type MarketMode = 'fixture' | 'live';

/**
 * `BUDGET_MARKET_SOURCES=fixture|live`. Without it: live in production, fixture everywhere else,
 * so a development server, the tests and the e2e run never reach the network by accident.
 */
export function marketModeFromEnv(env: NodeJS.ProcessEnv = process.env): MarketMode {
  const value = env['BUDGET_MARKET_SOURCES'];
  if (value === undefined || value === '')
    return env['NODE_ENV'] === 'production' ? 'live' : 'fixture';
  if (value === 'fixture' || value === 'live') return value;
  throw new Error('BUDGET_MARKET_SOURCES must be "fixture" or "live"');
}

/**
 * The adapters for a mode. Live: Ariva is the primary source (European exchange prices in EUR,
 * owner decision 02.10.2026), CoinGecko is primary for crypto (`coingecko_id`), cryptocalc only
 * the fallback for a crypto security without a coin id (Bitpanda-only products), Yahoo is the last
 * resort; each source skips securities without its identifier (`quote_url`, `coingecko_id`,
 * `symbol`) and Ariva and Yahoo skip crypto. `BUDGET_ARIVA=0` switches Ariva off. ECB for rates.
 * Fixture: deterministic synthetic series that run through the prices and rates already stored,
 * never the network. The consumer price index comes from Statistik Austria's open data (live) or
 * a synthetic series.
 */
export function createMarketSources(
  db: Db,
  mode: MarketMode,
  env: NodeJS.ProcessEnv = process.env,
  http: HttpOptions = { fetch },
): MarketSources {
  if (mode === 'fixture') {
    return {
      quotes: fixtureQuoteSource({
        anchorsFor: (ref) =>
          priceSeries(db, ref.id).map((p) => ({ date: p.date, value: p.priceMicro })),
      }),
      fx: fixtureFxSource({
        anchorsFor: (currency) =>
          fxSeries(db, currency).map((r) => ({ date: r.date, value: r.rateMicro })),
      }),
      cpi: fixtureCpiSource(),
    };
  }
  return {
    quotes: arivaSource({ ...http, enabled: env['BUDGET_ARIVA'] !== '0' }),
    moreQuotes: [coingeckoSource(http), cryptocalcSource(http)],
    fallbackQuotes: yahooChartSource(http),
    fx: ecbSource(http),
    cpi: vpiSource(http),
  };
}
