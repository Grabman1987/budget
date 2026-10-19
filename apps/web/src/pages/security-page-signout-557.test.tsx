// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SecurityPanel } from './security-page';

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));
const clearDeviceFinancialData = vi.hoisted(() => vi.fn());
vi.mock('../pwa/local-data', () => ({ clearDeviceFinancialData }));

const LIST = {
  passkeys: [
    {
      id: 'a',
      deviceName: 'Laptop',
      createdAt: '2026-09-01T10:00:00Z',
      lastUsedAt: null,
      current: true,
    },
  ],
  recoveryCodesRemaining: 8,
  otherSessions: 0,
};

function stub(logoutStatus: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${path}`;
      if (key === 'GET /api/auth/passkeys') return new Response(JSON.stringify(LIST));
      if (key === 'POST /api/auth/logout')
        return new Response(JSON.stringify(logoutStatus === 200 ? { ok: true } : { error: 'x' }), {
          status: logoutStatus,
        });
      return new Response('{}', { status: 404 });
    }),
  );
}
function renderPanel() {
  const onLoggedOut = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <SecurityPanel onLoggedOut={onLoggedOut} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return onLoggedOut;
}

beforeEach(() => clearDeviceFinancialData.mockReset().mockResolvedValue(undefined));
afterEach(() => vi.unstubAllGlobals());

it('clears device data after a successful sign-out and hands over', async () => {
  stub(200);
  const onLoggedOut = renderPanel();
  await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
  await waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1));
  expect(clearDeviceFinancialData).toHaveBeenCalledTimes(1);
});

it('still clears device data when the server logout fails, and shows the error', async () => {
  stub(500);
  const onLoggedOut = renderPanel();
  await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(clearDeviceFinancialData).toHaveBeenCalledTimes(1);
  expect(onLoggedOut).not.toHaveBeenCalled();
});
