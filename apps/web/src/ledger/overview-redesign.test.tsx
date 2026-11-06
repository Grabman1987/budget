// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { setAmountsHidden, ToastProvider } from '@budget/ui';
import { createTestDatabase, reconcileAccount, schema } from '@budget/db';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { OverviewPage } from './overview-page';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
const TODAY = '2026-10-21';
let opened: ReturnType<typeof createTestDatabase>;
let client: QueryClient;
let requests: string[];
let originalShow: typeof HTMLDialogElement.prototype.showModal;
let originalClose: typeof HTMLDialogElement.prototype.close;

beforeEach(() => {
  flags.REDESIGN_ENABLED = true;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  originalShow = HTMLDialogElement.prototype.showModal;
  originalClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  opened = createTestDatabase();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  requests = [];
  const rows = [
    {
      id: 'alpha',
      name: 'Synthetic Alpha',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: 12345,
    },
    {
      id: 'bravo',
      name: 'Synthetic Bravo',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: -345,
    },
    {
      id: 'zero',
      name: 'Synthetic Zero',
      type: 'cash',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: 0,
    },
    {
      id: 'card',
      name: 'Synthetic Card',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: -2000,
    },
    {
      id: 'unknown',
      name: 'Synthetic Unknown',
      type: 'checking',
      role: 'investment',
      onBudget: false,
      currency: 'USD',
      openingBalanceCents: 123,
    },
    {
      id: 'closed-plus',
      name: 'Synthetic Closed Plus',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: 90000,
      closedAt: TODAY,
    },
    {
      id: 'closed-minus',
      name: 'Synthetic Closed Minus',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: -4000,
      closedAt: TODAY,
    },
    {
      id: 'closed-zero',
      name: 'Synthetic Closed Zero',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: 0,
      closedAt: TODAY,
    },
  ] satisfies Array<Omit<typeof schema.account.$inferInsert, 'openingDate'>>;
  for (const [sortOrder, row] of rows.entries()) {
    opened.db
      .insert(schema.account)
      .values({ ...row, openingDate: '2026-09-01', sortOrder })
      .run();
  }
  for (const row of rows.slice(0, 4)) {
    reconcileAccount(
      opened.db,
      {
        accountId: row.id,
        date: TODAY,
        statementBalanceCents: row.openingBalanceCents,
        today: TODAY,
      },
      { actor: 'test' },
    );
  }
});

afterEach(() => {
  cleanup();
  client.clear();
  opened.close();
  HTMLDialogElement.prototype.showModal = originalShow;
  HTMLDialogElement.prototype.close = originalClose;
  act(() => setAmountsHidden(false));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mount(beforeRequest: (path: string) => Promise<void> = async () => {}) {
  const api = createLedgerApi({
    db: opened.db,
    today: () => TODAY,
    stepUp: async (_c, next) => next(),
  });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    await beforeRequest(url.pathname);
    if (url.pathname === '/api/auth/status')
      return Response.json({
        setupRequired: false,
        authenticated: true,
        stepUpValidUntil: null,
        viaRecovery: false,
      });
    return api.request(url.pathname.replace(/^\/api/, '') + url.search, init);
  });
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/konten', component: OverviewPage }),
      createRoute({
        getParentRoute: () => root,
        path: '/konten/buchungen',
        component: () => <p>Bookings destination</p>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/konten/$id',
        component: () => <p>Account destination</p>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/konten/pruefen',
        component: () => <p>Review destination</p>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/vermoegen/nettovermoegen',
        component: () => <p>Wealth destination</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/konten'] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function openActions(user = userEvent.setup()) {
  const summary = screen.queryByLabelText('Kontenaktionen');
  if (summary && !(summary.parentElement as HTMLDetailsElement).open) await user.click(summary);
}

it('shows a loading balance while linked depot positions are pending, then the real balance', async () => {
  opened.db
    .insert(schema.account)
    .values({
      id: 'pending-depot',
      name: 'Synthetic pending depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: TODAY,
      openingBalanceCents: 500,
      referenceAccountId: 'alpha',
    })
    .run();
  let release!: () => void;
  const pending = new Promise<void>((done) => {
    release = done;
  });
  mount(async (path) => {
    if (path === '/api/portfolio/positions') await pending;
  });
  await screen.findByTestId('budget-accounts-balance');
  await waitFor(() =>
    expect(screen.getByTestId('budget-accounts-balance').textContent).toBe('Wird geladen …'),
  );
  expect(screen.getByTestId('budget-accounts-balance').getAttribute('aria-busy')).toBe('true');
  await act(async () => release());
  await waitFor(() =>
    expect(screen.getByTestId('budget-accounts-balance').textContent).toBe('125,00 €'),
  );
  expect(screen.getByTestId('budget-accounts-balance').getAttribute('aria-busy')).toBe('false');
});

it.each([false, true])(
  'retains canonical signed, unknown and zero figures with redesign %s',
  async (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
    const { container } = mount();
    await screen.findByRole('link', { name: /^Synthetic Alpha / });
    await waitFor(() =>
      expect(screen.getByTestId('budget-accounts-balance').textContent).toBe('120,00 €'),
    );
    expect(container.querySelector('[data-redesign="account-overview"]') !== null).toBe(enabled);
    if (enabled) await openActions();
    expect(screen.queryByRole('link', { name: 'Alle Buchungen' }) !== null).toBe(enabled);
    expect(
      [...container.querySelectorAll('[data-testid="account-group-value"]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(['120,00 €', '−20,00 €', '–']);
    expect(
      container.querySelector('[data-account-id="zero"] [data-testid="account-value"]')
        ?.textContent,
    ).toBe('0,00 €');
    expect(
      container.querySelector('[data-account-id="unknown"] [data-testid="account-value"]')
        ?.textContent,
    ).toBe('Nicht verfügbar');
    expect(
      screen.getByRole('link', { name: enabled ? '4 von 5 geprüft' : '4 von 5 Konten geprüft' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('columnheader', { name: enabled ? 'Saldo' : 'Wert in EUR' }),
    ).toBeTruthy();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(requests).toContain('GET /api/accounts/series?from=2026-09-21&to=2026-10-21&quality=1');
    expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
  },
);

it('keeps all bookings reachable without accounts or review work', async () => {
  // Clear dependent reconcile/audit rows too by using a fresh empty synthetic database.
  opened.close();
  opened = createTestDatabase();
  mount();
  await screen.findByText(
    'Keine offenen Konten. Lege ein Konto an, um hier Saldo und Prüfstand zu sehen.',
  );
  expect(screen.getByRole('link', { name: '0 von 0 geprüft' })).toBeTruthy();
  await openActions();
  expect(screen.getByRole('link', { name: 'Alle Buchungen' }).getAttribute('href')).toBe(
    '/konten/buchungen',
  );
  await userEvent.setup().click(screen.getByRole('link', { name: 'Alle Buchungen' }));
  await screen.findByText('Bookings destination');
  expect(requests.some((request) => request.includes('/series'))).toBe(false);
  expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
});

it('collapses an ON group without losing its total or review summary and reveals it for ordering', async () => {
  const user = userEvent.setup();
  const { container } = mount();
  await screen.findByRole('link', { name: /^Synthetic Alpha / });
  const group = screen.getByRole('button', { name: 'Budget-Konten Prüfung alle 14 Tage' });
  expect(container.querySelectorAll('.overview-review-track > span')).toHaveLength(5);
  await user.click(group);
  expect(group.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('link', { name: /^Synthetic Alpha / })).toBeNull();
  expect(screen.getAllByText('120,00 €').length).toBeGreaterThan(0);
  await openActions(user);
  await user.click(screen.getByRole('button', { name: 'Reihenfolge ändern' }));
  expect(group.getAttribute('aria-expanded')).toBe('true');
  expect(group.hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Synthetic Alpha nach unten' })).toBeTruthy();
  expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
});

it('retains closed residuals, source explanation, table and accessible ordering without writes', async () => {
  const user = userEvent.setup();
  const { container } = mount();
  await screen.findByRole('link', { name: /^Synthetic Alpha / });
  await user.click(screen.getByText('Geschlossene Konten · Restwerte im Nettovermögen'));
  expect(screen.getByText('Restwert · 900,00 €')).toBeTruthy();
  expect(screen.getByText('Restwert · −40,00 €')).toBeTruthy();
  expect(screen.getByText('Kein Restwert · 0,00 €')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Details zu Synthetic Unknown' }));
  expect(screen.getAllByText(/Wechselkurs.*USD|USD.*Wechselkurs/).length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: 'Details zu Synthetic Alpha' }));
  await waitFor(() =>
    expect(container.querySelector('.overview-detail .chart-data-table')).toBeTruthy(),
  );
  await openActions(user);
  await user.click(screen.getByRole('button', { name: 'Reihenfolge ändern' }));
  expect(
    screen.getByRole('button', { name: 'Synthetic Alpha nach oben' }).hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.getByRole('button', { name: 'Synthetic Alpha nach unten' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Fertig' }));
  await user.click(screen.getByRole('button', { name: 'Konto anlegen' }));
  const dialog = screen.getByRole('dialog', { name: 'Konto anlegen' });
  await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
  expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
});

it('masks the canonical lead and closed residuals live without changing the restored values', async () => {
  mount();
  await screen.findByRole('link', { name: /^Synthetic Alpha / });
  await userEvent
    .setup()
    .click(screen.getByText('Geschlossene Konten · Restwerte im Nettovermögen'));
  act(() => setAmountsHidden(true));
  expect(screen.getByTestId('budget-accounts-balance').textContent).toBe('••• €');
  expect(screen.queryByText('Restwert · 900,00 €')).toBeNull();
  expect(screen.queryByText('Restwert · −40,00 €')).toBeNull();
  act(() => setAmountsHidden(false));
  expect(screen.getByTestId('budget-accounts-balance').textContent).toBe('120,00 €');
  expect(screen.getByText('Restwert · 900,00 €')).toBeTruthy();
  expect(screen.getByText('Restwert · −40,00 €')).toBeTruthy();
  expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
});
