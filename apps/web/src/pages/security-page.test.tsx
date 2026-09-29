// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityPanel } from './security-page';

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startAuthentication: vi.fn().mockResolvedValue({ id: 'assertion' }),
  startRegistration: vi.fn().mockResolvedValue({ id: 'attestation' }),
}));

interface Route {
  status: number;
  body: unknown;
}

/** Answers API calls per "METHOD path"; a route may be a list that is consumed call by call. */
function stubApi(routes: Record<string, Route | Route[]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${path}`;
      calls.push(key);
      const entry = routes[key];
      const route = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry;
      if (!route) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      return new Response(JSON.stringify(route.body), { status: route.status });
    }),
  );
  return calls;
}

const LIST: Route = {
  status: 200,
  body: {
    passkeys: [
      {
        id: 'a',
        deviceName: 'Laptop',
        createdAt: '2026-09-01T10:00:00Z',
        lastUsedAt: '2026-09-20T10:00:00Z',
        current: true,
      },
      {
        id: 'b',
        deviceName: 'Telefon',
        createdAt: '2026-09-02T10:00:00Z',
        lastUsedAt: null,
        current: false,
      },
    ],
    recoveryCodesRemaining: 8,
  },
};

function renderPanel(onLoggedOut = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SecurityPanel onLoggedOut={onLoggedOut} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return onLoggedOut;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('SecurityPanel', () => {
  it('lists passkeys with the current device marked and the remaining recovery codes', async () => {
    stubApi({ 'GET /api/auth/passkeys': LIST });
    renderPanel();
    const rows = await screen.findAllByRole('listitem');
    expect(within(rows[0]!).getByText('dieses Gerät')).toBeTruthy();
    expect(within(rows[1]!).getByText(/noch nie/)).toBeTruthy();
    expect(screen.getByText('8 von 10 Codes noch gültig.')).toBeTruthy();
  });

  it('runs the step-up ceremony and retries once when adding a passkey', async () => {
    const calls = stubApi({
      'GET /api/auth/passkeys': LIST,
      'POST /api/auth/register/options': [
        { status: 403, body: { error: 'step_up_required' } },
        { status: 200, body: { options: {} } },
      ],
      'POST /api/auth/step-up/options': { status: 200, body: { options: {} } },
      'POST /api/auth/step-up/verify': {
        status: 200,
        body: { stepUpValidUntil: '2026-09-29T12:00:00Z' },
      },
      'POST /api/auth/register/verify': { status: 200, body: { passkeyId: 'c' } },
    });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Passkey hinzufügen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Passkey anlegen' }));
    await waitFor(() => expect(calls).toContain('POST /api/auth/register/verify'));
    expect(calls.filter((c) => c === 'POST /api/auth/register/options')).toHaveLength(2);
    expect(calls).toContain('POST /api/auth/step-up/verify');
  });

  it('confirms before revoking and explains a refused revocation of the last passkey', async () => {
    stubApi({
      'GET /api/auth/passkeys': LIST,
      'DELETE /api/auth/passkeys/b': { status: 409, body: { error: 'last_passkey' } },
    });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Passkey Telefon entfernen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Endgültig entfernen' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/letzte Passkey/);
  });

  it('shows regenerated codes once, gated by the checkbox', async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `NEW-${i}`);
    stubApi({
      'GET /api/auth/passkeys': LIST,
      'POST /api/auth/recovery/regenerate': { status: 200, body: { recoveryCodes: codes } },
    });
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Wiederherstellungscodes neu erzeugen' }),
    );
    const list = await screen.findByRole('list', { name: 'Wiederherstellungscodes' });
    expect(list.querySelectorAll('li')).toHaveLength(10);
    const done = screen.getByRole('button', { name: 'Fertig' }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    await userEvent.click(screen.getByLabelText('Ich habe die Codes sicher gespeichert'));
    await userEvent.click(done);
    expect(screen.queryByRole('list', { name: 'Wiederherstellungscodes' })).toBeNull();
  });

  it('signs out and hands over to the caller', async () => {
    stubApi({
      'GET /api/auth/passkeys': LIST,
      'POST /api/auth/logout': { status: 200, body: { ok: true } },
    });
    const onLoggedOut = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1));
  });
});
