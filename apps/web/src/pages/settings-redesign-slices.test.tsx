// @vitest-environment jsdom
import { createTestDatabase, type OpenedDatabase } from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  useLocation,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { CategoriesPage } from '../budget/categories-page';
import { DataSourcesPage } from './data-sources';
import { AssetClassesSettingsPage } from './asset-classes-settings';
import { assetSettingsQuery } from './asset-classes-api';
import { SecurityPanel } from './security-page';
import { ProjectSettings } from './project-settings';
import { InflationBasketSettingsPage } from './inflation-basket-settings';
import { ExportPlaceholderPage } from './export-placeholder';
import { AppLink } from '../shell/app-link';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
const databases: OpenedDatabase[] = [];
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  databases.splice(0).forEach((database) => database.close());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mount(
  node: React.ReactNode,
  path: string,
  additionalPaths: string[] = [],
  beforeRequest: (path: string) => Promise<void> = async () => {},
) {
  const database = createTestDatabase();
  databases.push(database);
  seedBasics(database.db);
  const api = createLedgerApi({
    db: database.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
  const writes: string[] = [];
  let failAssetReads = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      await beforeRequest(url);
      if (init.method && init.method !== 'GET') writes.push(`${init.method} ${url}`);
      if (failAssetReads && url === '/api/asset-classes/settings')
        return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
      if (url === '/api/auth/passkeys')
        return new Response(
          JSON.stringify({
            passkeys: [
              {
                id: 'synthetic',
                deviceName: 'Synthetic device',
                createdAt: '2026-09-01',
                lastUsedAt: '2026-09-17',
                current: true,
              },
            ],
            recoveryCodesRemaining: 8,
            otherSessions: 2,
          }),
        );
      return api.request(url.replace('/api', ''), init);
    }),
  );
  const root = createRootRoute({ component: Outlet });
  const routes = [path.split('?')[0]!, ...additionalPaths].map((routePath) =>
    createRoute({
      getParentRoute: () => root,
      path: routePath,
      component: () => node,
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
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
    writes,
    api,
    client,
    router,
    failAssetReads: () => {
      failAssetReads = true;
    },
  };
}
it('E3 ON puts categories in compact groups and retains edit, order and hidden-category controls', async () => {
  mount(<CategoriesPage />, '/einstellungen/kategorien');
  await screen.findByRole('button', { name: 'Essen verschieben' });
  expect(screen.getByRole('button', { name: 'Kategorie anlegen' })).toBeTruthy();
  expect(screen.getByRole('switch', { name: /Ausgeblendete zeigen/ })).toBeTruthy();
  expect(document.querySelector('.settings-category-list')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Essen verschieben' })).toBeTruthy();
});
it('E4 ON orders the real sources and makes unavailable-source recovery accessible', async () => {
  const { writes } = mount(<DataSourcesPage />, '/einstellungen/datenquellen');
  await screen.findByRole('heading', { name: 'Verbindungen' });
  expect(
    [...document.querySelectorAll('.settings-source-copy strong')].map(
      (element) => element.textContent,
    ),
  ).toEqual(['Bank', 'Krypto', 'Spritmonitor', 'Gehaltszettel', 'Kurse', 'VPI']);
  const fuel = screen.getByRole('region', { name: 'Spritmonitor' });
  await userEvent.click(within(fuel).getByRole('button', { name: 'Prüfen' }));
  await within(fuel).findByText(/Die Verbindung wird am Server eingerichtet/);
  expect(within(fuel).getByRole('button', { name: 'Jetzt abrufen' }).hasAttribute('disabled')).toBe(
    true,
  );
  expect(within(fuel).queryByRole('textbox')).toBeNull();
  const bank = screen.getByRole('region', { name: 'Bank' });
  await userEvent.click(within(bank).getByRole('button', { name: 'Prüfen' }));
  await within(bank).findByText(/Bank-Sync ist noch nicht eingerichtet/);
  expect(within(bank).getByText(/Noch kein erfolgreicher Abruf/)).toBeTruthy();
  expect(writes).toEqual([]);
});
it('shows loading source dates and reads only VPI reference metadata on settings entry', async () => {
  let release!: () => void;
  const pending = new Promise<void>((done) => {
    release = done;
  });
  const paths: string[] = [];
  const view = mount(<DataSourcesPage />, '/einstellungen/datenquellen', [], async (path) => {
    paths.push(path);
    await pending;
  });
  await screen.findByRole('heading', { name: 'Verbindungen' });
  expect(screen.getAllByText(/Letzter Erfolg: Wird geladen/)).toHaveLength(5);
  expect(screen.queryByText(/Letzter Erfolg: Nicht verfügbar/)).toBeNull();
  await act(async () => release());
  await waitFor(() => expect(view.client.isFetching()).toBe(0));
  expect(paths).toContain('/api/inflation-basket/reference');
  expect(paths).not.toContain('/api/reports/spending/inflation');
  expect(screen.queryByText(/Letzter Erfolg: Wird geladen/)).toBeNull();
});
it('E5 ON provides the one persisted target editor as a settings destination', async () => {
  mount(<AssetClassesSettingsPage />, '/einstellungen/anlageklassen?ansicht=stufen');
  await screen.findByRole('heading', { name: 'Zielallokation und Stufen' });
  await screen.findByText('Dynamische Stufen nach Anlagesumme');
  expect(document.querySelectorAll('#settings-target-form')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Speichern' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('Gültigkeit und Version').closest('details')?.open).toBe(false);
});
it('E6 ON presents actual security factors and cancellation never ends another session', async () => {
  const { writes } = mount(<SecurityPanel onLoggedOut={() => {}} />, '/einstellungen/sicherheit');
  await screen.findByText('Synthetic device');
  expect(screen.getByText('8 von 10 Codes noch gültig.')).toBeTruthy();
  expect(screen.queryByText('Passwort')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Alle anderen Sitzungen beenden' }));
  const dialog = screen.getByRole('dialog', { name: 'Alle anderen Sitzungen beenden?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
  expect(writes).toEqual([]);
});
it('E7 ON distinguishes the real CSV download from an unavailable encrypted restore backup', async () => {
  mount(<ExportPlaceholderPage />, '/einstellungen/export');
  await screen.findByRole('button', { name: 'ZIP-Export herunterladen' });
  expect(screen.getByRole('heading', { name: 'Verschlüsselte Sicherung' })).toBeTruthy();
  expect(
    screen.getByText('Der verschlüsselte Backup-Download ist derzeit nicht verfügbar.'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Backup|Sicherung/ })).toBeNull();
});

it('E3 ON refuses a stale category save and retains the typed draft', async () => {
  const { writes, api } = mount(<CategoriesPage />, '/einstellungen/kategorien');
  await screen.findByRole('button', { name: 'Miete verschieben' });
  await userEvent.click(screen.getByLabelText('Aktionen für Miete'));
  await userEvent.click(screen.getByRole('button', { name: 'Miete bearbeiten' }));
  const dialog = screen.getByRole('dialog', { name: 'Kategorie' });
  const name = within(dialog).getByLabelText('Name');
  await userEvent.clear(name);
  await userEvent.type(name, 'Synthetic local draft');
  const response = await api.request('/categories/miete', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Synthetic remote change' }),
  });
  expect(response.status).toBe(200);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  await within(dialog).findByText(/Die Kategorie wurde inzwischen geändert/);
  expect((name as HTMLInputElement).value).toBe('Synthetic local draft');
  expect(writes).toEqual([]);
});

it('E7 ON renames a project through its existing writer and refuses a conflicting draft', async () => {
  const { writes, api } = mount(<ProjectSettings />, '/einstellungen/projekte');
  const name = await screen.findByLabelText('Projektname');
  await userEvent.type(name, 'Synthetic project');
  await userEvent.click(screen.getByRole('button', { name: 'Projekt anlegen' }));
  await screen.findByText('Projekt angelegt.');
  await userEvent.click(screen.getByLabelText('Aktionen für Synthetic project'));
  await userEvent.click(screen.getByRole('button', { name: 'Umbenennen' }));
  await userEvent.clear(name);
  await userEvent.type(name, 'Synthetic renamed');
  await userEvent.click(
    within(document.querySelector('.settings-project-form')!).getByRole('button', {
      name: 'Umbenennen',
    }),
  );
  await screen.findByText('Projekt umbenannt.');
  await userEvent.click(screen.getByLabelText('Aktionen für Synthetic renamed'));
  await userEvent.click(screen.getByRole('button', { name: 'Umbenennen' }));
  await userEvent.clear(name);
  await userEvent.type(name, 'Synthetic local draft');
  const stored = (await (await api.request('/projects')).json()) as { projects: { id: string }[] };
  await api.request('/projects/' + stored.projects[0]!.id, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Synthetic remote change' }),
  });
  await userEvent.click(
    within(document.querySelector('.settings-project-form')!).getByRole('button', {
      name: 'Umbenennen',
    }),
  );
  await screen.findByText(/Das Projekt wurde inzwischen geändert/);
  expect((name as HTMLInputElement).value).toBe('Synthetic local draft');
  expect(writes).toHaveLength(2);
});
it('E3 ON returns from the basket to the exact report selection and anchor', async () => {
  const source = '/reports/inflation?monat=2026-09&zeitraum=1J#synthetic-source';
  mount(
    <InflationBasketSettingsPage />,
    '/einstellungen/warenkorb?von=' + encodeURIComponent(source),
  );
  const link = await screen.findByRole('link', { name: 'Zur persönlichen Inflation' });
  expect(link.getAttribute('href')).toBe(source);
});

it('E5 ON keeps a dirty policy draft when a background settings read fails', async () => {
  const { writes, client, failAssetReads } = mount(
    <AssetClassesSettingsPage />,
    '/einstellungen/anlageklassen?ansicht=stufen',
  );
  await screen.findByText('Gültigkeit und Version');
  await userEvent.click(screen.getByText('Gültigkeit und Version'));
  const input = screen.getByLabelText('Bezeichnung (optional)');
  await userEvent.type(input, 'Synthetic policy draft');
  failAssetReads();
  await act(async () => {
    await client.invalidateQueries({ queryKey: assetSettingsQuery().queryKey });
  });
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Bezeichnung (optional)') as HTMLInputElement).value).toBe(
    'Synthetic policy draft',
  );
  expect(writes).toEqual([]);
});

it('E3 ON captures the actual report entry and returns to its full selection without writing', async () => {
  const source = '/reports/inflation?monat=2026-09&zeitraum=1J#synthetic-source';
  function ReportBasketJourney() {
    const location = useLocation();
    return location.pathname === '/einstellungen/warenkorb' ? (
      <InflationBasketSettingsPage />
    ) : (
      <AppLink to="/einstellungen/warenkorb">Warenkorb bearbeiten</AppLink>
    );
  }
  const { router, writes } = mount(<ReportBasketJourney />, source, ['/einstellungen/warenkorb']);
  await userEvent.click(await screen.findByRole('link', { name: 'Warenkorb bearbeiten' }));
  const back = await screen.findByRole('link', { name: 'Zur persönlichen Inflation' });
  expect(
    new URL(router.state.location.href, 'https://budget.invalid').searchParams.get('von'),
  ).toBe(source);
  expect(back.getAttribute('href')).toBe(source);
  await userEvent.click(back);
  await screen.findByRole('link', { name: 'Warenkorb bearbeiten' });
  expect(router.state.location.href).toBe(source);
  expect(writes).toEqual([]);
});
