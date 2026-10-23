// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BookingPanelState } from '../ledger/booking-panel';
import { PanelHost } from './panel-host';
import { isPanelId } from './panels';

// Keep the real global host and Router context; inspect only the capture state crossing their boundary.
vi.mock('../ledger/booking-panel', () => ({
  BookingPanel: ({ state }: { state: BookingPanelState }) => (
    <output aria-label="Vorgewähltes Konto">
      {state?.mode === 'create' ? state.accountId : ''}
    </output>
  ),
}));
afterEach(cleanup);

it.each([
  '/konten/konto-724?panel=buchung',
  '/konten/konto%2D724?panel=buchung',
  '/konten/konto-724/?panel=buchung',
])('passes the real leaf account context to global capture at %s', async (path) => {
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      panel: isPanelId(search['panel']) ? search['panel'] : undefined,
    }),
    component: () => (
      <>
        <PanelHost />
        <Outlet />
      </>
    ),
  });
  const account = createRoute({
    getParentRoute: () => root,
    path: '/konten/$id',
    component: () => <h1>Kontoregister</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([account]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Kontoregister' });
  await waitFor(() =>
    expect(screen.getByLabelText('Vorgewähltes Konto').textContent).toBe('konto-724'),
  );
});
