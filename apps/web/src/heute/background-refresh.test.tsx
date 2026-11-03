// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { accounts, createTestDatabase, type SavingsExecutionProposal } from '@budget/db';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { HeutePage } from './heute-page';
import { DimensionPage } from './dimension-page';
import { HEUTE_KEY } from './api';
import { budgetQuery } from '../budget/budget-api';
import { liquidityQuery } from '../reports/liquidity-api';
import { savingsProposalsQuery } from '../wealth/savings-api';
import { isMonth } from '../nav/month';
import { shouldRetry } from '../api/http';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 360] }));
const DAY = '2026-09-17';
type Read = 'heute' | 'budget' | 'liquidity' | 'savings';
let opened: ReturnType<typeof createTestDatabase>;
let api: ReturnType<typeof createLedgerApi>;
let client: QueryClient;
let failed: Read | undefined;
let failureStatus = 503;
let gate: { read: Read | Read[]; promise: Promise<void>; release: () => void } | undefined;
let writes: string[];
let unexpected: string[];
let inFlight: Set<Promise<Response>>;
const proposal: SavingsExecutionProposal = {
  type: 'savings',
  id: 'synthetic-proposal',
  kind: 'revision',
  urgent: false,
  planId: 'synthetic-plan',
  month: '2026-09',
  securityId: 'synthetic-security',
  accountId: 'synthetic-depot',
  securityName: 'Synthetic instrument',
  accountName: 'Synthetic depot',
  sourceAccountName: 'Synthetic account',
  currency: 'EUR',
  date: DAY,
  amountCents: 12_345,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${DAY}T10:00:00Z`));
  localStorage.clear();
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: '57400000-0000-4000-8000-000000000001',
      name: 'Synthetic account',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      currency: 'EUR',
      openingDate: '2026-01-01',
      openingBalanceCents: 123_456,
    },
    { actor: 'synthetic-574' },
  );
  api = createLedgerApi({ db: opened.db, today: () => DAY, stepUp: async (_c, next) => next() });
  client = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry, staleTime: Infinity } },
  });
  flags.REDESIGN_ENABLED = true;
  failureStatus = 503;
  failed = undefined;
  gate = undefined;
  writes = [];
  unexpected = [];
  inFlight = new Set();
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    const response = (async () => {
      const url = new URL(input, 'http://localhost');
      if ((init?.method ?? 'GET') !== 'GET') {
        writes.push(`${init?.method} ${url.pathname}`);
        return Response.json({ error: 'unexpected_write' }, { status: 500 });
      }
      const read: Read | undefined =
        url.pathname === '/api/heute'
          ? 'heute'
          : url.pathname.startsWith('/api/budget/')
            ? 'budget'
            : url.pathname === '/api/liquidity'
              ? 'liquidity'
              : url.pathname === '/api/savings-plans/execution-proposals'
                ? 'savings'
                : undefined;
      if (gate && (Array.isArray(gate.read) ? gate.read.includes(read!) : gate.read === read))
        await gate.promise;
      if (read && failed === read && failureStatus === 0)
        throw new Error('synthetic network failure');
      if (read && failed === read)
        return Response.json({ error: 'synthetic_unavailable' }, { status: failureStatus });
      if (read === 'savings') return Response.json({ proposals: [proposal] });
      if (url.pathname === '/api/auth/status')
        return Response.json({
          authenticated: true,
          setupRequired: false,
          stepUpValidUntil: null,
          viaRecovery: false,
        });
      if (!read && !['/api/expected', '/api/goals'].includes(url.pathname)) {
        unexpected.push(url.pathname);
        return Response.json({ error: 'unexpected_test_read' }, { status: 500 });
      }
      return api.request(url.pathname.replace(/^\/api/, '') + url.search, init);
    })();
    inFlight.add(response);
    void response.then(
      () => inFlight.delete(response),
      () => inFlight.delete(response),
    );
    return response;
  });
});
afterEach(async () => {
  gate?.release();
  cleanup();
  await client.cancelQueries();
  // Query cancellation does not stop an already released synthetic API read.
  const completed = await Promise.allSettled([...inFlight]);
  client.clear();
  opened.close();
  act(() => setAmountsHidden(false));
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  expect(writes).toEqual([]);
  expect(unexpected).toEqual([]);
  expect(completed.filter((result) => result.status === 'rejected')).toEqual([]);
});
function mount(at = '/?monat=2026-09&period=month') {
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      ...(isMonth(search['monat']) ? { monat: search['monat'] } : {}),
      ...(search['period'] === 'month' || search['period'] === 'payday'
        ? { period: search['period'] }
        : {}),
    }),
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [at] }),
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: HeutePage }),
      createRoute({
        getParentRoute: () => root,
        path: '/heute/details/$kind',
        component: DimensionPage,
      }),
    ]),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}
function hold(read: Read | Read[]) {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  gate = { read, promise, release };
}
const card = () => screen.getByRole('region', { name: /Kontoprognose.*35 Tage/ });
const budgetTile = () =>
  document.querySelector(
    flags.REDESIGN_ENABLED ? '.hv-tasks' : '[aria-labelledby="kennzahl-zu-verteilen-title"]',
  ) as HTMLElement;
const refresh = (read: Read) =>
  client.invalidateQueries({
    queryKey:
      read === 'heute'
        ? HEUTE_KEY
        : read === 'budget'
          ? budgetQuery('2026-09').queryKey
          : read === 'liquidity'
            ? liquidityQuery('35d', []).queryKey
            : savingsProposalsQuery().queryKey,
  });
const ready = () => waitFor(() => expect(client.isFetching()).toBe(0));

const net = () => document.querySelector('[data-kennzahl="nettovermoegen"]');

it.each([true, false])(
  'retains same-context aggregate and canonical forecast only with redesign %s',
  async (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
    mount();
    await screen.findByTestId('heute-wealth-history');
    await ready();
    const previous = net();
    const low = card().querySelector('.heute-forecast-low')?.getAttribute('data-cents');
    expect(previous?.textContent).toBe('1.234,56 €');
    hold('heute');
    let pending!: Promise<void>;
    act(() => {
      pending = refresh('heute');
    });
    await waitFor(() => expect(client.isFetching()).toBeGreaterThan(0));
    await waitFor(() => expect(Boolean(net())).toBe(enabled));
    if (enabled) {
      expect(net()).toBe(previous);
      expect(card().querySelector('.heute-forecast-low')?.getAttribute('data-cents')).toBe(low);
      expect(screen.getByText(/Heute-Daten werden aktualisiert/).textContent).toContain(
        'Heute-Daten werden aktualisiert',
      );
      expect(card().textContent).toContain('17.09.2026');
    }
    act(() => gate!.release());
    await act(async () => {
      await pending;
    });
    await ready();
    expect(net()?.textContent).toBe('1.234,56 €');
    expect(screen.queryByText(/Heute-Daten werden aktualisiert/)).toBeNull();
  },
);

it.each([true, false])(
  'retains independent budget figures during refresh only with redesign %s',
  async (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
    mount();
    await screen.findByTestId('heute-wealth-history');
    await ready();
    const previous = within(budgetTile()).getByTestId('kennzahl-value');
    expect(previous.textContent).toBe('1.234,56 €');
    hold('budget');
    let pending!: Promise<void>;
    act(() => {
      pending = refresh('budget');
    });
    await waitFor(() => expect(client.isFetching()).toBeGreaterThan(0));
    await waitFor(() =>
      expect(Boolean(within(budgetTile()).queryByTestId('kennzahl-value'))).toBe(enabled),
    );
    if (enabled) {
      expect(within(budgetTile()).getByTestId('kennzahl-value')).toBe(previous);
      expect(screen.getByText(/Budgetangaben werden aktualisiert/).getAttribute('role')).toBe(
        'status',
      );
    }
    failed = 'budget';
    act(() => gate!.release());
    await act(async () => {
      await pending;
    });
    await ready();
    expect(within(budgetTile()).queryByTestId('kennzahl-value')).toBeNull();
    expect(within(budgetTile()).getByRole('alert')).toBeTruthy();
    expect(net()?.textContent).toBe('1.234,56 €');
  },
);

it('ON full month announces a retained-source refresh once and removes it after failure', async () => {
  mount('/heute/details/month?monat=2026-09&period=month');
  await screen.findByTestId('heute-wealth-history');
  await ready();
  const previous = net()?.textContent;
  hold('heute');
  let pending!: Promise<void>;
  act(() => {
    pending = refresh('heute');
  });
  await waitFor(() =>
    expect(screen.getAllByText(/Heute-Daten werden aktualisiert/)).toHaveLength(1),
  );
  expect(screen.getByText(/Heute-Daten werden aktualisiert/).getAttribute('role')).toBe('status');
  expect(net()?.textContent).toBe(previous);
  failed = 'heute';
  failureStatus = 403;
  act(() => gate!.release());
  await act(async () => {
    await pending;
  });
  await ready();
  expect(screen.queryByText(/Heute-Daten werden aktualisiert/)).toBeNull();
  expect(net()).toBeNull();
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});

it.each([503, 403])('clears retained aggregate money after a %s response', async (status) => {
  mount();
  await screen.findByTestId('heute-wealth-history');
  await ready();
  hold('heute');
  let pending!: Promise<void>;
  act(() => {
    pending = refresh('heute');
  });
  await waitFor(() =>
    expect(screen.getByText(/Heute-Daten werden aktualisiert/).textContent).toContain(
      'Heute-Daten werden aktualisiert',
    ),
  );
  failed = 'heute';
  failureStatus = status;
  act(() => gate!.release());
  await act(async () => {
    await pending;
  });
  await ready();
  expect(net()).toBeNull();
  expect(screen.queryByTestId('heute-wealth-history')).toBeNull();
  expect(screen.queryByText(/Heute-Daten werden aktualisiert/)).toBeNull();
  expect(within(budgetTile()).getByTestId('kennzahl-value').textContent).toBe('1.234,56 €');
});

it.each([
  { monat: '2026-08', period: 'month' },
  { monat: '2026-09', period: 'payday' },
])('does not retain prior context while loading $monat/$period', async (search) => {
  const router = mount();
  await screen.findByTestId('heute-wealth-history');
  await ready();
  // Deliberately exercise a caller-provided previous-query placeholder as well as a new key.
  client.setDefaultOptions({
    queries: {
      retry: shouldRetry,
      staleTime: Infinity,
      placeholderData: (previous: unknown) => previous,
    },
  });
  hold(['heute', 'budget']);
  await act(async () => {
    await router.navigate({ to: '/', search });
  });
  await waitFor(() => expect(client.isFetching()).toBeGreaterThan(0));
  expect(net()).toBeNull();
  expect(screen.queryByTestId('heute-wealth-history')).toBeNull();
  expect(card().querySelector('.heute-forecast-low')).toBeNull();
  if (search.monat === '2026-08')
    expect(within(budgetTile()).queryByTestId('kennzahl-value')).toBeNull();
  act(() => gate!.release());
  await ready();
  await screen.findByTestId('heute-wealth-history');
});

it('keeps first-load aggregate placeholders until the selected response arrives', async () => {
  hold('heute');
  mount();
  await screen.findByRole('link', { name: 'Verteilen →' });
  await waitFor(() =>
    expect(within(budgetTile()).getByTestId('kennzahl-value').textContent).toBe('1.234,56 €'),
  );
  expect(net()).toBeNull();
  expect(card().querySelector('.heute-forecast-low')).toBeNull();
  expect(screen.queryByText(/Heute-Daten werden aktualisiert/)).toBeNull();
  expect(card().getAttribute('aria-busy')).toBe('true');
  act(() => gate!.release());
  await screen.findByTestId('heute-wealth-history');
  await ready();
  expect(net()?.textContent).toBe('1.234,56 €');
});

it.each(['heute', 'budget'] as const)(
  'withholds %s cached money as soon as an actual production network retry begins',
  async (read) => {
    mount();
    await screen.findByTestId('heute-wealth-history');
    await ready();
    hold(read);
    let pending!: Promise<void>;
    act(() => {
      pending = refresh(read);
    });
    await waitFor(() => expect(client.isFetching()).toBeGreaterThan(0));
    failed = read;
    failureStatus = 0;
    act(() => gate!.release());
    const key =
      read === 'heute' ? [...HEUTE_KEY, '2026-09', 'month'] : budgetQuery('2026-09').queryKey;
    await waitFor(() => expect(client.getQueryState(key)?.fetchFailureCount).toBe(1));
    // A retry still reports success plus isFetching, despite the known failed attempt.
    expect(client.getQueryState(key)?.status).toBe('success');
    expect(client.isFetching()).toBeGreaterThan(0);
    await waitFor(() => {
      if (read === 'heute') {
        expect(net()).toBeNull();
        expect(card().querySelector('.heute-forecast-low')).toBeNull();
      } else expect(within(budgetTile()).queryByTestId('kennzahl-value')).toBeNull();
    });
    failed = undefined;
    await act(async () => {
      await pending;
    });
    await ready();
    expect(net()?.textContent).toBe('1.234,56 €');
    expect(within(budgetTile()).getByTestId('kennzahl-value').textContent).toBe('1.234,56 €');
  },
);

it.each(['month', 'payday'] as const)(
  'ON gives the canonical lead its own primary home in %s and keeps current-day source scope',
  async (period) => {
    mount(`/?monat=2026-09&period=${period}`);
    await screen.findByTestId('heute-wealth-history');
    await ready();
    const primary = screen.getByRole('region', { name: /^Frei bis Gehalt$/ });
    // Empty envelopes give zero free money; the independently seeded cash remains 1234.56.
    expect(within(primary).getByTestId('heute-lead-value').textContent).toBe('0,00 €');
    expect(
      within(primary)
        .getByRole('link', { name: /Frei verfügbar bis Gehalt/ })
        .getAttribute('href'),
    ).toContain('/heute/details/free');
    expect(primary.getAttribute('data-as-of')).toBe('2026-09-17');
    expect(screen.getAllByTestId('heute-lead-value')).toHaveLength(1);
    expect(document.querySelector('.hv-aside .hv-tasks')).not.toBeNull();
    expect(document.querySelector('.hv-main .hv-forecast')).not.toBeNull();
    expect(card().querySelector('.heute-forecast-low')?.getAttribute('data-cents')).toBe('123456');
    expect(screen.getByRole('link', { name: 'Finanz-Check · Verlauf →' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kennzahlen' }).getAttribute('href')).toContain(
      '/heute/details/metrics',
    );
  },
);

it('ON orders the five compact cards and moves full monthly capabilities into returnable detail homes', async () => {
  mount('/?monat=2026-09&period=month');
  await screen.findByTestId('heute-wealth-history');
  await ready();
  const cards = document.querySelectorAll('.hv-grid .hv-card h2');
  expect([...cards].map((card) => card.textContent)).toEqual([
    '1Monat im Blick',
    '2Kontoprognose · Budget-Konten · 35 Tage',
    '3Als Nächstes',
    '4Fällig',
    '5Letzte Buchungen',
  ]);
  expect(document.querySelector('.heute-upcoming')).toBeNull();
  expect(document.querySelector('.heute-composition')).toBeNull();
  for (const kind of [
    'pace',
    'forecast',
    'tasks',
    'due',
    'bookings',
    'wealth',
    'month',
    'metrics',
    'pinned',
  ]) {
    const link = document.querySelector<HTMLAnchorElement>(`a[href^="/heute/details/${kind}?"]`);
    expect(link).not.toBeNull();
    const target = new URL(link!.href);
    expect(target.searchParams.get('monat')).toBe('2026-09');
    expect(target.searchParams.get('period')).toBe('month');
    expect(target.searchParams.get('von')).toBe('/?monat=2026-09&period=month');
  }
});

it('ON due drilldown distinguishes an empty source from failure and retries without writing', async () => {
  mount('/heute/details/due?monat=2026-09&period=month');
  await screen.findByText('Keine Zahlungen in den nächsten 14 Tagen.');
  await ready();
  failed = 'heute';
  await act(async () => {
    await refresh('heute');
  });
  const error = await screen.findByRole('alert');
  expect(error.textContent).toContain('Fällig · alle Zahlungen konnten nicht geladen werden.');
  expect(screen.queryByText('Keine Zahlungen in den nächsten 14 Tagen.')).toBeNull();
  failed = undefined;
  await act(async () => {
    within(error).getByRole('button', { name: 'Erneut versuchen' }).click();
  });
  await screen.findByText('Keine Zahlungen in den nächsten 14 Tagen.');
  expect(screen.getByRole('link', { name: 'Zurück zu Heute' }).getAttribute('href')).toBe(
    '/?monat=2026-09&period=month',
  );
});
