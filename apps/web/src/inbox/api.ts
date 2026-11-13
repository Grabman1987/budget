import { useSyncExternalStore } from 'react';
import {
  infiniteQueryOptions,
  notifyManager,
  queryOptions,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { request } from '../api/http';
import type { InboxPeriod, InboxSegment, InboxTaskSource } from '@budget/domain';
import { LEDGER_KEY } from '../ledger/queries';
import type { AccountReminder } from '../heute/api';
import type { SavingsExecutionProposal } from '../wealth/savings-api';
import type { PayslipDocumentMetadata } from '../reports/payslip-intake';
export type InboxKind =
  | 'uncategorized'
  | 'revision'
  | 'import'
  | 'stale_value'
  | 'consent'
  | 'overspent'
  | 'expected_payment'
  | 'receivable'
  | 'reconciliation'
  | 'backup'
  | 'other';
export interface InboxBooking {
  type: 'booking';
  id: string;
  bookingId: string;
  kind: 'uncategorized';
  urgent: false;
  date: string;
  accountName: string;
  payeeName: string | null;
  memo: string | null;
  amountCents: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'reconciled';
  source: 'manual' | 'bank' | 'import' | 'migration' | 'system';
  missingSplits: number;
}
export interface InboxStored {
  payslipDocument?: PayslipDocumentMetadata;
  type: 'stored';
  id: string;
  kind: InboxKind;
  title: string;
  detail: string | null;
  refType: string | null;
  refId: string | null;
  urgent: boolean;
  createdAt: string;
  bankCandidate?:
    | {
        date: string;
        amountCents: number;
        currency: string;
        memo: string;
        payeeName: string | null;
        accountName: string;
        suggestion?: { label: string; needsReview: boolean };
      }
    | undefined;
}
export interface InboxEnvelope {
  type: 'envelope';
  id: string;
  kind: 'overspent';
  categoryId: string;
  month: string;
  /** Positive amount in cents needed to bring the current envelope back to zero. */
  deficitCents: number;
  title: string;
  detail: string;
  urgent: true;
}
export type InboxEntry = InboxBooking | InboxStored | InboxEnvelope | SavingsExecutionProposal;
export interface InboxView {
  asOf: string;
  count: number;
  bankProgress?: { reviewed: number; total: number };
  entries: InboxEntry[];
  readSourceSummaries: { sourceId: string | null; name: string; count: number }[];
  overspentSummary?: { month: string; count: number; deficitCents: number } | undefined;
}
export interface InboxPage extends InboxView {
  totalEntries: number;
  countsByKind: Partial<Record<InboxKind, number>>;
  countsByCause: Record<string, number>;
  limit: number;
  offset: number;
  next: number | null;
  countsByTitle?: Record<string, number>;
  /** Konten › Prüfen only: the part shown and the open work of both parts. */
  segment?: InboxSegment;
  segments?: Record<InboxSegment, number>;
  taskSources?: Record<InboxTaskSource, number>;
  accountReminders?: AccountReminder[];
}
export const readSourceMovementsQuery = (sourceId: string, title: string) =>
  infiniteQueryOptions({
    queryKey: [...INBOX_KEY, 'read-source', sourceId, title],
    queryFn: ({ pageParam }) =>
      request<InboxPage>(
        'GET',
        `/api/inbox?readSource=${encodeURIComponent(sourceId)}&limit=${INBOX_PAGE_SIZE}&offset=${pageParam}${title ? `&title=${encodeURIComponent(title)}` : ''}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    refetchInterval: 60_000,
  });
export const INBOX_KEY = [...LEDGER_KEY, 'inbox'] as const;
export const INBOX_PAGE_SIZE = 100;
export const inboxQuery = (bankSource?: string) =>
  queryOptions({
    queryKey: bankSource ? [...INBOX_KEY, 'bank-source', bankSource] : INBOX_KEY,
    queryFn: () =>
      request<InboxView>(
        'GET',
        '/api/inbox' + (bankSource ? '?bankSource=' + encodeURIComponent(bankSource) : ''),
      ),
    refetchInterval: 60_000,
  });
export const inboxPagesQuery = (
  period: InboxPeriod = 'all',
  bankSource?: string,
  dateSort?: 'newest' | 'oldest',
  fromDate?: string,
  /** Without a choice the server opens on the part that has open work. */
  segment: InboxSegment | 'auto' = 'auto',
  /** Keeps the shown part stable after `auto` has picked one (same cache entry). */
  pinned?: InboxSegment,
  bankAccountId?: string,
  taskSource?: 'plan' | 'payslips' | 'other',
  bankRecap?: string,
) =>
  infiniteQueryOptions({
    queryKey: [
      ...INBOX_KEY,
      'pages',
      INBOX_PAGE_SIZE,
      period,
      bankSource ?? null,
      dateSort ?? null,
      fromDate ?? null,
      bankSource ? null : segment,
      ...(bankAccountId ? ['bank-account', bankAccountId] : []),
      ...(taskSource ? ['task-source', taskSource] : []),
      ...(bankRecap ? ['bank-recap', bankRecap] : []),
    ] as const,
    queryFn: ({ pageParam }) =>
      request<InboxPage>(
        'GET',
        `/api/inbox?limit=${INBOX_PAGE_SIZE}&offset=${pageParam}${period === 'all' ? '' : `&period=${period}`}${bankSource ? `&bankSource=${encodeURIComponent(bankSource)}` : ''}${dateSort ? `&dateSort=${dateSort}` : ''}${fromDate ? `&fromDate=${encodeURIComponent(fromDate)}` : ''}${bankSource ? '' : `&segment=${segment === 'auto' ? (pinned ?? segment) : segment}`}${bankAccountId ? `&bankAccountId=${encodeURIComponent(bankAccountId)}` : ''}${taskSource ? `&taskSource=${taskSource}` : ''}${bankRecap ? `&bankRecap=${encodeURIComponent(bankRecap)}` : ''}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    refetchInterval: 60_000,
  });
export const inboxDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...INBOX_KEY, 'detail', id],
    queryFn: () => request<{ entry: InboxStored }>('GET', `/api/inbox/${encodeURIComponent(id)}`),
  });
const COUNT_KEY = [...INBOX_KEY, 'count'] as const;
export const inboxCountQuery = () =>
  queryOptions({
    queryKey: COUNT_KEY,
    queryFn: () => request<{ asOf: string; count: number }>('GET', '/api/inbox/count'),
    refetchInterval: 60_000,
  });
const isGlobalPagesKey = (key: readonly unknown[]) =>
  key[0] === INBOX_KEY[0] &&
  key[1] === INBOX_KEY[1] &&
  key[2] === 'pages' &&
  key[5] === null && // no bank source scope
  !key.includes('bank-account');

const isRefreshTarget = (key: readonly unknown[]) =>
  isGlobalPagesKey(key) || (key.length === COUNT_KEY.length && key[2] === 'count');

const tracked = new WeakSet<QueryClient>();
/** Queries whose latest fetch was started by an invalidation, not by polling or a mount. */
const afterInvalidation = new WeakSet<object>();
/** Start of the latest fetch of a queue query, to tell whether the count is newer than it. */
const fetchStartedAt = new WeakMap<object, number>();

/**
 * One data state for the header and the Prüfen parts. Registered once per client:
 * - a loaded unscoped queue (page 0 carries the segment totals) feeds the count cache, unless
 *   the count was read after that queue request started (an older response never regresses it);
 * - fetches started by an invalidation are remembered, so polling never counts as a refresh.
 */
export function syncInboxCount(client: QueryClient): void {
  if (tracked.has(client)) return;
  tracked.add(client);
  // `invalidateQueries` marks and refetches within one synchronous call.
  let invalidating = false;
  client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return;
    const { query } = event;
    if (!isRefreshTarget(query.queryKey)) return;
    const { action } = event;
    if (action.type === 'invalidate') {
      invalidating = true;
      queueMicrotask(() => (invalidating = false));
    } else if (action.type === 'fetch') {
      fetchStartedAt.set(query, Date.now());
      if (invalidating) afterInvalidation.add(query);
      else afterInvalidation.delete(query);
    } else if (action.type === 'success' && isGlobalPagesKey(query.queryKey)) {
      const first = (query.state.data as InfiniteData<InboxPage> | undefined)?.pages[0];
      if (!first?.segments) return;
      const count = client.getQueryState(COUNT_KEY);
      if ((count?.dataUpdatedAt ?? 0) > (fetchStartedAt.get(query) ?? 0)) return;
      client.setQueryData(COUNT_KEY, {
        asOf: first.asOf,
        count: first.segments.umsaetze + first.segments.aufgaben,
      });
    }
  });
}

/** Notifications go through the same scheduler as query observers, so header and parts render together. */
const subscribeCache = (client: QueryClient) => (notify: () => void) =>
  client.getQueryCache().subscribe(notifyManager.batchCalls(notify));

/**
 * True while the unscoped queue or the count is re-read after an invalidating write: the parts on
 * screen belong to the previous data state. Polling and scoped queues never set this.
 */
export function useInboxRefreshing(): boolean {
  const client = useQueryClient();
  syncInboxCount(client);
  return useSyncExternalStore(subscribeCache(client), () =>
    client
      .getQueryCache()
      .findAll({ queryKey: INBOX_KEY, fetchStatus: 'fetching' })
      .some((query) => isRefreshTarget(query.queryKey) && afterInvalidation.has(query)),
  );
}

/**
 * Total of the mounted unscoped queue (Umsätze + Aufgaben): while the Prüfen parts are on screen
 * the header follows them, so both always show the same data state. Undefined without such a queue.
 */
export function useInboxQueueTotal(): number | undefined {
  const client = useQueryClient();
  return useSyncExternalStore(subscribeCache(client), () => {
    let best: { at: number; total: number } | undefined;
    for (const query of client.getQueryCache().findAll({ queryKey: [...INBOX_KEY, 'pages'] })) {
      if (!isGlobalPagesKey(query.queryKey) || !query.getObserversCount()) continue;
      const segments = (query.state.data as InfiniteData<InboxPage> | undefined)?.pages[0]
        ?.segments;
      if (!segments) continue;
      if (!best || query.state.dataUpdatedAt > best.at)
        best = { at: query.state.dataUpdatedAt, total: segments.umsaetze + segments.aufgaben };
    }
    return best?.total;
  });
}
export const resolveInbox = (id: string) =>
  request<{ groupId: string }>('POST', `/api/inbox/${encodeURIComponent(id)}/resolve`, {});
