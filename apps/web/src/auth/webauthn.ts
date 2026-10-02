import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import {
  ApiError,
  loginOptions,
  loginVerify,
  registerOptions,
  registerVerify,
  stepUpOptions,
  stepUpVerify,
} from './api';

/** The browser has no WebAuthn support. */
export class PasskeyUnsupportedError extends Error {
  constructor() {
    super('WebAuthn is not supported');
    this.name = 'PasskeyUnsupportedError';
  }
}

function assertSupported() {
  if (!browserSupportsWebAuthn()) throw new PasskeyUnsupportedError();
}

/** Signs in with a discoverable passkey (usernameless). The server sets the session cookie. */
export async function authenticateWithPasskey(): Promise<void> {
  assertSupported();
  const { options } = await loginOptions();
  const response = await startAuthentication({ optionsJSON: options });
  await loginVerify(response);
}

/** Fresh confirmation with a passkey for sensitive actions. Returns the end of the step-up window. */
export async function stepUp(): Promise<string> {
  assertSupported();
  const { options } = await stepUpOptions();
  const response = await startAuthentication({ optionsJSON: options });
  const { stepUpValidUntil } = await stepUpVerify(response);
  return stepUpValidUntil;
}

export interface RegisterInput {
  deviceName: string;
  /** One-time setup token; only for the very first passkey. */
  setupToken?: string;
}

/** Creates a passkey. Recovery codes come back only for the very first one. */
export async function registerPasskey({
  deviceName,
  setupToken,
}: RegisterInput): Promise<{ passkeyId: string; recoveryCodes?: string[] }> {
  assertSupported();
  const { options } = await registerOptions(setupToken);
  const response = await startRegistration({ optionsJSON: options });
  return registerVerify(response, deviceName.trim());
}

/**
 * Runs a call that needs a fresh step-up. If the server answers `step_up_required`, the step-up
 * ceremony runs and the call is retried exactly once.
 */
export async function withStepUp<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'step_up_required') throw error;
    await stepUp();
    return call();
  }
}

export type AuthContext = 'login' | 'recovery' | 'setup' | 'general';

export const RATE_LIMITED_MESSAGE = 'Zu viele Versuche. Bitte später erneut versuchen.';

/** German message for anything that can go wrong in an auth flow. */
export function authErrorMessage(error: unknown, context: AuthContext = 'general'): string {
  if (error instanceof PasskeyUnsupportedError) {
    return 'Dieser Browser unterstützt keine Passkeys. Bitte einen aktuellen Browser verwenden.';
  }
  if (error instanceof ApiError) {
    if (error.status === 429 || error.code === 'rate_limited') return RATE_LIMITED_MESSAGE;
    switch (error.code) {
      case 'network':
        return 'Keine Verbindung zum Server. Bitte später erneut versuchen.';
      case 'setup_token_invalid':
        return 'Der Einrichtungscode ist ungültig.';
      case 'login_failed':
        return context === 'recovery'
          ? 'Der Wiederherstellungscode ist ungültig oder wurde bereits verwendet.'
          : 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
      case 'unauthorized':
        return 'Die Sitzung ist abgelaufen. Bitte erneut anmelden.';
      case 'step_up_required':
        return 'Bitte zuerst mit dem Passkey bestätigen.';
      case 'passkey_required':
        return 'Mit einem Wiederherstellungscode ist das nicht möglich. Bitte zuerst einen neuen Passkey anlegen und damit anmelden.';
      case 'last_passkey':
        return 'Der letzte Passkey kann nicht entfernt werden. Sonst wäre kein Zugang mehr möglich.';
      default:
        return 'Etwas ist schiefgelaufen. Bitte erneut versuchen.';
    }
  }
  if (error instanceof Error) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'AbortError':
        return 'Vorgang abgebrochen oder Zeit abgelaufen.';
      case 'InvalidStateError':
        return 'Auf diesem Gerät gibt es bereits einen Passkey für Budget.';
      case 'NotSupportedError':
      case 'SecurityError':
        return 'Dieses Gerät oder diese Adresse kann keine Passkeys verwenden.';
    }
  }
  return 'Etwas ist schiefgelaufen. Bitte erneut versuchen.';
}
