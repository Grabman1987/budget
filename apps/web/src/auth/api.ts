import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { ApiError, request } from '../api/http';

export { ApiError };

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
