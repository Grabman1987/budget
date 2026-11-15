// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router';
import { expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { RegisterNavigationBoundary } from './navigation-outlet';
import { validateBookingsSearch } from '../ledger/bookings-search';

it('shows the committed target register before the router restores scroll', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  const root = createRootRoute({ component: Outlet });
  const account = createRoute({
    getParentRoute: () => root,
    path: '/konten/$id',
    component: () => (
      <RegisterNavigationBoundary>
        <button>Edit target</button>
      </RegisterNavigationBoundary>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([account]),
    history: createMemoryHistory({ initialEntries: ['/konten/old'] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('button');
  const visibleAtRestoration: boolean[] = [];
  const unsubscribe = router.subscribe('onRendered', ({ toLocation }) => {
    if (toLocation.pathname === '/konten/target')
      visibleAtRestoration.push(screen.queryByRole('button', { name: 'Edit target' }) !== null);
  });
  await act(async () => {
    await router.navigate({ href: '/konten/target' });
  });
  unsubscribe();
  expect(visibleAtRestoration).toEqual([true]);
});

it('keeps unrelated page effects and focus intact during a delayed search navigation', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cleanup = vi.fn();
  function Page() {
    useEffect(() => cleanup, []);
    return <input aria-label="Goal name" defaultValue="Synthetic goal" />;
  }
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/plan/sparziele',
    validateSearch: (search: Record<string, unknown>) => ({ filter: search['filter'] }),
    beforeLoad: async ({ search }) => {
      if (search.filter) await gate;
    },
    component: Page,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/plan/sparziele'] }),
  });
  render(<RouterProvider router={router} />);
  const input = await screen.findByRole('textbox');
  input.focus();
  let navigation!: Promise<void>;
  act(() => {
    navigation = router.navigate({ href: '/plan/sparziele?filter=target' });
  });
  try {
    await waitFor(() => expect(router.state.isLoading).toBe(true));
    expect(cleanup).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(document.activeElement).toBe(input);
  } finally {
    await act(async () => {
      release();
      await navigation;
    });
  }
  expect(cleanup).not.toHaveBeenCalled();
});

it.each([
  ['/konten/target', '/konten/old'],
  ['/konten/buchungen?konto=target', '/konten/buchungen?konto=old'],
])('removes old actions while %s waits for its route guard', async (target, initial) => {
  vi.stubGlobal('scrollTo', vi.fn());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let blocked = false;
  const shellCleanup = vi.fn();
  function Shell() {
    useEffect(() => shellCleanup, []);
    return <Outlet />;
  }
  const root = createRootRoute({ component: Shell });
  const account = createRoute({
    getParentRoute: () => root,
    path: '/konten/$id',
    validateSearch: validateBookingsSearch,
    beforeLoad: async ({ params, search }) => {
      if (params.id === 'target' || search.konto === 'target') {
        blocked = true;
        await gate;
      }
    },
    component: () => (
      <RegisterNavigationBoundary>
        <button>Edit booking</button>
      </RegisterNavigationBoundary>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([account]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('button', { name: 'Edit booking' });
  let navigation!: Promise<void>;
  act(() => {
    navigation = router.navigate({ href: target });
  });
  await waitFor(() => expect(blocked).toBe(true));
  expect(router.state.location.href).toBe(target);
  try {
    expect(screen.queryByRole('button', { name: 'Edit booking' })).toBeNull();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(shellCleanup).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      release();
      await navigation;
    });
  }
  await screen.findByRole('button', { name: 'Edit booking' });
  expect(shellCleanup).not.toHaveBeenCalled();
});
