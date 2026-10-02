import { fxSeries, priceSeries, type Db } from '@budget/db';
import {
  arivaSource,
  ecbSource,
  fixtureCpiSource,
  fixtureFxSource,
  fixtureQuoteSource,
  vpiSource,
  yahooChartSource,
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
 * The adapters for a mode. Live: Yahoo chart (primary), ECB for rates, and Ariva as fallback only
 * when `BUDGET_ARIVA=1` (off until the owner has confirmed access). Fixture: deterministic
 * synthetic series that run through the prices and rates already stored, never the network.
 * The consumer price index comes from Statistik Austria's open data (live) or a synthetic series.
 */
export function createMarketSources(
  db: Db,
  mode: MarketMode,
  env: NodeJS.ProcessEnv = process.env,
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
  const http = { fetch };
  return {
    quotes: yahooChartSource(http),
    fallbackQuotes:
      env['BUDGET_ARIVA'] === '1' ? arivaSource({ ...http, enabled: true }) : undefined,
    fx: ecbSource(http),
    cpi: vpiSource(http),
  };
}
