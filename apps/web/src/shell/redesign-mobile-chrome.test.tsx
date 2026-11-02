// @vitest-environment jsdom
import { EMPTY_PROFILE } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobileHeader } from './mobile-chrome';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('./redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return flag.enabled;
  },
}));
const clients: QueryClient[] = [];
beforeEach(() => {
  flag.enabled = true;
  setAmountsHidden(false);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json(
      url === '/api/profile'
        ? EMPTY_PROFILE
        : url.startsWith('/api/budget/')
          ? { summary: { envelopes: [] }, categories: [], groups: [] }
          : url.startsWith('/api/search')
            ? { results: [] }
            : { count: 0 },
    ),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

function mount(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const root = createRootRoute({
    // Deliberately constant: an arbitrary title must not grant a settings entry on another route.
    component: () => <MobileHeader title="Heute" asHeading />,
  });
  const router = createRouter({
    routeTree: root.addChildren(
      ['/', '/plan/monat', '/reports', '/einstellungen/profil'].map((path) =>
        createRoute({ getParentRoute: () => root, path }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

it('ON exposes the phone profile only on Heute and opens the existing profile page', async () => {
  mount('/');
  const avatar = await screen.findByLabelText('NU · Profil: Profilmenü');
  fireEvent.click(avatar);
  expect(screen.getByRole('link', { name: 'Profil und Einstellungen' }).getAttribute('href')).toBe(
    '/einstellungen/profil',
  );
  expect(screen.getByRole('button', { name: 'Suchen' })).toBeTruthy();
});

it('ON removes the avatar on other pages but keeps a touch search entry', async () => {
  mount('/plan/monat');
  const header = await screen.findByRole('banner');
  await waitFor(() => expect(within(header).queryByLabelText(/Profilmenü/)).toBeNull());
  expect(within(header).getByRole('button', { name: 'Suchen' })).toBeTruthy();
  expect(header.querySelector('.m-profile')).toBeNull();
});

it('ON keeps privacy and the real theme switch in search without losing the underlying page', async () => {
  const router = mount('/plan/monat?monat=2026-09');
  fireEvent.click(await screen.findByRole('button', { name: 'Suchen' }));
  const utilities = await screen.findByRole('group', { name: 'Darstellung' });
  const privacy = within(utilities).getByRole('button', { name: 'Beträge verbergen' });
  expect(privacy.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(privacy);
  await waitFor(() => expect(privacy.getAttribute('aria-pressed')).toBe('true'));
  const theme = within(utilities).getByRole('button', {
    name: /Dunkle Blaupause|Heller Zeichenfilm/,
  });
  const before = theme.textContent;
  fireEvent.click(theme);
  await waitFor(() => expect(theme.textContent).not.toBe(before));
  expect(router.state.location.pathname).toBe('/plan/monat');
  expect(router.state.location.search).toMatchObject({ monat: '2026-09' });
});

it('the remounted Heute avatar still closes with Escape and returns focus after a page round trip', async () => {
  const router = mount('/');
  await screen.findByLabelText('NU · Profil: Profilmenü');
  await act(async () => {
    await router.navigate({ to: '/reports' });
  });
  expect(screen.queryByLabelText(/Profilmenü/)).toBeNull();
  await act(async () => {
    await router.navigate({ to: '/' });
  });
  const avatar = await screen.findByLabelText('NU · Profil: Profilmenü');
  fireEvent.click(avatar);
  const link = screen.getByRole('link', { name: 'Profil und Einstellungen' });
  link.focus();
  fireEvent.keyDown(link, { key: 'Escape' });
  expect(avatar.closest('details')!.open).toBe(false);
  expect(document.activeElement).toBe(avatar);
});

it('OFF retains its existing avatar entry on other pages and its original settings URL', async () => {
  flag.enabled = false;
  mount('/plan/monat');
  fireEvent.click(await screen.findByLabelText('NU · Profil: Profilmenü'));
  expect(screen.getByRole('link', { name: 'Profil und Einstellungen' }).getAttribute('href')).toBe(
    '/einstellungen',
  );
});
