import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import type { InboxPeriod } from '@budget/domain';
import { LEDGER_KEY } from '../ledger/queries';
import type { SavingsExecutionProposal } from '../wealth/savings-api';
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
  type: 'stored';
  id: string;
  kind: InboxKind;
  title: string;
  detail: string | null;
  refType: string | null;
  refId: string | null;
  urgent: boolean;
  createdAt: string;
}
export interface InboxEnvelope {
  type: 'envelope';
  id: string;
  kind: 'overspent';
  categoryId: string;
  month: string;
  title: string;
  detail: string;
  urgent: true;
}
export type InboxEntry = InboxBooking | InboxStored | InboxEnvelope | SavingsExecutionProposal;
export interface InboxView {
  asOf: string;
  count: number;
  entries: InboxEntry[];
}
export interface InboxPage extends InboxView {
  totalEntries: number;
  countsByKind: Partial<Record<InboxKind, number>>;
  countsByCause: Record<string, number>;
  limit: number;
  offset: number;
  next: number | null;
}
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
export const inboxPagesQuery = (period: InboxPeriod = 'all', bankSource?: string) =>
  infiniteQueryOptions({
    queryKey: [...INBOX_KEY, 'pages', INBOX_PAGE_SIZE, period, bankSource ?? null] as const,
    queryFn: ({ pageParam }) =>
      request<InboxPage>(
        'GET',
        `/api/inbox?limit=${INBOX_PAGE_SIZE}&offset=${pageParam}${period === 'all' ? '' : `&period=${period}`}${bankSource ? `&bankSource=${encodeURIComponent(bankSource)}` : ''}`,
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
export const inboxCountQuery = () =>
  queryOptions({
    queryKey: [...INBOX_KEY, 'count'],
    queryFn: () => request<{ asOf: string; count: number }>('GET', '/api/inbox/count'),
    refetchInterval: 60_000,
  });
export const resolveInbox = (id: string) =>
  request<{ groupId: string }>('POST', `/api/inbox/${encodeURIComponent(id)}/resolve`, {});
