// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PAGES } from '../nav/pages';
import { isZeitraum } from '../wealth/zeitraum';
import { PageFrame } from './placeholder-page';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../shell/redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return flag.enabled;
  },
}));
// The subject is the real page navigation and router links, not header data fetching.
vi.mock('./area-head', () => ({ AreaHead: () => <header>Seitenkopf</header> }));

const clients: QueryClient[] = [];
beforeEach(() => {
  flag.enabled = true;
  vi.stubGlobal('scrollTo', () => {});
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

function mount(entry: string) {
  const root = createRootRoute({ component: Outlet });
  const paths = [
    '/plan/monat',
    '/plan/jahr',
    '/plan/erwartet',
    '/plan/sparziele',
    '/plan/prognose',
    '/vermoegen/nettovermoegen',
    '/vermoegen/portfolio',
    '/vermoegen/schulden',
    '/vermoegen/freiheit',
  ];
  const routes = paths.map((path) => {
    const meta = PAGES.find((page) => page.path === path)!;
    return createRoute({
      getParentRoute: () => root,
      path,
      validateSearch: (search: Record<string, unknown>) => ({
        ...search,
        zeitraum: isZeitraum(search['zeitraum']) ? search['zeitraum'] : undefined,
      }),
      component: () => (
        <PageFrame meta={meta}>
          <p>{meta.title} Inhalt</p>
        </PageFrame>
      ),
    });
  });
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

it('ON offers the five existing Plan destinations as a page menu instead of registers', async () => {
  mount('/plan/monat?monat=2026-09');
  const trigger = await screen.findByLabelText('Planansicht wählen: Monat');
  fireEvent.click(trigger);
  const menu = screen.getByRole('navigation', { name: 'Ansichten von Plan' });
  expect(
    within(menu)
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['Monat', 'Jahr', 'Zahlungen', 'Ziele', 'Prognose']);
  expect(within(menu).getByRole('link', { name: 'Monat' }).getAttribute('aria-current')).toBe(
    'page',
  );
  expect(screen.queryByRole('navigation', { name: 'Register von Plan' })).toBeNull();
});

it('OFF retains the existing Plan registers and actual destinations', async () => {
  flag.enabled = false;
  mount('/plan/monat?monat=2026-09');
  const registers = await screen.findByRole('navigation', { name: 'Register von Plan' });
  expect(
    within(registers)
      .getAllByRole('link')
      .map((link) => new URL(link.getAttribute('href')!, 'https://budget.invalid').pathname),
  ).toEqual(['/plan/monat', '/plan/jahr', '/plan/erwartet', '/plan/sparziele', '/plan/prognose']);
  expect(screen.queryByLabelText('Planansicht wählen: Monat')).toBeNull();
});

it.each(['1J', '2026-01..2026-09'])(
  'ON keeps the four working wealth bodies and chosen period %s until their migration slices',
  async (period) => {
    mount(`/vermoegen/portfolio?zeitraum=${period}`);
    fireEvent.click(await screen.findByLabelText('Vermögensansicht wählen: Portfolio'));
    const links = within(
      screen.getByRole('navigation', { name: 'Ansichten von Vermögen' }),
    ).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Nettovermögen',
      'Portfolio',
      'Schulden',
      'Freiheit',
    ]);
    expect(
      links.map((link) => new URL(link.getAttribute('href')!, 'https://budget.invalid').pathname),
    ).toEqual([
      '/vermoegen/nettovermoegen',
      '/vermoegen/portfolio',
      '/vermoegen/schulden',
      '/vermoegen/freiheit',
    ]);
    expect(
      new URL(links[2]!.getAttribute('href')!, 'https://budget.invalid').searchParams.get(
        'zeitraum',
      ),
    ).toBe(period);
  },
);

it('a page change pushes history, retains compatible month context and Back restores the full source', async () => {
  const router = mount('/plan/monat?monat=2026-09&kategorie=synthetic-food#kept-source');
  fireEvent.click(await screen.findByLabelText('Planansicht wählen: Monat'));
  fireEvent.click(screen.getByRole('link', { name: 'Zahlungen' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/plan/erwartet'));
  expect(router.state.location.search).toMatchObject({ monat: '2026-09' });
  expect(router.state.location.search).not.toHaveProperty('kategorie');
  expect(router.state.location.hash).toBe('');
  await act(async () => {
    router.history.back();
  });
  await waitFor(() => expect(router.state.location.pathname).toBe('/plan/monat'));
  expect(router.state.location.search).toMatchObject({
    monat: '2026-09',
    kategorie: 'synthetic-food',
  });
  expect(router.state.location.hash).toBe('kept-source');
});

it('Escape returns focus to the trigger and an outside pointer closes the native menu', async () => {
  mount('/plan/monat');
  const trigger = await screen.findByLabelText('Planansicht wählen: Monat');
  fireEvent.click(trigger);
  const details = trigger.closest('details')!;
  const payments = screen.getByRole('link', { name: 'Zahlungen' });
  payments.focus();
  fireEvent.keyDown(payments, { key: 'Escape' });
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  expect(details.open).toBe(true);
  fireEvent.pointerDown(document.body);
  expect(details.open).toBe(false);
});
