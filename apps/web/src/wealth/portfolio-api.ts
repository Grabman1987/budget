import type { AssetClassRow, PortfolioPositionsView, SecurityRecord } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
export type {
  PortfolioPositionsView,
  PortfolioPosition,
  PositionClass,
  SecurityRecord,
} from '@budget/db';
export const portfolioPositionsQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'portfolio-positions'],
    retry: false,
    queryFn: () => request<PortfolioPositionsView>('GET', '/api/portfolio/positions'),
  });
export const instrumentQuery = (id: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'instrument', id],
    enabled: !!id,
    queryFn: () =>
      request<{ security: SecurityRecord }>('GET', `/api/securities/${encodeURIComponent(id)}`),
  });
export const instrumentsQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'instruments'],
    retry: false,
    queryFn: () => request<{ securities: SecurityRecord[] }>('GET', '/api/securities'),
  });
export const assetClassesQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'asset-classes'],
    retry: false,
    queryFn: () => request<{ assetClasses: AssetClassRow[] }>('GET', '/api/asset-classes'),
  });
