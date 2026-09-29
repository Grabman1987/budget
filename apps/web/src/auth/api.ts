import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

/** Error of an API call: HTTP status plus the machine-readable `error` code of the body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`API ${status}: ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
  stepUpValidUntil: string | null;
  viaRecovery: boolean;
}

export interface PasskeyInfo {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
}

export interface PasskeyList {
  passkeys: PasskeyInfo[];
  recoveryCodesRemaining: number;
  /** Active sessions besides the calling one (other browsers, recovery-code logins). */
  otherSessions: number;
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) {
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
    const code =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : 'unknown';
    throw new ApiError(response.status, code);
  }
  return payload as T;
}

const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);

export const fetchAuthStatus = () => request<AuthStatus>('GET', '/api/auth/status');

export const registerOptions = (setupToken?: string) =>
  post<{ options: PublicKeyCredentialCreationOptionsJSON }>(
    '/api/auth/register/options',
    setupToken === undefined ? {} : { setupToken },
  );

export const registerVerify = (response: RegistrationResponseJSON, deviceName: string) =>
  post<{ passkeyId: string; recoveryCodes?: string[] }>('/api/auth/register/verify', {
    response,
    deviceName,
  });

export const loginOptions = () =>
  post<{ options: PublicKeyCredentialRequestOptionsJSON }>('/api/auth/login/options');

export const loginVerify = (response: AuthenticationResponseJSON) =>
  post<{ ok: true }>('/api/auth/login/verify', { response });

export const stepUpOptions = () =>
  post<{ options: PublicKeyCredentialRequestOptionsJSON }>('/api/auth/step-up/options');

export const stepUpVerify = (response: AuthenticationResponseJSON) =>
  post<{ stepUpValidUntil: string }>('/api/auth/step-up/verify', { response });

export const recoveryLogin = (code: string) =>
  post<{ ok: true }>('/api/auth/recovery/login', { code });

export const regenerateRecoveryCodes = () =>
  post<{ recoveryCodes: string[] }>('/api/auth/recovery/regenerate');

export const fetchPasskeys = () => request<PasskeyList>('GET', '/api/auth/passkeys');

export const deletePasskey = (id: string) =>
  request<{ ok: true }>('DELETE', `/api/auth/passkeys/${encodeURIComponent(id)}`);

export const logout = () => post<{ ok: true }>('/api/auth/logout');

export const revokeOtherSessions = () =>
  post<{ ended: number }>('/api/auth/sessions/revoke-others');
