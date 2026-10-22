import type { Rhythm } from '../expected/api';
import type { LiquidityHorizon, LiquidityLeverId } from '@budget/domain';
import { ApiError, queryString, request } from '../api/http';
import type {
  AccountList,
  AccountRow,
  AccountSeriesBatch,
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
  basis: filter.basis,
  ids: filter.id,
  accountId: filter.accountId,
  from: filter.from,
  to: filter.to,
  categoryId: filter.categoryId,
  categoryGroupId: filter.categoryGroupId,
  payeeId: filter.payeeId,
  status: filter.status,
  flag: filter.flag,
  q: filter.q,
  sort: filter.sort,
  direction: filter.direction,
});

export const fetchAccounts = (asOf?: string) =>
  request<AccountList>('GET', `/api/accounts${queryString({ asOf })}`);

export const fetchSeries = (
  accountId: string,
  from: string,
  to: string,
  previewDays = 0,
  forecast?: { horizon: LiquidityHorizon; levers: ReadonlyArray<LiquidityLeverId> },
) =>
  request<{
    accountId: string;
    points: SeriesPoint[];
    previewPoints?: SeriesPoint[];
    unavailableCurrencies?: string[];
    previewCoverage?: {
      partial: boolean;
      variableMonthlyCents: number;
      unassignedEventCount: number;
      unassignedPaymentCount: number;
      endDay: string;
      horizon: LiquidityHorizon;
    };
  }>(
    'GET',
    `/api/accounts/${encodeURIComponent(accountId)}/series${queryString({ from, to, previewDays, horizon: forecast?.horizon, levers: forecast?.levers.join(',') })}`,
  );

/** The series of all live accounts in one call (Konten), keyed by account id. */
export const fetchSeriesBatch = (from: string, to: string, options?: { quality?: true }) =>
  request<AccountSeriesBatch>(
    'GET',
    `/api/accounts/series${queryString({ from, to, ...(options?.quality ? { quality: '1' } : {}) })}`,
  );

export interface AccountInput {
  allocationAssetClassId?: string | null;
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
  interestKind?: 'fixed' | 'variable' | null;
  installmentCents?: number | null;
  termStart?: string | null;
  originalAmountCents?: number | null;
  /** Rename and retype: the role follows the type on the server when it is not given. */
  role?: string;
  referenceAccountId?: string | null;
}

/** The owner's account order: ids in the new order, one audit group (undoable). */
export const orderAccounts = (ids: string[]) =>
  request<{ accounts: AccountRow[] } & WriteResult>('PATCH', '/api/accounts/order', { ids });

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

export const fetchBookings = (filter: BookingFilter, cursor?: string, limit = 50, nativeSummary = false) =>
  request<BookingPage>(
    'GET',
    `/api/bookings${queryString({ ...filterParams(filter), cursor, limit, ...(nativeSummary ? { nativeSummary: '1' } : {}) })}`,
  );

export const fetchLookups = (bookingId?: string) =>
  request<Lookups>('GET', `/api/lookups${queryString({ bookingId })}`);
export const fetchPayees = () => request<{ payees: PayeeRow[] }>('GET', '/api/payees');
export const createPayee = (name: string, defaultCategoryId?: string | null) =>
  request<{ payee: PayeeRow } & WriteResult>('POST', '/api/payees', {
    name,
    ...(defaultCategoryId ? { defaultCategoryId } : {}),
  });
/** A new contact (person), e.g. from "+ Neuer Kontakt…" in the booking dialog. */
export const createContact = (name: string) =>
  request<{ contact: { id: string; name: string } } & WriteResult>('POST', '/api/contacts', {
    name,
  });
export const setPayeeDefaultCategory = (id: string, defaultCategoryId: string | null) =>
  request<{ payee: PayeeRow } & WriteResult>('PATCH', `/api/payees/${encodeURIComponent(id)}`, {
    defaultCategoryId,
  });

export interface SplitInput {
  categoryId: string | null;
  amountCents: number;
  memo?: string | null;
  /** Kept on edits: the server stores a missing field as null. */
  contactId?: string | null;
  incomeTypeId?: string | null;
  /** Creating only: this line moves the money to another account (a transfer leg). */
  transferAccountId?: string | null;
}

export type BookingCreate =
  | {
      type: 'booking';
      repeat?: Rhythm;
      incomeNextMonth?: boolean;
      accountId: string;
      date: string;
      amountCents: number;
      payeeId?: string | null;
      payeeName?: string;
      memo?: string | null;
      status?: 'pending' | 'confirmed';
      flag?: BookingFlag | null;
      projectId?: string | null;
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
      projectId?: string | null;
      bankStatus?: 'pending' | 'confirmed';
    };

export interface BookingPatch {
  repeat?: Rhythm;
  incomeNextMonth?: boolean;
  accountId?: string;
  date?: string;
  amountCents?: number;
  payeeId?: string | null;
  memo?: string | null;
  status?: 'pending' | 'confirmed';
  flag?: BookingFlag | null;
  projectId?: string | null;
  splits?: SplitInput[];
  unlockReconciled?: boolean;
}

export const createBooking = (input: BookingCreate, key?: string) =>
  request<{ bookings: ListedBooking[] } & WriteResult>(
    'POST',
    '/api/bookings',
    input,
    key ? { 'Idempotency-Key': key } : undefined,
  );

export const patchBooking = (id: string, patch: BookingPatch, key?: string) =>
  request<{ bookings: ListedBooking[] } & WriteResult>(
    'PATCH',
    `/api/bookings/${encodeURIComponent(id)}`,
    patch,
    key ? { 'Idempotency-Key': key } : undefined,
  );

export const deleteBooking = (id: string, unlock = false, previewRevision?: string) =>
  request<WriteResult>(
    'DELETE',
    `/api/bookings/${encodeURIComponent(id)}${queryString({ unlock: unlock ? '1' : undefined, previewRevision })}`,
  );

/** Why the server left a booking out of a bulk action. */
export type BulkSkipReason =
  'not_found' | 'reconciled_locked' | 'split' | 'transfer' | 'transfer_pair' | 'invalid' | 'unchanged' |
  'linked_transfer' | 'linked_contact' | 'linked_expected' | 'linked_trade' | 'linked_payroll' |
  'linked_statement' | 'linked_document' | 'linked_bank' | 'source_effect';
export interface BulkSelectionItem {
  id: string; date: string; description: string; accountId: string; accountName: string;
  amountCents: number | null; currency: string; projectId: string | null; reason: BulkSkipReason | null;
}
export interface BulkSelection {
  selectedCount: number; items: BulkSelectionItem[]; missingIds: string[];
  totals: { currency: string; count: number; cents: number | null; unavailable: 'unsafe_total' | null }[];
}
export const readBulkSelection = (ids: string[]) => request<BulkSelection>('POST', '/api/bookings/selection', { ids });

export interface BulkResult extends WriteResult {
  changed: string[];
  skipped: { id: string; reason: BulkSkipReason; message: string; booking?: BulkSelectionItem }[];
  /** Transfers with both legs in the selection (one Umbuchung each). */
  transferPairs: number;
}

export const bulkUpdateBookings = (
  ids: string[],
  set: { categoryId?: string | null; flag?: BookingFlag | null; status?: 'pending' | 'confirmed'; projectId?: string | null },
) => request<BulkResult>('POST', '/api/bookings/bulk', { action: 'update', ids, set });

export interface BookingDeletePreview {
  mode: 'bulk' | 'single'; ids: string[]; affectedIds: string[]; selection: BulkSelection;
  eligibleIds: string[]; skipped: { id: string; reason: BulkSkipReason; booking?: BulkSelectionItem }[];
  eligibleTotals: BulkSelection['totals']; revision: string; protected: boolean;
  requiresUnlock: boolean; blocked: 'not_found' | 'invalid' | 'protected_link' | null; expectedLinkCount: number;
}
export const readBookingDeletePreview = (ids: string[], mode: 'bulk' | 'single' = 'bulk') =>
  request<BookingDeletePreview>('POST', '/api/bookings/delete-preview', { ids, mode });
export const bulkDeleteBookings = (ids: string[], previewRevision: string) =>
  request<BulkResult>('POST', '/api/bookings/bulk', { action: 'delete', ids, previewRevision });

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
  adjustDate?: string;
  categoryId?: string;
  /** Allow the adjustment inside an already checked period. */
  unlockReconciled?: boolean;
}

export const reconcileAccount = (accountId: string, input: ReconcileRequest) =>
  request<{ result: ReconcileResult; account: AccountRow }>(
    'POST',
    `/api/accounts/${encodeURIComponent(accountId)}/reconciliation`,
    input,
  );

/** Complete filtered history export; the caller owns cancellation and stale-filter rejection. */
export async function downloadBookingsCsv(filter: BookingFilter, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(`/api/bookings/csv${queryString(filterParams(filter))}`, {
    credentials: 'same-origin', signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
    throw new ApiError(response.status, payload.error ?? 'csv_unavailable', payload.message);
  }
  const length = Number(response.headers.get('Content-Length'));
  if (!/^text\/csv(?:;|$)/i.test(response.headers.get('Content-Type') ?? '') ||
    !/^attachment; filename="budget-bookings-\d{4}-\d{2}-\d{2}\.csv"$/.test(response.headers.get('Content-Disposition') ?? '') ||
    !Number.isSafeInteger(length) || length < 3 || length > 64 * 1024 * 1024 || !response.body) {
    await response.body?.cancel();
    throw new ApiError(422, 'csv_unavailable', 'Der Export ist nicht vollständig verfügbar.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (signal.aborted || size > length) throw new ApiError(422, 'csv_unavailable', 'Der Export wurde abgebrochen.');
      chunks.push(new Uint8Array(next.value));
    }
    if (signal.aborted || size !== length) throw new ApiError(422, 'csv_unavailable', 'Der Export ist unvollständig.');
    return new Blob(chunks, { type: 'text/csv;charset=utf-8' });
  } finally {
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}

export type ProtectedBulkSet = { date: string } | { memo: string | null } | { payeeId: string | null };
export interface BookingBulkEditPreview {
  ids: string[]; set: ProtectedBulkSet; selection: BulkSelection;
  rows: { id: string; before: string | null; after: string | null; reason: BulkSkipReason | null; unchanged: boolean }[];
  eligibleIds: string[]; revision: string;
}
export const readBookingBulkEditPreview = (ids: string[], set: ProtectedBulkSet) =>
  request<BookingBulkEditPreview>('POST', '/api/bookings/bulk-preview', { ids, set });
export const applyBookingBulkEdit = (ids: string[], set: ProtectedBulkSet, previewRevision: string) =>
  request<BulkResult>('POST', '/api/bookings/bulk-apply', { ids, set, previewRevision });
