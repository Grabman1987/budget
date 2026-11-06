import type { FinancialHealthAssessment } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';

export const financialHealthQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'financial-health', 'current'],
    retry: false,
    queryFn: () => request<FinancialHealthAssessment>('GET', '/api/rules/health'),
  });
