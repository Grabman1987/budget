import type { ReportTables } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';

export type { ReportTables };

/**
 * The monthly facts behind the reports 1.5 to 1.8. The net worth per month end is the one
 * expensive part and is only asked for by the Gesamttabelle. Every ledger write invalidates the
 * `LEDGER_KEY` family, so the reports stay current without an own mutation.
 */
export const reportTablesQuery = (netWorth: boolean) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'report-tables', netWorth],
    retry: false,
    queryFn: () =>
      request<ReportTables>('GET', `/api/report-tables/months${netWorth ? '?netWorth=1' : ''}`),
  });
