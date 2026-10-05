// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EMPTY_PROFILE } from '@budget/domain';
import { MobileHeader, TabBar } from './mobile-chrome';

afterEach(() => vi.unstubAllGlobals());

it('offers search in the phone header and only booking capture below the page', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal(
    'fetch',
    async (url: string) =>
      new Response(JSON.stringify(url === '/api/profile' ? EMPTY_PROFILE : { count: 0 }), {
        status: 200,
      }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <MobileHeader title="Heute" asHeading={false} />
        <TabBar area="heute" />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' })]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  const header = await screen.findByRole('banner');
  expect(within(header).getByRole('button', { name: 'Suchen' })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Suchen' })).toHaveLength(1);
  const capture = screen.getByRole('navigation', { name: 'Schnellerfassung' });
  expect(within(capture).getByRole('link', { name: 'Buchung erfassen' })).toBeTruthy();
  expect(within(capture).queryByRole('button')).toBeNull();
  client.clear();
});
