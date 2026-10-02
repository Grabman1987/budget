import type { CashflowReport } from '@budget/db';
import type { Period } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';

export type { CashflowReport };

/** Under the ledger key: every booking write refreshes the cashflow as well. */
export const cashflowQuery = (period: Period) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'cashflow-report', period],
    retry: false,
    queryFn: () => request<CashflowReport>('GET', `/api/cashflow?period=${period}`),
  });
