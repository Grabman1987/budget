import type {
  IncomePauseView,
  IncomePauseInput,
  IncomePausePatch,
  LiquidityReportView,
  PlannedEventInput,
  PlannedEventPatch,
  PlannedEventView,
} from '@budget/db';
import type { LiquidityHorizon, LiquidityLeverId } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { AccountRow, WriteResult } from '../ledger/types';

/**
 * Typed calls of the liquidity report API (`/api/liquidity`). The planned events are written
 * through `useBudgetWrite`, which refreshes everything under `LEDGER_KEY`, so the query lives there.
 */

export type { IncomePauseView, LiquidityReportView, PlannedEventView };
export const plannedEventsQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'planned-events'],
    retry: false,
    queryFn: () =>
      request<{
        asOf: string;
        events: PlannedEventView[];
        budgetAccounts: Pick<
          AccountRow,
          'id' | 'name' | 'type' | 'onBudget' | 'sortOrder' | 'closedAt'
        >[];
      }>('GET', '/api/liquidity/events'),
  });

export const liquidityQuery = (
  horizon: LiquidityHorizon,
  levers: ReadonlyArray<LiquidityLeverId>,
) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'liquidity-report', horizon, [...levers].sort().join(',')],
    retry: false,
    queryFn: () =>
      request<LiquidityReportView>(
        'GET',
        `/api/liquidity?horizon=${horizon}${levers.length ? `&levers=${[...levers].sort().join(',')}` : ''}`,
      ),
  });

export const createPlannedEvent = (input: PlannedEventInput) =>
  request<WriteResult & { event: PlannedEventView }>('POST', '/api/liquidity/events', input);

export const patchPlannedEvent = (id: string, patch: PlannedEventPatch) =>
  request<WriteResult & { event: PlannedEventView }>(
    'PATCH',
    `/api/liquidity/events/${encodeURIComponent(id)}`,
    patch,
  );

export const deletePlannedEvent = (id: string) =>
  request<WriteResult>('DELETE', `/api/liquidity/events/${encodeURIComponent(id)}`);

export const createIncomePause = (input: IncomePauseInput) =>
  request<
    WriteResult & { pause: Pick<IncomePauseView, 'id' | 'sourceId' | 'startDate' | 'endDate'> }
  >('POST', '/api/liquidity/income-pauses', input);

export const patchIncomePause = (id: string, patch: IncomePausePatch) =>
  request<
    WriteResult & { pause: Pick<IncomePauseView, 'id' | 'sourceId' | 'startDate' | 'endDate'> }
  >('PATCH', `/api/liquidity/income-pauses/${encodeURIComponent(id)}`, patch);

export const deleteIncomePause = (id: string) =>
  request<WriteResult>('DELETE', `/api/liquidity/income-pauses/${encodeURIComponent(id)}`);
