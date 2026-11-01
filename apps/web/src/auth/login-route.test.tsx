import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginRoute } from './login-route';

const mocks = vi.hoisted(() => ({
  search: {} as { weiter?: unknown },
  navigate: vi.fn(),
  refresh: vi.fn(),
  assign: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search,
}));
vi.mock('./status-query', () => ({ refreshAuthStatus: mocks.refresh }));
vi.mock('./login-page', () => ({ LoginPage: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.search = {};
  vi.stubGlobal('window', { location: { assign: mocks.assign } });
});
afterEach(() => vi.unstubAllGlobals());

describe('LoginRoute navigation sink with raw search', () => {
  it.each(
    [
      undefined,
      'https://example.invalid/erfassen',
      '//example.invalid/erfassen',
      'javascript:alert(1)',
      '/konten',
      ['/erfassen'],
      `/erfassen?empfaenger=${'x'.repeat(1500)}`,
    ].map((weiter) => [weiter]),
  )('returns to root for invalid continuation %j', async (weiter) => {
    mocks.search = { weiter };
    await LoginRoute().props.onAuthenticated();
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: '/' });
  });

  it('waits for auth refresh and assigns only the normalized capture continuation', async () => {
    let finishRefresh!: () => void;
    mocks.refresh.mockReturnValue(new Promise<void>((resolve) => (finishRefresh = resolve)));
    mocks.search = {
      weiter:
        '/erfassen?betrag=-12.50&empfaenger=Beispiel&konto=cash&kategorie=food&extra=ignored#raw',
    };
    const authenticated = LoginRoute().props.onAuthenticated();
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    finishRefresh();
    await authenticated;
    expect(mocks.assign).toHaveBeenCalledExactlyOnceWith(
      '/erfassen?betrag=-12%2C50&empfaenger=Beispiel&kategorie=food&konto=cash',
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when auth refresh rejects', async () => {
    mocks.search = { weiter: '/erfassen' };
    mocks.refresh.mockRejectedValue(new Error('synthetic refresh failure'));
    await expect(LoginRoute().props.onAuthenticated()).rejects.toThrow('synthetic refresh failure');
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
