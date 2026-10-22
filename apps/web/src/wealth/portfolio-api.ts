import type {
  AssetClassRow,
  PortfolioPositionsView,
  SecurityRecord,
  PortfolioSummary,
  InstrumentHistory,
} from '@budget/db';
import type { Period } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { WithValuationNotes } from '../ledger/valuation-hint';
export type {
  PortfolioPositionsView,
  PortfolioPosition,
  PositionClass,
  SecurityRecord,
} from '@budget/db';
export const portfolioPerformanceQuery = (period: Period) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'portfolio-performance-report', period, 'securities', 'valuation-v1'],
    retry: false,
    queryFn: () =>
      request<{ portfolio: PortfolioSummary } & WithValuationNotes>(
        'GET',
        `/api/portfolio?period=${period}&view=securities&history=performance&provenance=valuation-v1`,
      ),
  });
export const portfolioPositionsQuery = (asOf?: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'portfolio-positions', ...(asOf ? [asOf] : [])],
    retry: false,
    queryFn: () =>
      request<PortfolioPositionsView & WithValuationNotes>('GET', `/api/portfolio/positions${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ''}`),
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


export const instrumentHistoryQuery = (securityId: string, from: string | undefined, to: string | undefined) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'instrument-history', securityId, from ?? 'Max', to],
    enabled: !!securityId && securityId !== 'neu' && !!to,
    retry: false,
    queryFn: () => {
      if (!to) throw new Error('Der Stichtag fehlt.');
      const params = new URLSearchParams({ to });
      if (from) params.set('from', from);
      return request<{ history: InstrumentHistory }>('GET', `/api/securities/${encodeURIComponent(securityId)}/history?${params.toString()}`);
    },
  });
