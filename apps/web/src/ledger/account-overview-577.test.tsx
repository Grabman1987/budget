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
import { createBooking, createTestDatabase, reconcileAccount, schema } from '@budget/db';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { OverviewPage } from './overview-page';
import { accountsQuery, LEDGER_KEY, seriesBatchQuery } from './queries';
import type { AccountList } from './types';
import type { AuthStatus } from '../auth/api';

const TODAY = '2026-10-21';
let opened: ReturnType<typeof createTestDatabase>;
let client: QueryClient;
let reads: string[];
let unexpected: string[];
let releaseAccounts: (() => void) | undefined;
let originalShow: typeof HTMLDialogElement.prototype.showModal;
let originalClose: typeof HTMLDialogElement.prototype.close;

beforeEach(() => {
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
  reads = [];
  unexpected = [];
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
      id: 'card',
      name: 'Synthetic Card',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: -2000,
    },
    {
      id: 'loan',
      name: 'Synthetic Loan',
      type: 'loan',
      role: 'debt',
      onBudget: false,
      openingBalanceCents: -6000,
    },
    {
      id: 'manual',
      name: 'Synthetic Investment',
      type: 'p2p',
      role: 'investment',
      onBudget: false,
      openingBalanceCents: 15000,
    },
    {
      id: 'reference',
      name: 'Synthetic Reference',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: 0,
    },
    {
      id: 'closed',
      name: 'Synthetic Closed',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingBalanceCents: 7777,
      closedAt: TODAY,
    },
  ] satisfies Array<Omit<typeof schema.account.$inferInsert, 'openingDate'>>;
  opened.db
    .insert(schema.account)
    .values(rows.map((row, sortOrder) => ({ ...row, openingDate: '2026-09-01', sortOrder })))
    .run();
  for (const row of rows.slice(0, 4))
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
  reconcileAccount(
    opened.db,
    { accountId: 'reference', date: '2026-09-01', statementBalanceCents: 0, today: TODAY },
    { actor: 'test' },
  );
  for (const amountCents of [1, -1])
    createBooking(
      opened.db,
      {
        accountId: 'reference',
        date: '2026-09-02',
        amountCents,
        status: 'pending',
        splits: [{ amountCents }],
      },
      { actor: 'test' },
    );
});
afterEach(() => {
  releaseAccounts?.();
  releaseAccounts = undefined;
  cleanup();
  client.clear();
  opened.close();
  HTMLDialogElement.prototype.showModal = originalShow;
  HTMLDialogElement.prototype.close = originalClose;
  act(() => setAmountsHidden(false));
  vi.unstubAllGlobals();
  vi.useRealTimers();
  expect(unexpected).toEqual([]);
});

function mount(options: { holdAccounts?: boolean; omitReview?: boolean } = {}) {
  const api = createLedgerApi({
    db: opened.db,
    today: () => TODAY,
    stepUp: async (_c, next) => next(),
  });
  const gate = options.holdAccounts
    ? new Promise<void>((resolve) => {
        releaseAccounts = resolve;
      })
    : undefined;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = new URL(input, 'http://localhost');
    const key = `${method} ${url.pathname}${url.search}`;
    reads.push(key);
    const allowed =
      method === 'GET' &&
      ((url.pathname === '/api/auth/status' && !url.search) ||
        (url.pathname === '/api/accounts' && !url.search) ||
        (url.pathname === '/api/portfolio/positions' && !url.search) ||
        (url.pathname === '/api/accounts/series' &&
          url.search === '?from=2026-09-21&to=2026-10-21&quality=1'));
    if (!allowed) {
      unexpected.push(key);
      return Response.json({ error: 'unexpected_test_request' }, { status: 500 });
    }
    if (url.pathname === '/api/auth/status') {
      const status = {
        setupRequired: false,
        authenticated: true,
        stepUpValidUntil: null,
        viaRecovery: false,
      } satisfies AuthStatus;
      return Response.json(status);
    }
    if (url.pathname === '/api/accounts') await gate;
    const response = await api.request(url.pathname.replace(/^\/api/, '') + url.search, init);
    if (options.omitReview && url.pathname === '/api/accounts') {
      const list = (await response.json()) as AccountList;
      return Response.json({
        ...list,
        accounts: list.accounts.map((account) => {
          if (account.id !== 'manual') return account;
          const oldCachedRow: Partial<typeof account> = { ...account };
          delete oldCachedRow.reviewStatus;
          return oldCachedRow;
        }),
      });
    }
    return response;
  });
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/konten', component: OverviewPage }),
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

it('shows literal Budget figures and the existing physical account groups once, excluding closed accounts', async () => {
  const { container } = mount();
  await screen.findByRole('link', { name: /^Synthetic Alpha / });
  await waitFor(() =>
    expect(screen.getByTestId('budget-accounts-balance').textContent).toBe('120,00 €'),
  );
  expect(screen.getByRole('link', { name: '4 von 6 Konten geprüft' })).toBeTruthy();
  expect([...container.querySelectorAll('.grp-title')].map((node) => node.textContent)).toEqual([
    'Budget-Konten',
    'Kreditkarten',
    'Kredite',
    'Investments',
  ]);
  expect(
    [...container.querySelectorAll('[data-testid="account-group-value"]')].map(
      (node) => node.textContent,
    ),
  ).toEqual(['120,00 €', '−20,00 €', '−60,00 €', '150,00 €']);
  expect(
    [...container.querySelectorAll('[data-account-id]')]
      .filter((row) => row.querySelector('[data-review-state="checked"]'))
      .map((row) => row.getAttribute('data-account-id')),
  ).toEqual(['alpha', 'bravo', 'card', 'loan']);
  expect(
    [...container.querySelectorAll('[data-account-id] .kcheck')].map((node) => node.textContent),
  ).toEqual(['geprüft', 'geprüft', 'Fällig', 'geprüft', 'geprüft', 'Noch kein Prüfstand']);
  expect(container.querySelectorAll('[data-account-id]')).toHaveLength(6);
  expect(container.querySelector('[data-account-id="closed"]')).toBeNull();
  expect(screen.queryByText('Synthetic Closed')).toBeNull();
  expect(
    container.querySelector('[data-account-id="card"] [data-testid="account-value"]')?.textContent,
  ).toBe('−20,00 €');
  expect(
    container.querySelector('[data-account-id="loan"] [data-testid="account-value"]')?.textContent,
  ).toBe('−60,00 €');
  expect(
    container.querySelector('[data-account-id="manual"] [data-testid="account-value"]')
      ?.textContent,
  ).toBe('150,00 €');
  expect(screen.getByRole('link', { name: 'Vermögen ansehen' }).getAttribute('href')).toBe(
    '/vermoegen/nettovermoegen',
  );
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Details zu Synthetic Reference' }));
  const fullStatus = screen.getByText('Fällig · geprüft am 01.09.2026');
  expect(fullStatus.classList.contains('is-stale')).toBe(true);
});

it('waits for actual server asOf and uses a separate quality cache while preserving LEDGER invalidation', async () => {
  mount({ holdAccounts: true, omitReview: true });
  await waitFor(() => expect(reads).toContain('GET /api/accounts'));
  expect(reads.some((entry) => entry.includes('/series'))).toBe(false);
  act(() => releaseAccounts?.());
  await screen.findByRole('link', { name: /^Synthetic Alpha / });
  await waitFor(() =>
    expect(reads).toContain('GET /api/accounts/series?from=2026-09-21&to=2026-10-21&quality=1'),
  );
  expect(screen.getByText('Prüfstatus für 1 Konto nicht verfügbar.')).toBeTruthy();
  expect(screen.getByRole('link', { name: '4 von 6 Konten geprüft' })).toBeTruthy();
  const legacy = seriesBatchQuery(30, { asOf: TODAY });
  const enriched = seriesBatchQuery(30, { asOf: TODAY, quality: true });
  expect(legacy.queryKey).toEqual(['ledger', 'series-batch', 30, TODAY]);
  expect(enriched.queryKey).toEqual(['ledger', 'series-batch', 30, TODAY, 'quality-v1']);
  await waitFor(() => expect(client.isFetching()).toBe(0));
  const previousReads = reads.length;
  await act(async () => {
    await client.invalidateQueries({ queryKey: LEDGER_KEY });
  });
  expect(reads.slice(previousReads)).toContain('GET /api/accounts');
  expect(reads.slice(previousReads)).toContain(
    'GET /api/accounts/series?from=2026-09-21&to=2026-10-21&quality=1',
  );
  expect(client.getQueryData(accountsQuery().queryKey)).toBeTruthy();
});

it('retains shared reference identity and group placement rather than duplicating platform cash accounts', async () => {
  opened.db
    .insert(schema.account)
    .values(
      ['depot-a', 'depot-b'].map((id, index) => ({
        id,
        name: `Synthetic ${id}`,
        type: 'brokerage' as const,
        role: 'investment' as const,
        onBudget: false,
        referenceAccountId: 'reference',
        openingDate: '2026-09-01',
        sortOrder: 10 + index,
      })),
    )
    .run();
  const { container } = mount();
  await screen.findByRole('button', { name: 'Details zu Synthetic Reference' });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(container.querySelectorAll('[data-account-id="reference"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-account-id]')).toHaveLength(8);
  const ids = [...container.querySelectorAll('[data-account-id]')].map((node) =>
    node.getAttribute('data-account-id'),
  );
  expect(ids).toEqual([
    'alpha',
    'bravo',
    'reference',
    'card',
    'loan',
    'manual',
    'depot-a',
    'depot-b',
  ]);
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Details zu Synthetic Reference' }));
  const relationships = container.querySelector('.overview-platform-links');
  expect(relationships).not.toBeNull();
  expect(
    within(relationships as HTMLElement)
      .getByRole('link', { name: 'Synthetic depot-a' })
      .getAttribute('href'),
  ).toBe('/konten/depot-a');
  expect(
    within(relationships as HTMLElement)
      .getByRole('link', { name: 'Synthetic depot-b' })
      .getAttribute('href'),
  ).toBe('/konten/depot-b');
});

it('masks new cash and pending FX text, embedded source money and a live account draft without changing its values', async () => {
  opened.db
    .insert(schema.account)
    .values({
      id: 'usd',
      name: 'Synthetic 987,65 EUR',
      type: 'checking',
      role: 'investment',
      currency: 'USD',
      onBudget: false,
      openingDate: '2026-09-01',
      openingBalanceCents: 10000,
    })
    .run();
  opened.db
    .insert(schema.fxRate)
    .values({ date: TODAY, currency: 'USD', rateMicro: 1234567, source: 'Saldo 123,45 €' })
    .run();
  createBooking(
    opened.db,
    {
      accountId: 'usd',
      date: TODAY,
      amountCents: -100,
      status: 'pending',
      splits: [{ amountCents: -100 }],
    },
    { actor: 'test' },
  );
  const before = opened.db.select().from(schema.booking).all();
  const { container } = mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Details zu Synthetic 987,65 EUR' }));
  expect(container.querySelector('.overview-detail')?.textContent).toContain('Saldo 123,45 €');
  expect(container.querySelector('.overview-detail')?.textContent).toContain('1,234567 EUR');
  await user.click(screen.getByRole('button', { name: 'Konto anlegen' }));
  const dialog = screen.getByRole('dialog', { name: 'Konto anlegen' });
  const name = within(dialog).getByLabelText('Name');
  await user.click(name);
  await user.paste('Synthetic draft');
  act(() => setAmountsHidden(true));
  const display = container.querySelector('.account-overview-577');
  expect(display?.textContent).not.toMatch(/123,45|1,234567|987,65|99,00/);
  const detail = container.querySelector('.overview-detail');
  expect(detail?.textContent).toContain('•••');
  expect(display?.querySelector('[aria-label*="987,65"]')).toBeNull();
  expect((name as HTMLInputElement).value).toBe('Synthetic draft');
  act(() => setAmountsHidden(false));
  expect(detail?.textContent).toContain('Saldo 123,45 €');
  expect(detail?.textContent).toContain('1,234567 EUR');
  expect(opened.db.select().from(schema.booking).all()).toEqual(before);
});
