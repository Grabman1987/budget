// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountTree } from './account-tree';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('./redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return flag.enabled;
  },
}));
const clients: QueryClient[] = [];
beforeEach(() => {
  flag.enabled = true;
  vi.stubGlobal('fetch', async () => Response.json({ accounts: [], positions: [] }));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const root = createRootRoute({ component: AccountTree });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' })]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
it('ON makes the Konten tree heading open the existing all-bookings body', async () => {
  mount();
  const tree = await screen.findByRole('navigation', { name: 'Konten' });
  expect(within(tree).getByRole('link', { name: 'Konten' }).getAttribute('href')).toBe(
    '/konten/buchungen',
  );
  expect(within(tree).getByRole('button', { name: 'Neues Konto anlegen' })).toBeTruthy();
  expect(within(tree).getByRole('link', { name: 'Konten verwalten' })).toBeTruthy();
});
it('OFF keeps the original account-tree heading and management actions', async () => {
  flag.enabled = false;
  mount();
  const tree = await screen.findByRole('navigation', { name: 'Konten' });
  expect(within(tree).queryByRole('link', { name: 'Konten' })).toBeNull();
  expect(within(tree).getByRole('button', { name: 'Neues Konto anlegen' })).toBeTruthy();
  expect(within(tree).getByRole('link', { name: 'Konten verwalten' })).toBeTruthy();
});
