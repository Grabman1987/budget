import type { PortfolioStrategyView } from '@budget/db';
import type { StrategyConfiguration } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import type { WithValuationNotes } from '../ledger/valuation-hint';
import { LEDGER_KEY } from '../ledger/queries';
export const strategyQuery = () => queryOptions({
  queryKey: [...LEDGER_KEY, 'portfolio-trend-strategy'], retry: false,
  queryFn: () => request<PortfolioStrategyView & WithValuationNotes>('GET', '/api/portfolio-strategy'),
});
export const saveStrategy = (config: StrategyConfiguration, revision: string) =>
  request<{ groupId: string; changedCount: number }>('PUT', '/api/portfolio-strategy/configuration', { config, revision });
export const saveStrategyDecision = (month: string, revision: string, decisionRevision: string) =>
  request<{ groupId: string; changedCount: number }>('POST', '/api/portfolio-strategy/decision', { month, revision, decisionRevision });
