// @vitest-environment jsdom
import { createTestDatabase } from '@budget/db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from '../../../server/src/api';
import { MonthClosePage } from './month-close-page';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('ON inspects a step without a progress write and guards a dirty next-month draft through stay/discard navigation', async () => {
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
  const opened = createTestDatabase();
  seedBasics(opened.db);
  const api = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-02',
    stepUp: async (_c, next) => next(),
  });
  const writes: string[] = [];
  vi.stubGlobal('fetch', (path: string, options?: RequestInit) => {
    if (options?.method && options.method !== 'GET') writes.push(options.method);
    return api.request(path.replace(/^\/api/, ''), options);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const close = createRoute({
    getParentRoute: () => root,
    path: '/close/$month',
    component: MonthClosePage,
  });
  const other = createRoute({
    getParentRoute: () => root,
    path: '/return',
    component: () => <h1>Synthetic return</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([close, other]),
    history: createMemoryHistory({ initialEntries: ['/close/2026-09'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByRole('combobox', { name: /Schritt nur ansehen/ }), {
    target: { value: '4' },
  });
  const input = (
    await screen.findAllByRole('textbox', { name: /^Plan für/ })
  )[0]! as HTMLInputElement;
  fireEvent.change(input, { target: { value: '12,34' } });
  act(() => {
    void router.navigate({ to: '/return' });
  });
  await screen.findByRole('dialog', { name: 'Entwurf behalten?' });
  fireEvent.click(screen.getByRole('button', { name: 'Hier bleiben' }));
  expect(input.value).toBe('12,34');
  expect(router.state.location.pathname).toBe('/close/2026-09');
  act(() => {
    void router.navigate({ to: '/return' });
  });
  await screen.findByRole('dialog', { name: 'Entwurf behalten?' });
  fireEvent.click(screen.getByRole('button', { name: 'Entwurf verwerfen und verlassen' }));
  await screen.findByRole('heading', { name: 'Synthetic return' });
  expect(writes).toEqual([]);
  cleanup();
  await client.cancelQueries();
  client.clear();
  opened.close();
});
