// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';
import type * as MobileChrome from './mobile-chrome';

const flag = vi.hoisted(() => ({ enabled: true }));
const active = vi.hoisted(() => ({ page: undefined as unknown }));
vi.mock('./redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return flag.enabled;
  },
}));
vi.mock('./page-meta', () => ({ useActivePage: () => active.page }));
vi.mock('./inbox', () => ({ useInboxCount: () => ({ count: 0, label: 'Prüfen, 0 offen' }) }));
vi.mock('./sidebar', () => ({ Sidebar: () => null }));
vi.mock('./panel-host', () => ({ PanelHost: () => null }));
vi.mock('./capture-shortcut', () => ({ useCaptureShortcut: () => {} }));
vi.mock('./header-status', () => ({ MobileStatusLine: () => null, OfflineStatus: () => null }));
vi.mock('./global-search', () => ({ GlobalSearch: () => <button>Suchen</button> }));
vi.mock('./mobile-chrome', async (original) => ({
  ...(await original<typeof MobileChrome>()),
  TabBar: () => null,
}));
vi.mock('../pwa/queue-ui', () => ({ QueueList: () => null }));
vi.mock('../pwa/storage-protection', () => ({ useStorageProtection: () => {} }));
vi.mock('../heute/overview', () => ({ HeuteShellHead: () => null, HeuteStandLine: () => null }));
vi.mock('../heute/return-context', () => ({ HeuteSourceReturn: () => null }));
vi.mock('../budget/use-category-writes', () => ({ useBudgetWrite: () => async () => {} }));

const NAME = 'Neues Dokument hochladen';
beforeEach(() => {
  flag.enabled = true;
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('fetch', async () => Response.json({ accounts: [], count: 0 }));
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mount(path: string, area: string, phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query.includes('max-width: 767px'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  active.page = { area, title: area, path, register: undefined };
  const root = createRootRoute({ component: AppShell });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path })]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole('main');
}

const pages = [
  ['/', 'heute'],
  ['/plan/monat', 'plan'],
  ['/konten', 'konten'],
  ['/vermoegen', 'vermoegen'],
  ['/reports', 'reports'],
  ['/einstellungen/profil', 'einstellungen'],
] as const;

it.each(pages)(
  'redesign ON desktop: exactly one upload action, in the header, on %s (%s)',
  async (path, area) => {
    await mount(path, area, false);
    const found = screen.getAllByRole('button', { name: NAME });
    expect(found).toHaveLength(1);
    expect(found[0]!.closest('header.topbar')).not.toBeNull();
  },
);

it.each(pages)(
  'redesign ON phone: the header carries no upload action on %s (%s)',
  async (path, area) => {
    await mount(path, area, true);
    expect(screen.queryByRole('button', { name: NAME })).toBeNull();
  },
);

it('opens the upload dialog from the shell action and keeps it mounted', async () => {
  await mount('/plan/monat', 'plan', false);
  fireEvent.click(screen.getByRole('button', { name: NAME }));
  expect(await screen.findByRole('dialog', { name: 'Dokument hochladen' })).toBeTruthy();
});

it('redesign OFF renders no global upload action', async () => {
  flag.enabled = false;
  await mount('/plan/monat', 'plan', false);
  expect(screen.queryByRole('button', { name: NAME })).toBeNull();
});
