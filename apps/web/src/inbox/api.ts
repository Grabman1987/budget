import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
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
export type InboxEntry = InboxBooking | InboxStored | SavingsExecutionProposal;
export interface InboxView {
  asOf: string;
  count: number;
  entries: InboxEntry[];
}
export const INBOX_KEY = [...LEDGER_KEY, 'inbox'] as const;
export const inboxQuery = () =>
  queryOptions({
    queryKey: INBOX_KEY,
    queryFn: () => request<InboxView>('GET', '/api/inbox'),
    refetchInterval: 60_000,
  });
export const inboxCountQuery = () =>
  queryOptions({
    queryKey: [...INBOX_KEY, 'count'],
    queryFn: () => request<{ asOf: string; count: number }>('GET', '/api/inbox/count'),
    refetchInterval: 60_000,
  });
export const resolveInbox = (id: string) =>
  request<{ groupId: string }>('POST', `/api/inbox/${encodeURIComponent(id)}/resolve`, {});
