import type { NetWorthHistory } from '@budget/db';
import type { Period } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { WEALTH_KEY } from '../wealth/api';

export type { NetWorthHistory };

/** Under the wealth key: every booking or market write refreshes the history as well. */
export const netWorthHistoryQuery = (period: Period) =>
  queryOptions({
    queryKey: [...WEALTH_KEY, 'history', period],
    retry: false,
    queryFn: () => request<NetWorthHistory>('GET', `/api/networth-history?period=${period}`),
  });
