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

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** JSON request against the same origin; every failure becomes an `ApiError`. */
export async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      ...(method === 'GET'
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
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
