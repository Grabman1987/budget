import { fxSeries, priceSeries, type Db } from '@budget/db';
import {
  arivaSource,
  ecbSource,
  fixtureFxSource,
  fixtureQuoteSource,
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
 * The adapters for a mode. Live: ECB for rates and, for quotes, Yahoo chart alone; with
 * `BUDGET_ARIVA=1` Ariva is the primary source (European exchange prices in EUR, owner decision
 * 02.10.2026) and Yahoo the fallback. A security without an Ariva id fails over to Yahoo, one
 * without a Yahoo symbol is served by Ariva alone. Fixture: deterministic
 * synthetic series that run through the prices and rates already stored, never the network.
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
    };
  }
  const http = { fetch };
  const yahoo = yahooChartSource(http);
  if (env['BUDGET_ARIVA'] === '1')
    return {
      quotes: arivaSource({ ...http, enabled: true }),
      fallbackQuotes: yahoo,
      fx: ecbSource(http),
    };
  return { quotes: yahoo, fx: ecbSource(http) };
}
