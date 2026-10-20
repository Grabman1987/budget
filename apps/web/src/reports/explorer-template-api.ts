import { queryOptions } from '@tanstack/react-query';
import type { ExplorerTemplateFacts } from '@budget/domain';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';

/** Existing canonical report facts and classified splits; no new endpoint or write path. */
export const explorerTemplateQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'income-expense'],
  retry: false,
  queryFn: () => request<ExplorerTemplateFacts>('GET', '/api/report-tables/income-expense'),
});
