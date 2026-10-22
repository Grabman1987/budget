import type { PortfolioStrategyWithRebalanceView, TradeRow } from '@budget/db';
import type { StrategyConfiguration } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import type { WithValuationNotes } from '../ledger/valuation-hint';
import { LEDGER_KEY } from '../ledger/queries';
export const strategyQuery = () => queryOptions({
  queryKey: [...LEDGER_KEY, 'portfolio-trend-strategy'], retry: false,
  queryFn: () => request<PortfolioStrategyWithRebalanceView & WithValuationNotes>('GET', '/api/portfolio-strategy'),
});
export const saveStrategy = (config: StrategyConfiguration, revision: string) =>
  request<{ groupId: string; changedCount: number }>('PUT', '/api/portfolio-strategy/configuration', { config, revision });
export const saveStrategyDecision = (month: string, revision: string, decisionRevision: string) =>
  request<{ groupId: string; changedCount: number }>('POST', '/api/portfolio-strategy/decision', { month, revision, decisionRevision });
export const strategyTradesQuery = () => queryOptions({ queryKey: [...LEDGER_KEY, 'strategy-rebalance-trades'], retry: false,
  queryFn: () => request<{ trades: TradeRow[] }>('GET', '/api/trades') });
type ReviewedTrade = Pick<TradeRow, 'id' | 'accountId' | 'securityId' | 'date' | 'kind' |
  'unitsE8' | 'amountCents' | 'feeCents' | 'taxCents' | 'bookingId'> &
  { currency: string; auditRevision: string };
export const strategyTradeFactsQuery = (id: string) => queryOptions({
  queryKey: [...LEDGER_KEY, 'strategy-rebalance-trade', id], enabled: !!id, retry: false,
  queryFn: () => request<{ trade: ReviewedTrade; accountName: string; revision: string }>(
    'GET', `/api/portfolio-strategy/rebalance/trade/${encodeURIComponent(id)}`),
});
type EventCommand = { month: string; revision: string; requestId: string };
type EventReceipt = { groupId: string; changedCount: number; revision: string };
export const reviewRebalance = (input: EventCommand & { decisionRevision: string; proposalRevision: string }) =>
  request<EventReceipt>('POST', '/api/portfolio-strategy/rebalance/review', input);
export const linkRebalanceTrade = (input: EventCommand & { tradeId: string; tradeRevision: string; category: string }) =>
  request<EventReceipt>('POST', '/api/portfolio-strategy/rebalance/link', input);
export const unlinkRebalanceTrade = (input: EventCommand & { tradeId: string }) =>
  request<EventReceipt>('POST', '/api/portfolio-strategy/rebalance/unlink', input);
export const closeRebalance = (input: EventCommand & { outcome: 'completed' | 'cancelled' | 'partial_closed' | 'reopen' }) =>
  request<EventReceipt>('POST', '/api/portfolio-strategy/rebalance/close', input);
