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

/** JSON request against the same origin; every failure becomes an `ApiError`. */
export async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
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
    throw new ApiError(0, 'network');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new ApiError(0, 'network');
    payload = undefined;
  }
  if (!response.ok) {
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
