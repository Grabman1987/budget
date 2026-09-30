import type { Db } from '@budget/db';
import { todayInVienna } from '@budget/domain';
import type { MarketSources } from '@budget/market';
import { Hono } from 'hono';
import { accountRoutes } from './accounts';
import { bookingRoutes } from './bookings';
import { budgetRoutes, categoryRoutes } from './budget';
import { createMarketSources, marketModeFromEnv } from '../market/sources';
import { errorResponse } from './http';
import { lookupRoutes, payeeRoutes, undoRoutes } from './lookups';
import { marketRoutes } from './market';

export interface LedgerApiOptions {
  db: Db;
  /** "Today" as `YYYY-MM-DD` (Europe/Vienna by default); tests pass a fixed day. */
  today?: () => string;
  /** Price and rate sources for the market refresh; default per `BUDGET_MARKET_SOURCES`. */
  market?: MarketSources | undefined;
}

/**
 * The ledger API (P2a): accounts with balances and Kontostand prüfen, bookings with filters and
 * bulk edits, payees, pick lists and undo. Mounted below `/api` behind the session guard. Every
 * write answers with the `groupId` of its audit group; `POST /undo` reverts that whole action.
 */
export function createLedgerApi({
  db,
  today = () => todayInVienna(),
  market = createMarketSources(db, marketModeFromEnv()),
}: LedgerApiOptions): Hono {
  const api = new Hono();
  api.route('/accounts', accountRoutes(db, today));
  api.route('/bookings', bookingRoutes(db));
  api.route('/payees', payeeRoutes(db));
  api.route('/categories', categoryRoutes(db));
  api.route('/budget', budgetRoutes(db));
  api.route('/lookups', lookupRoutes(db));
  api.route('/undo', undoRoutes(db));
  api.route('/', marketRoutes(db, today, market));
  api.onError(errorResponse);
  return api;
}
