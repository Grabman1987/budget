import type { AssetsDebtsHistory as AssetsDebtsHistoryData } from '@budget/db';
import type { Period } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import type { WithValuationNotes } from '../ledger/valuation-hint';
import { WEALTH_KEY } from '../wealth/api';

export type AssetsDebtsHistory = AssetsDebtsHistoryData & WithValuationNotes;

/** Under the wealth key: every booking or market write refreshes the report as well. */
export const assetsDebtsHistoryQuery = (period: Period) =>
  queryOptions({
    queryKey: [...WEALTH_KEY, 'assets-debts', period],
    retry: false,
    queryFn: () => request<AssetsDebtsHistory>('GET', `/api/assets-debts-history?period=${period}`),
  });
