// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { createTestDatabase, type OpenedDatabase } from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { AccountsSettings } from './accounts-settings';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
const databases: OpenedDatabase[] = [];
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  databases.splice(0).forEach((db) => db.close());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mount() {
  const opened = createTestDatabase();
  databases.push(opened);
  seedBasics(opened.db);
  const api = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-15',
    stepUp: async (_c, next) => next(),
  });
  const writes: string[] = [];
  let failReads = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}) => {
      if (init.method !== 'GET') writes.push(`${init.method} ${path}`);
      if (failReads && init.method === 'GET' && path.startsWith('/api/accounts'))
        return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
      return api.request(path.replace('/api', ''), init);
    }),
  );
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/einstellungen/konten',
    component: AccountsSettings,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/einstellungen/konten'] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return {
    api,
    writes,
    failReads: () => {
      failReads = true;
    },
  };
}

it('ON asks before discarding an account draft and cancel writes nothing', async () => {
  const { writes } = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Giro bearbeiten' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Name'), ' synthetic draft');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }));
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();
  confirm.mockReturnValue(true);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(writes).toEqual([]);
});

it('ON keeps the account draft when the latest metadata cannot be read', async () => {
  const { writes, failReads } = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Giro bearbeiten' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Name'), ' synthetic draft');
  failReads();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  await within(dialog).findByRole('alert');
  expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe(
    'Giro synthetic draft',
  );
  expect(writes).toEqual([]);
});

it('ON refuses a stale metadata save and preserves the current server name', async () => {
  const { api, writes } = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Giro bearbeiten' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Name'), ' synthetic local draft');
  const response = await api.request('/accounts/giro', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Synthetic concurrent name' }),
  });
  expect(response.ok).toBe(true);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  await screen.findByText(/Das Konto wurde inzwischen geändert. Dein Entwurf bleibt erhalten/);
  expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe(
    'Giro synthetic local draft',
  );
  expect(writes).toEqual([]);
  const latest = (await (await api.request('/accounts')).json()) as {
    accounts: { id: string; name: string }[];
  };
  expect(latest.accounts.find((account) => account.id === 'giro')?.name).toBe(
    'Synthetic concurrent name',
  );
});

it('ON presents compact account actions and protects an unsaved new account', async () => {
  const { writes } = mount();
  await screen.findByRole('button', { name: 'Giro bearbeiten' });
  const actions = screen.getByLabelText('Aktionen für Giro');
  await userEvent.click(actions);
  expect(
    within(actions.parentElement!).getByRole('button', { name: 'Konto archivieren' }),
  ).toBeTruthy();
  await userEvent.click(await screen.findByRole('button', { name: 'Konto anlegen' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Name', { exact: true }), 'Synthetic draft');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();
  confirm.mockReturnValue(true);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(writes).toEqual([]);
});
