import { payrollRoutes, projectRoutes } from './payroll-projects';
import { assignmentRoutes } from './assignment-rules';
import { payslipIntakeRoutes } from './payslip-intake';
import { incomeMonthRoutes } from './income-month';
import { bankSyncFromEnv } from '../bank-sync/config';
import type { BankSync } from '../bank-sync/service';
import { bankSyncRoutes } from './bank-sync';
import { cryptoReadSource } from '../sources/crypto-api';
import { readSourceRoutes } from './read-source';
import { searchRoutes } from './search';
import { inboxRoutes } from './inbox';
import { contactRoutes } from './contacts';
import { namedNotes, runWithValuationNotes, sqliteOf, type Db } from '@budget/db';
import { receiptDirectory } from '../receipts/files';
import { receiptRoutes } from './receipts';
import { todayInVienna } from '@budget/domain';
import type { MarketSources } from '@budget/market';
import { Hono, type MiddlewareHandler } from 'hono';
import { ImportJobs } from '../imports/jobs';
import { importRoutes } from '../imports/routes';
import { importHttpEnabled } from '../imports/config';
import { accountRoutes } from './accounts';
import { bookingRoutes } from './bookings';
import { budgetRoutes, categoryRoutes } from './budget';
import { cashflowRoutes } from './cashflow-report';
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
import { liquidityRoutes } from './liquidity';
import { lookupRoutes, payeeRoutes, undoRoutes } from './lookups';
import { profileRoutes } from './profile';
import { marketRoutes } from './market';
import { networthHistoryRoutes } from './networth-history';
import { wealthRoutes } from './wealth';
import { ruleRoutes } from './rules';
import { monthReportRoutes } from './reports-month';
import { overviewReportRoutes } from './overview-reports';
import { spendingReportRoutes } from './spending-reports';
import { reportTableRoutes } from './report-tables';
import { payeeReportRoutes } from './payee-report';

export interface LedgerApiOptions {
  db: Db;
  bankSync?: BankSync | null;
  /** "Today" as `YYYY-MM-DD` (Europe/Vienna by default); tests pass a fixed day. */
  today?: () => string;
  /** Price and rate sources for the market refresh; default per `BUDGET_MARKET_SOURCES`. */
  market?: MarketSources | undefined;
  /** Refuses a request without a fresh step-up (uploads, commits and reverts of import runs). */
  stepUp: MiddlewareHandler;
  /** Runner of the import tasks (worker threads); one per database. */
  jobs?: ImportJobs | undefined;
  receiptsDir?: string | undefined;
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
  bankSync = bankSyncFromEnv(db),
  jobs,
  receiptsDir = receiptDirectory(sqliteOf(db).name),
}: LedgerApiOptions): Hono {
  const api = new Hono();
  // A valuation that had to estimate or skip a position (no quote) reports it while it runs; the
  // answer then carries them as `incomplete` and the page shows "Bewertung teilweise geschätzt".
  api.use('*', async (c, next) => {
    await runWithValuationNotes(async (notes) => {
      await next();
      const found = notes();
      if (found.length === 0 || c.res.status < 200 || c.res.status > 201) return;
      if (!c.res.headers.get('content-type')?.includes('application/json')) return;
      const body: unknown = await c.res
        .clone()
        .json()
        .catch(() => null);
      if (body === null || typeof body !== 'object' || Array.isArray(body) || 'incomplete' in body)
        return;
      const headers = new Headers(c.res.headers);
      headers.delete('content-length');
      c.res = new Response(JSON.stringify({ ...body, incomplete: namedNotes(db, found) }), {
        status: c.res.status,
        headers,
      });
    });
  });
  api.route('/payslips', payrollRoutes(db, today));
  api.route('/payslip-intake', payslipIntakeRoutes(db, receiptsDir));
  api.route('/projects', projectRoutes(db, today));
  api.route('/income-month-rules', incomeMonthRoutes(db));
  api.route('/assignment-rules', assignmentRoutes(db));
  api.route('/bank-sync', bankSyncRoutes(bankSync, stepUp, db));
  api.route('/sources/crypto', readSourceRoutes(db, today, stepUp, cryptoReadSource()));
  api.route('/search', searchRoutes(db));
  api.route('/accounts', accountRoutes(db, today));
  api.route('/inbox', inboxRoutes(db, today));
  api.route('/bookings', bookingRoutes(db));
  api.route('/receipts', receiptRoutes(db, receiptsDir));
  api.route('/payees', payeeRoutes(db));
  api.route('/categories', categoryRoutes(db));
  api.route('/budget', budgetRoutes(db, today));
  api.route('/expected', expectedRoutes(db, today));
  api.route('/export', exportRoutes(db, today, stepUp));
  api.route('/wealth', wealthRoutes(db, today));
  api.route('/contacts', contactRoutes(db, today));
  api.route('/reports/payees', payeeReportRoutes(db, today));
  api.route('/goals', goalRoutes(db, today));
  api.route('/liquidity', liquidityRoutes(db, today));
  api.route('/cashflow', cashflowRoutes(db, today));
  api.route('/networth-history', networthHistoryRoutes(db, today));
  api.route('/heute', heuteRoutes(db, today));
  api.route('/rules', ruleRoutes(db, today));
  api.route('/overview', overviewReportRoutes(db, today));
  api.route('/report-tables', reportTableRoutes(db, today));
  api.route('/securities', securityRoutes(db, today));
  api.route('/asset-classes', assetClassRoutes(db, today));
  api.route('/trades', tradeRoutes(db));
  api.route('/savings-plans', savingsPlanRoutes(db, today));
  api.route('/portfolio', portfolioRoutes(db, today));
  api.route('/profile', profileRoutes(db, today));
  api.route('/reports/month', monthReportRoutes(db, today));
  api.route('/reports/spending', spendingReportRoutes(db, today));
  api.route('/lookups', lookupRoutes(db));
  api.route('/undo', undoRoutes(db));
  api.route('/', marketRoutes(db, today, market));
  if (importHttpEnabled())
    api.route('/imports', importRoutes(db, today, stepUp, jobs ?? new ImportJobs(db)));
  api.onError(errorResponse);
  return api;
}
