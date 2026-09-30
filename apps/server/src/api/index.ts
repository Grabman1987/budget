import type { Db } from '@budget/db';
import { todayInVienna } from '@budget/domain';
import { Hono, type MiddlewareHandler } from 'hono';
import { importRoutes } from '../imports/routes';
import { accountRoutes } from './accounts';
import { bookingRoutes } from './bookings';
import { budgetRoutes, categoryRoutes } from './budget';
import { errorResponse } from './http';
import { lookupRoutes, payeeRoutes, undoRoutes } from './lookups';

export interface LedgerApiOptions {
  db: Db;
  /** "Today" as `YYYY-MM-DD` (Europe/Vienna by default); tests pass a fixed day. */
  today?: () => string;
  /** Refuses a request without a fresh step-up (uploads, commits and reverts of import runs). */
  stepUp: MiddlewareHandler;
}

/**
 * The ledger API (P2a): accounts with balances and Kontostand prüfen, bookings with filters and
 * bulk edits, payees, pick lists and undo. Mounted below `/api` behind the session guard. Every
 * write answers with the `groupId` of its audit group; `POST /undo` reverts that whole action.
 */
export function createLedgerApi({
  db,
  today = () => todayInVienna(),
  stepUp,
}: LedgerApiOptions): Hono {
  const api = new Hono();
  api.route('/accounts', accountRoutes(db, today));
  api.route('/bookings', bookingRoutes(db));
  api.route('/payees', payeeRoutes(db));
  api.route('/categories', categoryRoutes(db));
  api.route('/budget', budgetRoutes(db));
  api.route('/lookups', lookupRoutes(db));
  api.route('/undo', undoRoutes(db));
  api.route('/imports', importRoutes(db, today, stepUp));
  api.onError(errorResponse);
  return api;
}
