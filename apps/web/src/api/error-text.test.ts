import { describe, expect, it } from 'vitest';
import { errorText } from '../ledger/labels';
import { ApiError, shouldRetry } from './http';
import { apiErrorText, isUserText, userText } from './error-text';

describe('German error text', () => {
  it('lets German server messages through and holds back English or technical ones', () => {
    expect(isUserText('Der Stichtag liegt in der Zukunft.')).toBe(true);
    expect(isUserText('Für EUR fehlt bis einschließlich 2026-02-28 ein Wechselkurs.')).toBe(true);
    expect(isUserText('The request is not valid')).toBe(false);
    expect(isUserText('Something went wrong')).toBe(false);
    expect(
      isUserText('No price for 09f15a7c-1d2e-4a5b-8c9d-0e1f2a3b4c5d on or before 2026-01-06'),
    ).toBe(false);
    // A German sentence with an id is still technical.
    expect(isUserText('Konto 09f15a7c-1d2e-4a5b-8c9d-0e1f2a3b4c5d nicht gefunden.')).toBe(false);
  });

  it('maps an answer by its code when the message is generic', () => {
    expect(apiErrorText({ status: 400, code: 'invalid', detail: 'The request is not valid' })).toBe(
      'Die Eingabe ist ungültig.',
    );
    expect(
      apiErrorText({ status: 500, code: 'server_error', detail: 'Something went wrong' }),
    ).toBe('Auf dem Server ist ein Fehler aufgetreten. Versuch es später noch einmal.');
    expect(apiErrorText({ status: 502, code: 'unknown' })).toMatch(/Server/);
    expect(apiErrorText({ status: 0, code: 'network' })).toBe('Keine Verbindung zum Server.');
    expect(apiErrorText({ status: 422, code: 'invalid_profile', detail: 'Ungültiger Wert.' })).toBe(
      'Ungültiger Wert.',
    );
    expect(apiErrorText({ status: 418, code: 'teapot' })).toBeUndefined();
  });

  it('errorText never shows the raw English text of an ApiError', () => {
    const english = new ApiError(400, 'invalid', 'The request is not valid');
    expect(errorText(english)).toBe('Die Eingabe ist ungültig.');
    const german = new ApiError(409, 'conflict', 'Das Konto ist bereits geschlossen.');
    expect(errorText(german)).toBe('Das Konto ist bereits geschlossen.');
    expect(errorText(new ApiError(0, 'network'))).toBe('Keine Verbindung zum Server.');
    expect(errorText(new Error('boom'), 'Fallback')).toBe('Fallback');
  });

  it('userText keeps German messages and replaces the rest by the fallback', () => {
    expect(userText('Für ein Wertpapier fehlt bis einschließlich 2026-02-28 ein Kurs.', 'x')).toBe(
      'Für ein Wertpapier fehlt bis einschließlich 2026-02-28 ein Kurs.',
    );
    expect(
      userText('No price for 09f15a7c-1d2e-4a5b-8c9d-0e1f2a3b4c5d', 'Es fehlt ein Kurs.'),
    ).toBe('Es fehlt ein Kurs.');
    expect(userText(null, 'Es fehlt ein Kurs.')).toBe('Es fehlt ein Kurs.');
  });

  it('retries only a lost connection, never a server answer', () => {
    expect(shouldRetry(0, new ApiError(0, 'network'))).toBe(true);
    expect(shouldRetry(2, new ApiError(0, 'network'))).toBe(false);
    expect(shouldRetry(0, new ApiError(503, 'valuation_unavailable'))).toBe(false);
    expect(shouldRetry(0, new Error('boom'))).toBe(false);
  });
});
