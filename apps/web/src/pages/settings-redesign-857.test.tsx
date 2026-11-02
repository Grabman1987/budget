// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { EMPTY_PROFILE, type Profile } from '@budget/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfilePanel } from './profile-settings';
import { SettingsNav, SettingsBack } from './settings-nav';
import { SETTINGS_GROUPS } from '../nav/areas';
import { PROFILE_KEY } from '../shell/use-profile';
import { FuturePreviewSetting } from './future-preview-setting';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../shell/redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return flag.enabled;
  },
}));
const clients: QueryClient[] = [];
beforeEach(() => {
  flag.enabled = true;
  vi.stubGlobal('scrollTo', () => {});
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(node: React.ReactNode = <ProfilePanel />, entry = '/einstellungen/profil') {
  let stored: Profile = { ...EMPTY_PROFILE };
  let preview = 35;
  const writes: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit) => {
      if (init.method !== 'GET') writes.push(`${init.method} ${path}`);
      if (path === '/api/display-settings') {
        if (init.method === 'PATCH')
          preview = (JSON.parse(String(init.body)) as { futurePreviewDays: number })
            .futurePreviewDays;
        return new Response(
          JSON.stringify({
            futurePreviewDays: preview,
            accountReminderDays: 14,
            groupId: 'synthetic-preview',
          }),
        );
      }
      if (init.method === 'PATCH') stored = JSON.parse(String(init.body)) as Profile;
      return new Response(
        JSON.stringify(init.method === 'GET' ? stored : { ...stored, groupId: 'synthetic-group' }),
      );
    }),
  );
  const root = createRootRoute({ component: Outlet });
  const paths = [
    ...new Set([
      '/einstellungen',
      ...SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.to)),
    ]),
  ];
  const routes = paths.map((path) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () =>
        path === '/einstellungen/profil' ? (
          node
        ) : (
          <>
            <SettingsNav variant="rail" />
            <p>Zielseite</p>
          </>
        ),
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return {
    router,
    client,
    writes,
    changePreview: (days: number) => {
      preview = days;
    },
    changeStored: (profile: Profile) => {
      stored = profile;
    },
  };
}

it('ON shows six accessible groups, preserves every destination and expands the current group', async () => {
  mount(<SettingsNav variant="rail" />);
  await screen.findByText('Profil & Sicherheit');
  expect(SETTINGS_GROUPS.map((group) => group.label)).toEqual([
    'Profil & Sicherheit',
    'Konten & Depots',
    'Kategorien & Regeln',
    'Verbindungen',
    'Vermögen',
    'Daten',
  ]);
  const current = screen.getByRole('list', { name: 'Profil & Sicherheit' });
  expect(within(current).getByRole('link', { name: 'Profil' }).getAttribute('aria-current')).toBe(
    'page',
  );
  const connections = screen.getByRole('link', { name: /^Verbindungen$/ });
  expect(connections.getAttribute('href')).toBe('/einstellungen/datenquellen');
  expect(connections.closest('details')).toBeNull();
  expect(screen.getByText('Konten & Depots').closest('details')?.open).toBe(false);
  await userEvent.click(screen.getByText('Konten & Depots'));
  expect(screen.getByText('neu hier').getAttribute('aria-hidden')).toBe('true');
  expect(screen.getByRole('link', { name: 'Kontakte' }).getAttribute('href')).toBe(
    '/einstellungen/kontakte',
  );
  expect(screen.getByRole('link', { name: 'Depots & Kryptos' }).getAttribute('href')).toBe(
    '/einstellungen/depots',
  );
});

it('ON carries a safe source URL across settings pages and offers an exact source return', async () => {
  const source = '/reports/inflation?zeitraum=1J&monat=2026-09#synthetic-source';
  mount(
    <>
      <SettingsNav variant="rail" />
      <SettingsBack current="profil" />
    </>,
    `/einstellungen/profil?von=${encodeURIComponent(source)}`,
  );
  const back = await screen.findByRole('link', { name: 'Zurück zur Ausgangsseite' });
  expect(back.getAttribute('href')).toBe(source);
  expect(screen.getByRole('link', { name: 'Sicherheit' }).getAttribute('href')).toContain(
    encodeURIComponent(source),
  );
});

it.each(['https://outside.invalid', '//outside.invalid', '/\\outside.invalid'])(
  'rejects unsafe source %s',
  async (source) => {
    mount(
      <SettingsBack current="profil" />,
      `/einstellungen/profil?von=${encodeURIComponent(source)}`,
    );
    await screen.findByRole('link', { name: 'Einstellungen' });
    expect(screen.queryByRole('link', { name: 'Zurück zur Ausgangsseite' })).toBeNull();
  },
);

it('ON guards dirty navigation and discards only after an explicit decision', async () => {
  const { router, writes } = mount();
  await userEvent.type(await screen.findByLabelText('Name'), 'Synthetic profile');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await act(async () => {
    void router.navigate({ to: '/einstellungen/sicherheit' });
  });
  await waitFor(() => expect(confirm).toHaveBeenCalled());
  expect(router.state.location.pathname).toBe('/einstellungen/profil');
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Synthetic profile');
  expect(writes).toEqual([]);
  confirm.mockReturnValue(true);
  await act(async () => {
    await router.navigate({ to: '/einstellungen/sicherheit' });
  });
  await screen.findByText('Zielseite');
  expect(writes).toEqual([]);
});

it('ON retains a dirty draft across background refresh and refuses to save stale data', async () => {
  const { client, writes } = mount();
  await userEvent.type(await screen.findByLabelText('Name'), 'Synthetic local draft');
  act(() => {
    client.setQueryData(PROFILE_KEY, { ...EMPTY_PROFILE, name: 'Synthetic other device' });
  });
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Synthetic local draft');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Speichern' }).hasAttribute('disabled')).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Aktuellen Stand laden' }));
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Synthetic other device');
  expect(writes).toEqual([]);
});

it('ON checks the latest server value before saving and keeps a conflicting draft', async () => {
  const { changeStored, writes } = mount();
  await userEvent.type(await screen.findByLabelText('Name'), 'Synthetic local draft');
  changeStored({ ...EMPTY_PROFILE, name: 'Synthetic server change' });
  await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await screen.findByRole('button', { name: 'Aktuellen Stand laden' });
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Synthetic local draft');
  expect(writes).toEqual([]);
});

it.each([true, false])('saves the existing fields with redesign=%s', async (enabled) => {
  flag.enabled = enabled;
  const { writes } = mount();
  await userEvent.type(await screen.findByLabelText('Name'), 'Synthetic person');
  await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await screen.findByText('Profil gespeichert.');
  expect(writes).toEqual(['PATCH /api/profile']);
  expect(screen.queryByRole('button', { name: 'Rückgängig' }) !== null).toBe(enabled);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Speichern' }).hasAttribute('disabled')).toBe(true),
  );
});

it('ON protects the existing Kontovorschau editor from stale saves and retains its draft', async () => {
  const { writes, changePreview } = mount(<FuturePreviewSetting />);
  const input = await screen.findByLabelText('Zukunftsvorschau (Tage)');
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('35'));
  await userEvent.clear(input);
  await userEvent.type(input, '21');
  changePreview(14);
  await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await screen.findByText(/Die Kontovorschau wurde inzwischen geändert/);
  expect((input as HTMLInputElement).value).toBe('21');
  expect(writes).toEqual([]);
  await userEvent.click(screen.getByRole('button', { name: 'Aktuellen Stand laden' }));
  expect((input as HTMLInputElement).value).toBe('14');
});
