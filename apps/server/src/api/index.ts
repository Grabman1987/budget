import { searchRoutes } from './search';
import { inboxRoutes } from './inbox';
import { contactRoutes } from './contacts';
import type { Db } from '@budget/db';
import { todayInVienna } from '@budget/domain';
import type { MarketSources } from '@budget/market';
import { Hono, type MiddlewareHandler } from 'hono';
import { ImportJobs } from '../imports/jobs';
import { importRoutes } from '../imports/routes';
import { accountRoutes } from './accounts';
import { bookingRoutes } from './bookings';
import { budgetRoutes, categoryRoutes } from './budget';
import { expectedRoutes } from './expected';
import { exportRoutes } from './export';
import { goalRoutes } from './goals';
import { heuteRoutes } from './heute';
import {
  assetClassRoutes,
  portfolioRoutes,
  savingsPlanRoutes,
  securityRoutes,
  tradeRoutes,
} from './invest';
import { createMarketSources, marketModeFromEnv } from '../market/sources';
import { errorResponse } from './http';
import { lookupRoutes, payeeRoutes, undoRoutes } from './lookups';
import { marketRoutes } from './market';
import { wealthRoutes } from './wealth';
import { ruleRoutes } from './rules';
import { payeeReportRoutes } from './payee-report';

export interface LedgerApiOptions {
  db: Db;
  /** "Today" as `YYYY-MM-DD` (Europe/Vienna by default); tests pass a fixed day. */
  today?: () => string;
  /** Price and rate sources for the market refresh; default per `BUDGET_MARKET_SOURCES`. */
  market?: MarketSources | undefined;
  /** Refuses a request without a fresh step-up (uploads, commits and reverts of import runs). */
  stepUp: MiddlewareHandler;
  /** Runner of the import tasks (worker threads); one per database. */
  jobs?: ImportJobs | undefined;
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
  stepUp,
  jobs = new ImportJobs(db),
}: LedgerApiOptions): Hono {
  const api = new Hono();
  api.route('/search', searchRoutes(db));
  api.route('/accounts', accountRoutes(db, today));
  api.route('/inbox', inboxRoutes(db, today));
  api.route('/bookings', bookingRoutes(db));
  api.route('/payees', payeeRoutes(db));
  api.route('/categories', categoryRoutes(db));
  api.route('/budget', budgetRoutes(db));
  api.route('/expected', expectedRoutes(db, today));
  api.route('/export', exportRoutes(db, today, stepUp));
  api.route('/wealth', wealthRoutes(db, today));
  api.route('/contacts', contactRoutes(db, today));
  api.route('/reports/payees', payeeReportRoutes(db, today));
  api.route('/goals', goalRoutes(db, today));
  api.route('/heute', heuteRoutes(db, today));
  api.route('/rules', ruleRoutes(db, today));
  api.route('/securities', securityRoutes(db));
  api.route('/asset-classes', assetClassRoutes(db, today));
  api.route('/trades', tradeRoutes(db));
  api.route('/savings-plans', savingsPlanRoutes(db, today));
  api.route('/portfolio', portfolioRoutes(db, today));
  api.route('/lookups', lookupRoutes(db));
  api.route('/undo', undoRoutes(db));
  api.route('/', marketRoutes(db, today, market));
  api.route('/imports', importRoutes(db, today, stepUp, jobs));
  api.onError(errorResponse);
  return api;
}
