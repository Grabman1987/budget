// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  deletePasskey,
  fetchAuthStatus,
  loginVerify,
  recoveryLogin,
  registerOptions,
} from './api';

const respond = (status: number, body?: unknown) =>
  vi.fn().mockImplementation(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('auth api client', () => {
  it('reads the status with same-origin credentials and no body', async () => {
    const status = {
      setupRequired: false,
      authenticated: true,
      stepUpValidUntil: null,
      viaRecovery: false,
    };
    const fetchMock = respond(200, status);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAuthStatus()).resolves.toEqual(status);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/status', {
      method: 'GET',
      credentials: 'same-origin',
    });
  });

  it('posts JSON with the content-type header', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await recoveryLogin('abcd-efgh');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/recovery/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'abcd-efgh' }),
    });
  });

  it('sends the setup token only when given', async () => {
    const fetchMock = respond(200, { options: {} });
    vi.stubGlobal('fetch', fetchMock);
    await registerOptions();
    await registerOptions('token-1');
    const bodies = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).body);
    expect(bodies).toEqual(['{}', JSON.stringify({ setupToken: 'token-1' })]);
  });

  it('wraps the assertion response in a `response` field', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const response = { id: 'x' } as never;
    await loginVerify(response);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBe(JSON.stringify({ response }));
  });

  it('maps error bodies to ApiError with status and code', async () => {
    vi.stubGlobal('fetch', respond(403, { error: 'step_up_required' }));
    const error = await deletePasskey('a/b').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'step_up_required' });
  });

  it('escapes the passkey id in the path and uses DELETE', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await deletePasskey('a/b');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/passkeys/a%2Fb');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
  });

  it('uses code "unknown" for error responses without a JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));
    await expect(fetchAuthStatus()).rejects.toMatchObject({ status: 502, code: 'unknown' });
  });

  it('reports an unreachable server as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchAuthStatus()).rejects.toMatchObject({ status: 0, code: 'network' });
  });
  it('retains uncertain delivery when a successful HTTP response is truncated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{', { status: 201 })));
    await expect(recoveryLogin('synthetic-code')).rejects.toMatchObject({
      status: 0,
      code: 'network',
    });
  });
});
