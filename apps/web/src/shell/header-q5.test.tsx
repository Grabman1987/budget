// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EMPTY_PROFILE } from '@budget/domain';
import { Topbar } from './topbar';
import { MobileHeader, TabBar } from './mobile-chrome';
import { OfflineStatus } from './header-status';

const queue = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('../pwa/queue-ui', () => ({ useBookingQueue: () => queue }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queue.items = [];
});

async function mount(count: number, mobile = false) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal(
    'fetch',
    async (url: string) =>
      new Response(
        JSON.stringify(
          url === '/api/profile'
            ? EMPTY_PROFILE
            : url.startsWith('/api/budget/')
              ? { summary: { envelopes: [] }, categories: [], groups: [] }
              : { count },
        ),
      ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        {mobile ? (
          <MobileHeader title="Heute" asHeading={false} />
        ) : (
          <Topbar collapsed={false} onToggle={() => {}} />
        )}
        <OfflineStatus />
        <TabBar area={undefined} />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' })]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  return client;
}

it.each([
  [0, 'Prüfen'],
  [1, 'Prüfen · 1'],
  [12, 'Prüfen · 12'],
] as const)('desktop links exactly one Prüfen pill for %i open items', async (count, text) => {
  const client = await mount(count);
  const link = await screen.findByRole('link', { name: `Prüfen, ${count} offen` });
  expect(link.textContent).toBe(text);
  expect(link.getAttribute('href')).toMatch(/^\/konten\/pruefen/);
  expect(document.querySelectorAll('.topbar .count, .topbar .overspent-chip')).toHaveLength(0);
  client.clear();
});

it('does not let the router mark an area active when search clears the area', async () => {
  const client = await mount(0);
  const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
  expect(nav.querySelector('[aria-current="page"]')).toBeNull();
  expect(nav.querySelector('[data-status="active"], .active')).toBeNull();
  client.clear();
});

it('phone has title, search and avatar with no empty status line', async () => {
  const client = await mount(0, true);
  const header = await screen.findByRole('banner');
  expect(within(header).getByText('Heute')).toBeTruthy();
  expect(within(header).getByRole('button', { name: 'Suchen' })).toBeTruthy();
  expect(header.querySelectorAll(':scope > a, :scope > button, :scope > details')).toHaveLength(2);
  await waitFor(() => expect(document.querySelector('.m-status')).toBeNull());
  client.clear();
});

it('keeps three queued writes separate from the one open review item', async () => {
  queue.items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const client = await mount(1);
  const pill = await screen.findByRole('link', { name: 'Prüfen, 1 offen' });
  expect(pill.textContent).toBe('Prüfen · 1');
  const chip = screen.getByRole('status');
  expect(chip.textContent).toBe('3 offline gespeichert');
  expect(pill.contains(chip)).toBe(false);
  client.clear();
});

it('phone puts open decisions in a linked status line below its header', async () => {
  const client = await mount(4, true);
  const link = await screen.findByRole('link', { name: '4 zu prüfen' });
  expect(link.closest('header')).toBeNull();
  expect(link.closest('.m-status')).toBeTruthy();
  expect(link.getAttribute('href')).toMatch(/^\/konten\/pruefen/);
  client.clear();
});
