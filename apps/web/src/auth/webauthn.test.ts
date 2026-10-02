// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { guessDeviceName } from './device-name';
import {
  authErrorMessage,
  PasskeyUnsupportedError,
  RATE_LIMITED_MESSAGE,
  withStepUp,
} from './webauthn';

const cancelled = () =>
  Object.assign(new Error('The operation was aborted'), { name: 'NotAllowedError' });

describe('authErrorMessage', () => {
  it('maps a cancelled ceremony', () => {
    expect(authErrorMessage(cancelled())).toBe('Vorgang abgebrochen oder Zeit abgelaufen.');
  });
  it('maps missing browser support', () => {
    expect(authErrorMessage(new PasskeyUnsupportedError())).toMatch(/keine Passkeys/);
  });
  it('maps rate limiting by status and by code', () => {
    expect(authErrorMessage(new ApiError(429, 'rate_limited'))).toBe(RATE_LIMITED_MESSAGE);
    expect(authErrorMessage(new ApiError(429, 'x'))).toBe(RATE_LIMITED_MESSAGE);
  });
  it('points a recovery session to a new passkey when a passkey is required', () => {
    expect(authErrorMessage(new ApiError(403, 'passkey_required'))).toMatch(
      /neuen Passkey anlegen/,
    );
  });
  it('words login_failed differently for recovery codes', () => {
    const error = new ApiError(401, 'login_failed');
    expect(authErrorMessage(error, 'login')).toMatch(/Anmeldung fehlgeschlagen/);
    expect(authErrorMessage(error, 'recovery')).toMatch(/Wiederherstellungscode/);
  });
  it('maps last_passkey and setup_token_invalid', () => {
    expect(authErrorMessage(new ApiError(409, 'last_passkey'))).toMatch(/letzte Passkey/);
    expect(authErrorMessage(new ApiError(401, 'setup_token_invalid'))).toMatch(/Einrichtungscode/);
  });
});

describe('withStepUp', () => {
  it('passes other errors through without a ceremony', async () => {
    const call = vi.fn().mockRejectedValue(new ApiError(409, 'last_passkey'));
    await expect(withStepUp(call)).rejects.toMatchObject({ code: 'last_passkey' });
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('guessDeviceName', () => {
  it('recognises common platforms and falls back', () => {
    expect(guessDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(
      'iPhone',
    );
    expect(guessDeviceName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux-PC');
    expect(guessDeviceName('curl/8')).toBe('Dieses Gerät');
  });
});
