import type {
  ContactOutlook,
  KontoblattRow,
  MonthlyStatement,
  OpenItem,
  Settlement,
} from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { queryString, request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { WriteResult } from '../ledger/types';

/**
 * Shapes and calls of the contacts API (`/api/contacts`); amounts are integer cents. The keys sit
 * under the ledger family: every ledger write (capture of an Auslage, an undo) refreshes them.
 */

export interface ContactView {
  id: string;
  name: string;
  note: string | null;
  /** Forderung (+) or Verbindlichkeit (−). Not part of the net worth. */
  balanceCents: number;
  splitBalanceCents: number;
  accountBalanceCents: number;
  openCents: number;
  openItemCount: number;
  creditCents: number;
  expectedContributionCents: number;
  expectedPassThroughCents: number;
}

export interface ContactTotals {
  receivableCents: number;
  payableCents: number;
  openItemCount: number;
}

export interface LedgerRow extends KontoblattRow {
  bookingId: string;
  accountId: string;
}

export interface ContactLedger {
  contact: ContactView;
  openingCents: number;
  rows: LedgerRow[];
  statements: MonthlyStatement[];
  openItems: OpenItem[];
  outlook: ContactOutlook;
}

export interface SettleInput {
  accountId: string;
  date: string;
  amountCents: number;
  memo?: string | null;
}

export interface SettleResult extends WriteResult {
  bookingId: string;
  settlement: Settlement;
  contact: ContactView;
}

export const CONTACTS_KEY = [...LEDGER_KEY, 'contacts'] as const;

export const contactsQuery = () =>
  queryOptions({
    queryKey: [...CONTACTS_KEY, 'list'],
    queryFn: () =>
      request<{ contacts: ContactView[]; totals: ContactTotals }>('GET', '/api/contacts'),
  });

/** The Kontoblatt of one month (`from`..`to` inclusive). */
export const contactLedgerQuery = (id: string, from: string, to: string) =>
  queryOptions({
    queryKey: [...CONTACTS_KEY, 'ledger', id, from, to],
    queryFn: () =>
      request<ContactLedger>(
        'GET',
        `/api/contacts/${encodeURIComponent(id)}/ledger${queryString({ from, to })}`,
      ),
  });

const path = (id: string) => `/api/contacts/${encodeURIComponent(id)}`;

export const createContact = (input: { name: string; note?: string | null }) =>
  request<{ contact: ContactView } & WriteResult>('POST', '/api/contacts', input);
export const patchContact = (id: string, patch: { name?: string; note?: string | null }) =>
  request<{ contact: ContactView } & WriteResult>('PATCH', path(id), patch);
export const deleteContact = (id: string) => request<WriteResult>('DELETE', path(id));
export const settleContact = (id: string, input: SettleInput) =>
  request<SettleResult>('POST', `${path(id)}/settle`, input);
