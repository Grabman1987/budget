import { queryOptions } from '@tanstack/react-query';
import { request, queryString } from '../api/http';
import type { TradeRow } from '../wealth/trade-api';
import { LEDGER_KEY } from './queries';

export const depotTradesQuery = (account?: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'depot-trades', account ?? null],
    queryFn: () => request<{ trades: TradeRow[] }>('GET', `/api/trades${queryString({ account })}`),
  });
