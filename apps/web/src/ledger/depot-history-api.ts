import type { DepotHistoryPoint } from '@budget/db';
import type { Period } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from './queries';

/** Daily value and time-weighted return of one depot; same valuation as the depot comparison. */
export const depotHistoryQuery = (accountId: string, period: Period) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'depot-history', accountId, period],
    retry: false,
    queryFn: () =>
      request<{ history: DepotHistoryPoint[] }>(
        'GET',
        `/api/portfolio/depots/${encodeURIComponent(accountId)}/history?period=${period}`,
      ),
  });
