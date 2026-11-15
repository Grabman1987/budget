// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { expect, it, vi } from 'vitest';
import { NavigationOutlet } from './navigation-outlet';

it.each(['/account/target', '/account/old?filter=target'])(
  'removes old actions while %s waits for its route guard',
  async (target) => {
    vi.stubGlobal('scrollTo', vi.fn());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let blocked = false;
    const root = createRootRoute({ component: NavigationOutlet });
    const account = createRoute({
      getParentRoute: () => root,
      path: '/account/$id',
      validateSearch: (search: Record<string, unknown>) => ({ filter: search['filter'] }),
      beforeLoad: async ({ params, search }) => {
        if (params.id === 'target' || search.filter === 'target') {
          blocked = true;
          await gate;
        }
      },
      component: () => <button>Edit booking</button>,
    });
    const router = createRouter({
      routeTree: root.addChildren([account]),
      history: createMemoryHistory({ initialEntries: ['/account/old'] }),
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
    } finally {
      await act(async () => {
        release();
        await navigation;
      });
    }
    await screen.findByRole('button', { name: 'Edit booking' });
  },
);
