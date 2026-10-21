// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { SecurityPanel } from './security-page';

const mocks = vi.hoisted(() => ({
  hold: vi.fn(),
  clear: vi.fn(),
  release: vi.fn(),
  logout: vi.fn(),
  generalClear: vi.fn(),
}));
vi.mock('../pwa/receipt-queue-store', () => ({ holdReceiptQueueForSignOut: mocks.hold }));
vi.mock('../pwa/local-data', () => ({ clearDeviceFinancialData: mocks.generalClear }));
vi.mock('../auth/api', async () => ({
  ...(await vi.importActual<typeof import('../auth/api')>('../auth/api')),
  logout: mocks.logout,
  fetchPasskeys: async () => ({ passkeys: [], recoveryCodesRemaining: 10, otherSessions: 0 }),
}));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount() {
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hold.mockReturnValue({ clear: mocks.clear, release: mocks.release });
  mocks.clear.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
  mocks.logout.mockResolvedValue(undefined);
  mocks.generalClear.mockResolvedValue(undefined);
});
it('starts the native privacy hold and erase before unresolved logout HTTP, releasing only after both settle', async () => {
  const http = deferred(),
    clearing = deferred();
  const sequence: string[] = [];
  mocks.hold.mockImplementation(() => {
    sequence.push('hold');
    return { clear: mocks.clear, release: mocks.release };
  });
  mocks.clear.mockImplementation(() => {
    sequence.push('clear');
    return clearing.promise;
  });
  mocks.logout.mockImplementation(() => {
    sequence.push('http');
    return http.promise;
  });
  const done = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
  expect(sequence).toEqual(['hold', 'clear', 'http']);
  expect(mocks.release).not.toHaveBeenCalled();
  clearing.resolve();
  await Promise.resolve();
  expect(mocks.release).not.toHaveBeenCalled();
  http.resolve();
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(mocks.generalClear).toHaveBeenCalledOnce();
});
it('failed raw-byte erase leaves the hold unreleased without preventing successful server sign-out', async () => {
  mocks.clear.mockRejectedValue(new Error('synthetic private filename must not be printed'));
  const done = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(mocks.release).not.toHaveBeenCalled();
  expect(mocks.generalClear).toHaveBeenCalledOnce();
  expect(screen.queryByText(/synthetic private/)).toBeNull();
});
it('even a failed HTTP logout attempts byte erasure and preserves existing general cache cleanup', async () => {
  mocks.logout.mockRejectedValue(new Error('synthetic server failure'));
  const done = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
  await waitFor(() => expect(mocks.release).toHaveBeenCalledOnce());
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.generalClear).toHaveBeenCalledOnce();
  expect(done).not.toHaveBeenCalled();
  expect(await screen.findByRole('alert')).toBeTruthy();
});
