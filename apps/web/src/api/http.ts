import {
  claimedReceiptUpload,
  prepareReceiptQueueRecovery,
  recoverReceiptQueueAfterConfirmedAction,
  receiptQueueTokenCurrent,
  type ReceiptQueueToken,
} from '../pwa/receipt-queue-store';

import {
  allowReadSnapshotWrites,
  beginReadSnapshot,
  clearReadSnapshots,
  completeSnapshotLogout,
  isOfflineViewer,
  networkUnavailable,
  snapshotAuthorizationToken,
  setNetworkUnavailable,
  type SnapshotToken,
} from '../pwa/read-snapshot-store';

/** Error of an API call: HTTP status plus the machine-readable `error` code of the body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Human-readable text of the server (German), when it sent one. */
  readonly detail: string | undefined;
  /** Booking ids named by the server (`reconciled_locked`). */
  readonly bookingIds: string[];

  constructor(status: number, code: string, detail?: string, bookingIds: string[] = []) {
    super(`API ${status}: ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.bookingIds = bookingIds;
  }
}

/**
 * Retry rule of the app's queries: only a lost connection is worth a retry (twice at most). A
 * server answer, even an error like 503, is final: retrying a slow failing valuation would keep
 * the page on its loading note for many seconds before the error shows.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return error instanceof ApiError && error.status === 0 && failureCount < 2;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Whoever caches reads (the query client) hears about every successful write, so that no cached
 * page outlives a change, whatever the caller remembers to invalidate by name.
 */
const writeListeners = new Set<() => void>();
export function onApiWrite(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}
export function notifyApiWrite(): void {
  for (const listener of writeListeners) listener();
}

export interface ApiRead {
  path: string;
  data: unknown;
  fetchedAt: number;
  token: Promise<SnapshotToken | undefined>;
}
const readListeners = new Set<(read: ApiRead) => void>();
export function onApiRead(listener: (read: ApiRead) => void): () => void {
  readListeners.add(listener);
  return () => readListeners.delete(listener);
}
const snapshotRead = (path: string) =>
  /^\/api\/(?:heute(?:\?|$)|accounts$|portfolio\/positions$|budget\/(?:\d{4}-\d{2}|months)(?:\?|$)|bookings(?:\?|$))/.test(
    path,
  );
const AUTH_RECONNECT = new Set([
  '/api/auth/login/options',
  '/api/auth/login/verify',
  '/api/auth/recovery/login',
  '/api/auth/register/options',
  '/api/auth/register/verify',
  '/api/auth/step-up/options',
  '/api/auth/step-up/verify',
  '/api/auth/logout',
]);

/** JSON request against the same origin; every failure becomes an `ApiError`. */
export async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const savedView = isOfflineViewer();
  // The existing capture queue persists first and replays idempotently when online. Its replay
  // remains possible while the user is looking at a read-only copy; no other write is permitted.
  const queuedReplay =
    !offline &&
    method === 'POST' &&
    path === '/api/bookings' &&
    Object.entries(headers ?? {}).some(
      ([key, value]) => key.toLowerCase() === 'idempotency-key' && value.length > 0,
    );
  // A lost status GET must not strand an online sign-in, recovery or sign-out ceremony. This
  // exception never applies inside a saved view, nor to passkey/recovery/session administration.
  const authReconnect = !offline && !savedView && method === 'POST' && AUTH_RECONNECT.has(path);
  if (
    method !== 'GET' &&
    (offline || savedView || networkUnavailable()) &&
    !queuedReplay &&
    !authReconnect
  )
    throw new ApiError(0, 'offline_readonly');
  const receiptAction = method === 'POST' ? ({
    '/api/auth/login/verify': 'new-login',
    '/api/auth/recovery/login': 'new-recovery',
  } as const)[path as '/api/auth/login/verify' | '/api/auth/recovery/login'] : undefined;
  const receiptRecovery = receiptAction
    ? await prepareReceiptQueueRecovery().catch(() => undefined)
    : undefined;
  const started =
    method === 'GET' && path === '/api/auth/status' ? snapshotAuthorizationToken() : undefined;
  const token = method === 'GET' && snapshotRead(path) ? beginReadSnapshot() : undefined;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      ...(method === 'GET'
        ? {}
        : {
            headers: { 'content-type': 'application/json', ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
    });
  } catch {
    // The server is unreachable; status 0 marks "no response at all".
    setNetworkUnavailable(true);
    throw new ApiError(0, 'network');
  }
  setNetworkUnavailable(false);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new ApiError(0, 'network');
    payload = undefined;
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) void clearReadSnapshots();
    const fields =
      typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
    const ids = Array.isArray(fields['bookingIds'])
      ? fields['bookingIds'].filter((v): v is string => typeof v === 'string')
      : [];
    throw new ApiError(
      response.status,
      'error' in fields ? String(fields['error']) : 'unknown',
      typeof fields['message'] === 'string' ? fields['message'] : undefined,
      ids,
    );
  }
  if (receiptAction && receiptRecovery) {
    // A failed optional queue repair must never turn a successful login into an auth failure.
    await recoverReceiptQueueAfterConfirmedAction(receiptAction, receiptRecovery).catch(() => undefined);
  }
  if (method === 'GET' && path === '/api/auth/status') {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'authenticated' in payload &&
      payload.authenticated === true
    )
      allowReadSnapshotWrites(started);
    else {
      completeSnapshotLogout();
      void clearReadSnapshots();
    }
  }
  if (
    method === 'POST' &&
    ['/api/auth/logout', '/api/auth/login/verify', '/api/auth/recovery/login'].includes(path)
  ) {
    completeSnapshotLogout();
    void clearReadSnapshots();
  }
  if (token) {
    // A query consumer may optimistically mutate its result later. Provenance must retain the
    // actual completed response, rather than sharing that mutable query-cache object.
    const read = { path, data: structuredClone(payload), fetchedAt: Date.now(), token };
    for (const listener of readListeners) listener(read);
  }
  if (method !== 'GET') notifyApiWrite();
  return payload as T;
}

/** Query string from defined values only (`undefined` and empty strings are left out). */
export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
export interface ReceiptUploadAcknowledgment {
  receipt: { id: string };
  groupId: string;
}

/**
 * Exact online queued-capture capability, including while viewing a saved read-only snapshot.
 * It accepts only a claimed native intent; callers cannot select a URL, method or replacement
 * payload. Existing JSON/auth/read guards remain separate and the server authorizes every POST.
 */
export async function queuedReceiptUpload(
  token: ReceiptQueueToken,
  id: string,
): Promise<ReceiptUploadAcknowledgment> {
  const item = await claimedReceiptUpload(token, id);
  if (!item || item.id !== id || !/^[a-zA-Z0-9-]{16,80}$/.test(id))
    throw new ApiError(0, 'queued_receipt_not_ready');
  const body = new FormData();
  body.set('file', item.blob, item.filename);
  body.set('uploadIntent', item.id);
  if (item.bookingId !== undefined) body.set('bookingId', item.bookingId);
  if (navigator.onLine === false || !receiptQueueTokenCurrent(token))
    throw new ApiError(0, 'offline_readonly');
  let response: Response;
  try {
    response = await fetch('/api/receipts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Idempotency-Key': item.id },
      body,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    // Never forward server details, filenames or unbounded diagnostic strings into queue state.
    const code =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      payload.error === 'idempotency_conflict'
        ? 'idempotency_conflict'
        : 'receipt_rejected';
    throw new ApiError(response.status, code);
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    response.status !== 201 ||
    typeof payload !== 'object' ||
    payload === null ||
    !('groupId' in payload) ||
    typeof payload.groupId !== 'string' ||
    !uuid.test(payload.groupId) ||
    !('receipt' in payload) ||
    typeof payload.receipt !== 'object' ||
    payload.receipt === null ||
    !('id' in payload.receipt) ||
    typeof payload.receipt.id !== 'string' ||
    !uuid.test(payload.receipt.id)
  )
    throw new ApiError(0, 'invalid_receipt_ack');
  return { receipt: { id: payload.receipt.id }, groupId: payload.groupId };
}
