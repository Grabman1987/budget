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
import { createTestDatabase, schema } from '@budget/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import type { AuthStatus } from '../auth/api';
import { isMonth } from '../nav/month';
import { PlanMonthPage } from './plan-page';
import { validatePlanFilterSearch } from './plan-filters';
import { BUDGET_KEY } from './use-category-writes';
import { setMonthSpan } from './month-span';

let opened: ReturnType<typeof createTestDatabase>;
let client: QueryClient;
let unexpected: string[];
let reads: string[];
let pageGate: Promise<void> | undefined;
let releasePages: (() => void) | undefined;
let refusePage: boolean;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
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
  setMonthSpan(1);
  opened = createTestDatabase();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  unexpected = [];
  reads = [];
  pageGate = undefined;
  refusePage = false;
  const { db } = opened;
  db.insert(schema.account)
    .values({
      id: 'budget',
      name: 'Synthetic budget',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-10-01',
      openingBalanceCents: 100000,
    })
    .run();
  db.insert(schema.categoryGroup).values({ id: 'group', name: 'Synthetic group' }).run();
  db.insert(schema.category)
    .values(
      ['A', 'B', 'C', 'E', 'hidden'].map((id, sortOrder) => ({
        id,
        name: id === 'A' ? 'Äpfel & Gemüse' : `Synthetic ${id}`,
        groupId: 'group',
        class: 'need' as const,
        kind: 'variable' as const,
        stage: 2,
        sortOrder,
        openingAvailableCents: id === 'B' ? 200 : 0,
        hiddenAt: id === 'hidden' ? '2026-09-01' : null,
      })),
    )
    .run();
  db.insert(schema.categoryTarget)
    .values({
      id: 'target',
      categoryId: 'A',
      kind: 'monthly',
      amountCents: 500,
      validFrom: '2026-10',
    })
    .run();
  for (const [id, amountCents] of [
    ['A', -300],
    ['E', -100],
  ] as const) {
    db.insert(schema.booking)
      .values({
        id: `spent-${id}`,
        accountId: 'budget',
        date: '2026-10-10',
        amountCents,
        status: 'confirmed',
      })
      .run();
    db.insert(schema.bookingSplit)
      .values({ id: `spent-${id}-split`, bookingId: `spent-${id}`, categoryId: id, amountCents })
      .run();
  }
  for (let index = 0; index < 51; index += 1) {
    const id = `missing-${String(index).padStart(3, '0')}`;
    db.insert(schema.booking)
      .values({
        id,
        accountId: 'budget',
        date: '2026-10-10',
        amountCents: -100,
        status: 'pending',
        memo: `Synthetic ${id}`,
      })
      .run();
    db.insert(schema.bookingSplit)
      .values({ id: `${id}-split`, bookingId: id, amountCents: -100 })
      .run();
  }
});
afterEach(async () => {
  releasePages?.();
  releasePages = undefined;
  await client.cancelQueries();
  cleanup();
  client.clear();
  opened.close();
  act(() => {
    setAmountsHidden(false);
    setMonthSpan(1);
  });
  vi.unstubAllGlobals();
  vi.useRealTimers();
  expect(unexpected).toEqual([]);
});

function mount(at = '/plan/monat?monat=2026-10') {
  const api = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-15',
    stepUp: async (_c, next) => next(),
  });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const method = init?.method ?? 'GET';
    const key = `${method} ${url.pathname}${url.search}`;
    reads.push(key);
    const plain = new Set([
      '/api/auth/status',
      '/api/accounts',
      '/api/expected',
      '/api/categories',
      '/api/budget/2026-10',
      '/api/budget/2026-11',
    ]);
    const uncategorized =
      url.pathname === '/api/budget/2026-10/uncategorized' &&
      [...url.searchParams.keys()].every((name) => name === 'cursor') &&
      url.searchParams.getAll('cursor').length <= 1;
    const allowed =
      method === 'GET' &&
      ((plain.has(url.pathname) && !url.search) ||
        uncategorized ||
        (url.pathname === '/api/budget/months' && url.search === '?months=2026-10,2026-11'));
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
    if (uncategorized) {
      await pageGate;
      if (refusePage)
        return Response.json(
          { error: 'uncategorized_changed', message: 'Synthetic conflict' },
          { status: 409 },
        );
    }
    return api.request(url.pathname.replace(/^\/api/, '') + url.search, init);
  });
  const history = createMemoryHistory({ initialEntries: [at] });
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      monat: isMonth(search['monat']) ? search['monat'] : undefined,
    }),
  });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/plan/monat',
    validateSearch: validatePlanFilterSearch,
    component: PlanMonthPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      route,
      createRoute({
        getParentRoute: () => root,
        path: '/konten/buchungen',
        component: () => <p>Ledger destination</p>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/plan/monat/envelope/$id',
        component: () => <p>Category history destination</p>,
      }),
    ]),
    history,
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, history, router };
}
const rowIds = (container: HTMLElement) =>
  [...container.querySelectorAll('.pname[data-category-id]')].map((node) =>
    node.getAttribute('data-category-id'),
  );
const statuses = () =>
  screen
    .getAllByRole('status')
    .map((node) => node.textContent)
    .join(' ');
const segment = (label: string) =>
  within(screen.getByRole('group', { name: 'Kategoriefilter' })).getByRole('button', {
    name: label,
  });

it('binds five literal segment counts to real category IDs, alternate views, functional collapse and cover placement', async () => {
  const { container } = mount();
  const user = userEvent.setup();
  await screen.findByRole('button', { name: 'Alle (4)' });
  expect(rowIds(container)).toEqual(['A', 'B', 'C', 'E']);
  expect(segment('Alle (4)').getAttribute('aria-pressed')).toBe('true');
  expect(segment('Unterfinanziert (1)')).toBeTruthy();
  expect(segment('Überzogen (2)')).toBeTruthy();
  expect(segment('Verfügbar (1)')).toBeTruthy();
  expect(segment('Ohne Kategorie (51)')).toBeTruthy();
  await user.click(segment('Unterfinanziert (1)'));
  expect(rowIds(container)).toEqual(['A']);
  await user.click(segment('Verfügbar (1)'));
  expect(rowIds(container)).toEqual(['B']);
  await user.click(segment('Überzogen (2)'));
  expect(rowIds(container)).toEqual(['A', 'E']);
  const cover = container.querySelector('.plan-filter-cover');
  expect(cover?.textContent).toContain('4,00 €');
  expect(cover).not.toBeNull();
  expect(
    cover!.compareDocumentPosition(container.querySelector('.pname')!) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  for (const name of ['Wasserfall', 'Zeit', 'Klassen', 'Gruppen']) {
    await user.click(screen.getByText('Optionen', { selector: 'summary' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Ansicht' })).getByRole('button', { name }),
    );
    expect(rowIds(container)).toEqual(['A', 'E']);
    expect(segment('Überzogen (2)').getAttribute('aria-pressed')).toBe('true');
  }
  const collapse = screen.getByRole('button', { name: 'Gruppe Synthetic group' });
  await user.click(collapse);
  expect(collapse.getAttribute('aria-expanded')).toBe('false');
  expect(rowIds(container)).toEqual([]);
  expect(segment('Überzogen (2)')).toBeTruthy();
  await user.click(collapse);
  expect(rowIds(container)).toEqual(['A', 'E']);
});

it('shares exact search/filter URLs, follows Back/Forward and clears stale selection without changing a search draft on privacy toggle', async () => {
  const { container, history, router } = mount();
  const user = userEvent.setup();
  await screen.findByRole('button', { name: 'Alle (4)' });
  await user.click(segment('Überzogen (2)'));
  expect(router.state.location.search).toMatchObject({ monat: '2026-10', filter: 'overspent' });
  await user.click(container.querySelector('.pname[data-category-id="A"]')!);
  await waitFor(() => expect(container.querySelector('.inspector-selection')).not.toBeNull());
  await user.click(segment('Verfügbar (1)'));
  expect(rowIds(container)).toEqual(['B']);
  expect(container.querySelector('.inspector-selection')).toBeNull();
  act(() => history.back());
  await waitFor(() => expect(segment('Überzogen (2)').getAttribute('aria-pressed')).toBe('true'));
  expect(rowIds(container)).toEqual(['A', 'E']);
  expect(container.querySelector('.inspector-selection')).toBeNull();
  act(() => history.forward());
  await waitFor(() => expect(segment('Verfügbar (1)').getAttribute('aria-pressed')).toBe('true'));
  expect(rowIds(container)).toEqual(['B']);
  await user.click(segment('Alle (4)'));
  const search = screen.getByRole('searchbox', { name: 'Kategorie suchen' });
  await user.click(search);
  await user.paste('  ÄPFEL  ');
  expect(rowIds(container)).toEqual(['A']);
  expect(router.state.location.search).toMatchObject({ monat: '2026-10', q: '  ÄPFEL  ' });
  act(() => setAmountsHidden(true));
  expect((search as HTMLInputElement).value).toBe('  ÄPFEL  ');
  expect(container.querySelector('.plan')?.textContent).not.toMatch(/\d[\d.,]*\s*€/);
  act(() => setAmountsHidden(false));
});

it('reproduces a shared URL and uses the same multi-month ANY predicate once per actual category', async () => {
  const { container, unmount } = mount('/plan/monat?monat=2026-10&filter=overspent&q=synthetic');
  await screen.findByRole('button', { name: 'Überzogen (1)' });
  expect(rowIds(container)).toEqual(['E']);
  expect(
    (screen.getByRole('searchbox', { name: 'Kategorie suchen' }) as HTMLInputElement).value,
  ).toBe('synthetic');
  unmount();
  client.clear();
  const second = mount('/plan/monat?monat=2026-10&filter=overspent&q=synthetic');
  await screen.findByRole('button', { name: 'Überzogen (1)' });
  expect(rowIds(second.container)).toEqual(['E']);
  act(() => setMonthSpan(2));
  await waitFor(() => expect(reads).toContain('GET /api/budget/months?months=2026-10,2026-11'));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(segment('Überzogen (1)').getAttribute('aria-pressed')).toBe('true');
  expect(rowIds(second.container)).toEqual(['E']);
  expect(statuses()).toContain('1 passende Kategorie.');
  await userEvent.setup().click(segment('Verfügbar (1)'));
  expect(rowIds(second.container)).toEqual(['B']);
  expect(
    [...second.container.querySelectorAll('.ptable-multi .prow [data-label="Verfügbar"]')].map(
      (cell) => cell.textContent,
    ),
  ).toEqual(['2,00 €', '2,00 €']);
});

it('announces50of51 then51of51, withholds retained pages during refresh/conflict and retries without any UI write', async () => {
  mount('/plan/monat?monat=2026-10&filter=uncategorized');
  const user = userEvent.setup();
  await waitFor(() => expect(statuses()).toContain('50 von 51 Buchungen ohne Kategorie geladen.'));
  const section = screen.getByRole('region', { name: 'Buchungen ohne Kategorie' });
  expect(within(section).getAllByRole('link')).toHaveLength(50);
  expect(
    (screen.getByRole('searchbox', { name: 'Kategorie suchen' }) as HTMLInputElement).disabled,
  ).toBe(true);
  await user.click(within(section).getByRole('button', { name: 'Weitere Buchungen' }));
  await waitFor(() => expect(statuses()).toContain('51 von 51 Buchungen ohne Kategorie geladen.'));
  expect(within(section).getAllByRole('link')).toHaveLength(51);
  expect(
    within(section).getByRole('link', { name: 'Synthetic missing-050' }).getAttribute('href'),
  ).toContain('buchung=missing-050');
  pageGate = new Promise<void>((resolve) => {
    releasePages = resolve;
  });
  act(() => {
    void client.invalidateQueries({ queryKey: [...BUDGET_KEY, '2026-10', 'uncategorized'] });
  });
  await waitFor(() => expect(statuses()).toContain('Buchungen ohne Kategorie werden geladen.'));
  expect(within(section).queryAllByRole('link')).toHaveLength(0);
  refusePage = true;
  act(() => releasePages?.());
  await screen.findByText('Der Plan hat sich geändert. Bitte die Buchungen neu laden.');
  expect(within(section).queryAllByRole('link')).toHaveLength(0);
  expect(statuses()).not.toContain('51 von 51');
  refusePage = false;
  pageGate = undefined;
  await user.click(within(section).getByRole('button', { name: 'Erneut versuchen' }));
  await waitFor(() => expect(statuses()).toContain('Buchungen ohne Kategorie geladen.'));
  expect(within(section).getAllByRole('link').length).toBeGreaterThanOrEqual(50);
});

it('distinguishes the52 pending-or-unclassified header union from51 strictly uncategorized bookings without double counting', async () => {
  opened.db
    .update(schema.booking)
    .set({ status: 'pending' })
    .where(eq(schema.booking.id, 'spent-A'))
    .run();
  const snapshot = () => ({
    bookings: opened.db.select().from(schema.booking).all(),
    splits: opened.db.select().from(schema.bookingSplit).all(),
    audit: opened.db.select().from(schema.auditLog).all(),
  });
  const before = snapshot();
  mount();
  const combined = await screen.findByText('52 vorgemerkt / ohne Kategorie', {
    selector: 'summary',
  });
  expect(combined.getAttribute('title')).toBe(
    'Buchungen mit vorgemerktem Status oder mindestens einem Anteil ohne Kategorie. Jede Buchung wird einmal gezählt.',
  );
  expect(segment('Ohne Kategorie (51)')).toBeTruthy();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(snapshot()).toEqual(before);
});
