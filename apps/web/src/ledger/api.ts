import { queryString, request } from '../api/http';
import type {
  AccountList,
  AccountRow,
  BookingFilter,
  BookingFlag,
  BookingPage,
  BookingStatus,
  ListedBooking,
  Lookups,
  PayeeRow,
  ReconciliationPreview,
  ReconcileResult,
  SeriesPoint,
  WriteResult,
} from './types';

/** Typed calls of the ledger API. Pages never build URLs themselves. */

const filterParams = (filter: BookingFilter) => ({
  accountId: filter.accountId,
  from: filter.from,
  to: filter.to,
  categoryId: filter.categoryId,
  payeeId: filter.payeeId,
  status: filter.status,
  flag: filter.flag,
  q: filter.q,
  sort: filter.sort,
  direction: filter.direction,
});

export const fetchAccounts = (asOf?: string) =>
  request<AccountList>('GET', `/api/accounts${queryString({ asOf })}`);

export const fetchSeries = (accountId: string, from: string, to: string) =>
  request<{ accountId: string; points: SeriesPoint[] }>(
    'GET',
    `/api/accounts/${encodeURIComponent(accountId)}/series${queryString({ from, to })}`,
  );

export interface AccountInput {
  name: string;
  type: string;
  onBudget?: boolean;
  currency?: string;
  openingBalanceCents: number;
  openingDate: string;
  creditLimitCents?: number | null;
  overdraftLimitCents?: number | null;
  interestRateBp?: number | null;
  termEnd?: string | null;
  monthlyFeeCents?: number | null;
}

export const createAccount = (input: AccountInput) =>
  request<{ account: AccountRow } & WriteResult>('POST', '/api/accounts', input);

export const patchAccount = (id: string, patch: Partial<AccountInput>) =>
  request<{ account: AccountRow } & WriteResult>(
    'PATCH',
    `/api/accounts/${encodeURIComponent(id)}`,
    patch,
  );

export const closeAccount = (id: string, force = false) =>
  request<{ account: AccountRow } & WriteResult>(
    'POST',
    `/api/accounts/${encodeURIComponent(id)}/close`,
    { force },
  );

export const reopenAccount = (id: string) =>
  request<{ account: AccountRow } & WriteResult>(
    'POST',
    `/api/accounts/${encodeURIComponent(id)}/reopen`,
    {},
  );

export const fetchBookings = (filter: BookingFilter, cursor?: string, limit = 50) =>
  request<BookingPage>(
    'GET',
    `/api/bookings${queryString({ ...filterParams(filter), cursor, limit })}`,
  );

export const fetchLookups = () => request<Lookups>('GET', '/api/lookups');
export const fetchPayees = () => request<{ payees: PayeeRow[] }>('GET', '/api/payees');
export const createPayee = (name: string) =>
  request<{ payee: PayeeRow } & WriteResult>('POST', '/api/payees', { name });

export interface SplitInput {
  categoryId: string | null;
  amountCents: number;
  memo?: string | null;
}

export type BookingCreate =
  | {
      type: 'booking';
      accountId: string;
      date: string;
      amountCents: number;
      payeeId?: string | null;
      memo?: string | null;
      status?: 'pending' | 'confirmed';
      flag?: BookingFlag | null;
      splits: SplitInput[];
    }
  | {
      type: 'transfer';
      fromAccountId: string;
      toAccountId: string;
      date: string;
      amountCents: number;
      categoryId?: string | null;
      memo?: string | null;
      status?: 'pending' | 'confirmed';
    };

export interface BookingPatch {
  accountId?: string;
  date?: string;
  amountCents?: number;
  payeeId?: string | null;
  memo?: string | null;
  status?: 'pending' | 'confirmed';
  flag?: BookingFlag | null;
  splits?: SplitInput[];
  unlockReconciled?: boolean;
}

export const createBooking = (input: BookingCreate) =>
  request<{ bookings: ListedBooking[] } & WriteResult>('POST', '/api/bookings', input);

export const patchBooking = (id: string, patch: BookingPatch) =>
  request<{ bookings: ListedBooking[] } & WriteResult>(
    'PATCH',
    `/api/bookings/${encodeURIComponent(id)}`,
    patch,
  );

export const deleteBooking = (id: string, unlock = false) =>
  request<WriteResult>(
    'DELETE',
    `/api/bookings/${encodeURIComponent(id)}${unlock ? '?unlock=1' : ''}`,
  );

export interface BulkResult extends WriteResult {
  changed: string[];
  skipped: { id: string; reason: string }[];
}

export const bulkUpdateBookings = (
  ids: string[],
  set: { categoryId?: string | null; flag?: BookingFlag | null; status?: 'pending' | 'confirmed' },
) => request<BulkResult>('POST', '/api/bookings/bulk', { action: 'update', ids, set });

export const bulkDeleteBookings = (ids: string[]) =>
  request<BulkResult>('POST', '/api/bookings/bulk', { action: 'delete', ids });

export const undoGroup = (groupId: string) =>
  request<WriteResult>('POST', '/api/undo', { groupId });

export type { BookingStatus };

export const previewReconciliation = (
  accountId: string,
  input: { date: string; statementBalanceCents: number },
) =>
  request<{ preview: ReconciliationPreview }>(
    'POST',
    `/api/accounts/${encodeURIComponent(accountId)}/reconciliation/preview`,
    input,
  ).then((r) => r.preview);

export interface ReconcileRequest {
  date: string;
  statementBalanceCents: number;
  removeBookingIds?: string[];
  confirmBookingIds?: string[];
  adjust?: boolean;
}

export const reconcileAccount = (accountId: string, input: ReconcileRequest) =>
  request<{ result: ReconcileResult; account: AccountRow }>(
    'POST',
    `/api/accounts/${encodeURIComponent(accountId)}/reconciliation`,
    input,
  );
