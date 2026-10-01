import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { WriteResult } from '../ledger/types';

/** Shapes and calls of the Posteingang API (`/api/inbox`); amounts are integer cents. */

export type InboxGroupId =
  'over' | 'uncat' | 'transfer' | 'version' | 'stale' | 'consent' | 'rules' | 'other';

export interface InboxItem {
  id: string;
  kind: string;
  group: InboxGroupId;
  /** A, B, C … across all groups. */
  letter: string;
  title: string;
  detail: string | null;
  urgent: boolean;
  refType: string | null;
  refId: string | null;
  suggestion: { categoryId: string; categoryName: string; categoryClass: string | null } | null;
  canRule: boolean;
  version: { paymentId: string; fromMonth: string; amountCents: number; label: string } | null;
  value: { valueCents: number; daysOld: number } | null;
}

export interface InboxGroup {
  id: InboxGroupId;
  no: number;
  title: string;
  sub: string;
  count: number;
  items: InboxItem[];
}

export interface InboxData {
  count: number;
  minutes: number;
  groups: InboxGroup[];
}

export interface InboxDecision extends WriteResult {
  resolvedIds: string[];
}

/** Under the ledger key: every write that invalidates the ledger refreshes the inbox too. */
export const INBOX_KEY = [...LEDGER_KEY, 'inbox'] as const;

export const inboxQuery = () =>
  queryOptions({ queryKey: INBOX_KEY, queryFn: () => request<InboxData>('GET', '/api/inbox') });

const item = (id: string, action: string) => `/api/inbox/${encodeURIComponent(id)}/${action}`;

export const acceptItem = (id: string, body: { categoryId?: string; valueCents?: number } = {}) =>
  request<InboxDecision>('POST', item(id, 'accept'), body);
export const ruleItem = (id: string) =>
  request<InboxDecision & { applied: number; categoryId: string }>('POST', item(id, 'rule'), {});
export const dismissItem = (id: string) => request<InboxDecision>('POST', item(id, 'dismiss'));
export const acceptAll = () => request<InboxDecision>('POST', '/api/inbox/accept-all');
