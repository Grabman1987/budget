import type { ExplorerViewsChange, ExplorerViewsState, ExplorerViewsWrite } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { EXPLORER_VIEWS_KEY } from './explorer-views';

export const SAVED_EXPLORER_KEY = ['explorer-saved-views'] as const;
export const savedExplorerViewsQuery = () =>
  queryOptions({
    queryKey: SAVED_EXPLORER_KEY,
    retry: false,
    queryFn: () => request<ExplorerViewsState>('GET', '/api/reports/saved-queries'),
  });
/** A separate per-entry read prevents an earlier hub/editor cache from selecting an old query. */
export const savedExplorerEntryQuery = (id: string | undefined, entryKey: string) =>
  queryOptions({
    queryKey: [...SAVED_EXPLORER_KEY, 'entry', id, entryKey] as const,
    retry: false,
    queryFn: () => request<ExplorerViewsState>('GET', '/api/reports/saved-queries'),
    enabled: Boolean(id),
    gcTime: 0,
    refetchOnMount: 'always' as const,
  });

export const changeSavedExplorerViews = (revision: string, change: ExplorerViewsChange) =>
  request<ExplorerViewsWrite>('POST', '/api/reports/saved-queries', { revision, ...change });

/** Never clear newer local edits, failed writes, or unsupported server data. */
export function acknowledgeExplorerPromotion(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  raw: string,
  pending: unknown[],
  response: ExplorerViewsState,
): boolean {
  if (response.unavailable || response.schemaVersion !== 1) return false;
  try {
    if (storage.getItem(EXPLORER_VIEWS_KEY) !== raw) return false;
    if (pending.length) storage.setItem(EXPLORER_VIEWS_KEY, JSON.stringify(pending));
    else storage.removeItem(EXPLORER_VIEWS_KEY);
    return true;
  } catch {
    return false;
  }
}
