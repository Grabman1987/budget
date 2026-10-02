import type { PortfolioAllocationView, TargetVersion } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
export type { PortfolioAllocationView, TargetVersion } from '@budget/db';
export const allocationQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'portfolio-allocation'],
    retry: false,
    queryFn: () => request<PortfolioAllocationView>('GET', '/api/portfolio/allocation'),
  });
export const targetVersionsQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'asset-target-versions'],
    retry: false,
    queryFn: () => request<{ versions: TargetVersion[] }>('GET', '/api/asset-classes/targets'),
  });
