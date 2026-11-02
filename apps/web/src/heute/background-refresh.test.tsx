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
const card = () => screen.getByRole('region', { name: 'Kontoprognose · 35 Tage' });
const budgetTile = () =>
  document.querySelector('[aria-labelledby="kennzahl-zu-verteilen-title"]') as HTMLElement;
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
  await screen.findByText('Zu verteilen');
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

it.each([true, false])(
  'orders the lead and actionable sources only with redesign %s',
  async (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
    mount('/?monat=2026-09&period=payday');
    await screen.findByTestId('heute-wealth-history');
    await ready();
    const titles = [...document.querySelectorAll('.heute-answer-grid h2')].map(
      (node) => node.textContent,
    );
    expect(titles).toEqual(
      enabled
        ? ['Frei bis Gehalt', 'Nettovermögen', 'Zu verteilen']
        : ['Zu verteilen', 'Frei bis Gehalt', 'Nettovermögen'],
    );
    const work = screen.getByRole('region', { name: 'Zu tun' });
    const lead = screen.getByTestId('heute-lead-value');
    expect(Boolean(lead.compareDocumentPosition(work) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );
    expect(Boolean(document.querySelector('.heute-v2-monthline'))).toBe(enabled);
    expect(screen.queryByRole('link', { name: 'Finanz-Check und Verlauf öffnen' }) !== null).toBe(
      enabled,
    );
    if (enabled) {
      expect(within(work).getByRole('link', { name: 'Verteilen' }).getAttribute('href')).toContain(
        '/plan/monat',
      );
      expect(work.textContent).toContain('1.234,56 € zu verteilen');
      expect(
        Boolean(
          work.compareDocumentPosition(document.querySelector('.heute-pace')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ).toBe(true);
    }
  },
);
