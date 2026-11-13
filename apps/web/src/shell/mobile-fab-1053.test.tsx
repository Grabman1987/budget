// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TabBar } from './mobile-chrome';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('./redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return flag.enabled;
  },
}));
// The scrolled-down state: the hook reports "hide".
vi.mock('./use-fab-visible', () => ({ useFabVisible: () => false }));
afterEach(cleanup);

async function mount() {
  const root = createRootRoute({ component: () => <TabBar area={undefined} /> });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' })]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('navigation', { name: 'Hauptnavigation' });
}

it('redesign: the floating + stays present and focusable after scrolling down', async () => {
  flag.enabled = true;
  await mount();
  const fab = screen.getByRole('link', { name: 'Buchung erfassen' });
  expect(fab.hasAttribute('hidden')).toBe(false);
  fab.focus();
  expect(document.activeElement).toBe(fab);
});

it('old UI keeps hide-on-scroll', async () => {
  flag.enabled = false;
  await mount();
  expect(screen.queryByRole('link', { name: 'Buchung erfassen' })).toBeNull();
});
