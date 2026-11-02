// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { payrollReport } from '@budget/domain';
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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanIncomePage } from './envelope-page';
import { budgetQuery, type BudgetMonthView } from './budget-api';
import { PlanMonthPage } from './plan-page';
import { setMonthSpan } from './month-span';

const redesign = vi.hoisted(() => ({ enabled: true }));
vi.mock('../shell/redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return redesign.enabled;
  },
}));

const budgetView = (month: string, incomeCents: number): BudgetMonthView => ({
  groups: [],
  categories: [],
  summary: {
    month,
    carryInCents: 0,
    incomeCents,
    uncoveredCents: 0,
    heldCents: 0,
    assignedCents: 0,
    activityCents: 0,
    availableCents: 0,
    toBeAssignedCents: incomeCents,
    creditOverspentCents: 0,
    cashOverspentCents: 0,
    envelopes: [],
    cards: [],
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function renderIncome({
  at = '/plan/monat/einnahmen?monat=2026-11',
  views = { '2026-11': budgetView('2026-11', 10_000) },
}: {
  at?: string;
  views?: Record<string, BudgetMonthView | Promise<BudgetMonthView>>;
} = {}) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    if (url.pathname === '/api/expected/income')
      return Response.json({
        receivedCents: 2500,
        expectedCents: 20_000,
        byPayment: [],
        byIncomeType: [],
      });
    if (url.pathname === '/api/budget/months') {
      const months = url.searchParams.get('months')!.split(',');
      return Response.json({
        months: Object.fromEntries(
          await Promise.all(months.map(async (month) => [month, await views[month]])),
        ),
      });
    }
    if (url.pathname.startsWith('/api/budget/')) {
      const month = url.pathname.slice('/api/budget/'.length);
      const view = views[month];
      return view
        ? Response.json(await view)
        : Response.json({ error: 'unavailable' }, { status: 503 });
    }
    if (url.pathname === '/api/payslips')
      return Response.json({
        ...payrollReport([], url.searchParams.get('month')!),
        captured: [],
        links: [],
        candidates: [],
        asOf: '2026-11-01',
        selectedMonth: url.searchParams.get('month'),
      });
    if (url.pathname === '/api/auth/status')
      return Response.json({ authenticated: true, method: 'passkey' });
    if (url.pathname === '/api/accounts') return Response.json({ accounts: [] });
    if (url.pathname === '/api/expected') return Response.json({ payments: [] });
    if (url.pathname === '/api/categories')
      return Response.json({ groups: [], categories: [], targets: [] });
    return Response.json({ error: 'not_found' }, { status: 404 });
  });
  const root = createRootRoute({ component: Outlet });
  const monthPage = createRoute({
    getParentRoute: () => root,
    path: '/plan/monat',
    validateSearch: (search: Record<string, unknown>) => ({
      monat: typeof search['monat'] === 'string' ? search['monat'] : undefined,
    }),
    component: PlanMonthPage,
  });
  const pages = ['/plan/monat/einnahmen', '/plan/erwartet/einnahmen'].map((path) =>
    createRoute({
      getParentRoute: () => root,
      path,
      validateSearch: (search: Record<string, unknown>) => ({
        monat: typeof search['monat'] === 'string' ? search['monat'] : undefined,
      }),
      component: PlanIncomePage,
    }),
  );
  const history = createMemoryHistory({ initialEntries: [at] });
  const router = createRouter({ routeTree: root.addChildren([monthPage, ...pages]), history });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...rendered, router, client, calls };
}

function headIncome(container: HTMLElement) {
  const label = [...container.querySelectorAll('.tb-label')].find(
    (node) => node.textContent === 'Einnahmen',
  );
  return label?.parentElement?.querySelector('.tb-value')?.textContent;
}

beforeEach(() => {
  redesign.enabled = true;
  setMonthSpan(1);
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  setMonthSpan(1);
  vi.unstubAllGlobals();
});

it('ON Plan income head uses budget-month income while received/expected remain schedule progress', async () => {
  const { container, calls } = renderIncome();
  await screen.findByTestId('income-received');
  await waitFor(() => expect(headIncome(container)).toBe('100,00 €'));
  const detail = screen.getByRole('region', { name: 'Einnahmen' });
  expect(within(detail).getByTestId('income-received').textContent).toBe('25,00 €');
  expect(detail.textContent).toContain('von erwartet 200,00 €');
  expect(detail.textContent).toContain(
    'Zählt für Zu verteilen: 100,00 € im Planmonat November 2026.',
  );
  expect(screen.getByRole('link', { name: 'Zurück zum Monat' }).getAttribute('href')).toBe(
    '/plan/monat?monat=2026-11',
  );
  expect(calls.every((call) => call.startsWith('GET '))).toBe(true);
});

it('OFF retains the received-income head and the distinct budget-month explanation', async () => {
  redesign.enabled = false;
  const { container } = renderIncome();
  await screen.findByTestId('income-received');
  await waitFor(() => expect(headIncome(container)).toBe('25,00 €'));
  expect(screen.getByRole('region', { name: 'Einnahmen' }).textContent).toContain(
    'Zählt für Zu verteilen: 100,00 €',
  );
});

it('ON Expected income keeps its schedule head, period and Expected return destination', async () => {
  const { container } = renderIncome({ at: '/plan/erwartet/einnahmen?monat=2026-11' });
  await screen.findByTestId('income-received');
  await waitFor(() => expect(headIncome(container)).toBe('25,00 €'));
  expect(screen.getByRole('link', { name: 'Zurück zu Erwartet' }).getAttribute('href')).toBe(
    '/plan/erwartet?monat=2026-11',
  );
  expect(screen.queryByRole('link', { name: 'Zurück zum Monat' })).toBeNull();
});

it('ON displays a real zero budget income instead of received schedule cash', async () => {
  const { container } = renderIncome({ views: { '2026-11': budgetView('2026-11', 0) } });
  await screen.findByTestId('income-received');
  await waitFor(() => expect(headIncome(container)).toBe('0,00 €'));
});

it('ON does not invent zero or use schedule cash while budget income is pending', async () => {
  const pending = deferred<BudgetMonthView>();
  const { container } = renderIncome({ views: { '2026-11': pending.promise } });
  await screen.findByTestId('income-received');
  expect(headIncome(container)).toBe('–');
  await act(async () => pending.resolve(budgetView('2026-11', 10_000)));
  await waitFor(() => expect(headIncome(container)).toBe('100,00 €'));
});

it('ON keeps missing budget income distinct from zero and from received schedule cash', async () => {
  const { container, client } = renderIncome({ views: {} });
  await screen.findByTestId('income-received');
  await waitFor(() =>
    expect(client.getQueryState(budgetQuery('2026-11').queryKey)?.status).toBe('error'),
  );
  expect(headIncome(container)).toBe('–');
});

it('ON changes month without leaking the previous budget value while the new month loads', async () => {
  const next = deferred<BudgetMonthView>();
  const { container, router, calls } = renderIncome({
    views: { '2026-11': budgetView('2026-11', 10_000), '2026-12': next.promise },
  });
  await waitFor(() => expect(headIncome(container)).toBe('100,00 €'));
  await act(async () =>
    router.navigate({ to: '/plan/monat/einnahmen', search: { monat: '2026-12' } }),
  );
  await waitFor(() => expect(headIncome(container)).toBe('–'));
  await act(async () => next.resolve(budgetView('2026-12', 32_100)));
  await waitFor(() => expect(headIncome(container)).toBe('321,00 €'));
  expect(calls).toContain('GET /api/budget/2026-12');
  expect(screen.getByRole('link', { name: 'Zurück zum Monat' }).getAttribute('href')).toBe(
    '/plan/monat?monat=2026-12',
  );
});

it('ON multi-month Plan head, chain and allocation keep the leftmost batch month as their basis', async () => {
  setMonthSpan(2);
  const { container, calls } = renderIncome({
    at: '/plan/monat?monat=2026-11',
    views: { '2026-11': budgetView('2026-11', 10_000), '2026-12': budgetView('2026-12', 77_700) },
  });
  await waitFor(() => expect(headIncome(container)).toContain('100,00 €'));
  expect(container.querySelector('.chain-inline')?.textContent).toMatch(/Einnahmen.*100/);
  expect(container.querySelector('.sb-note')?.textContent).toContain('100,00 €');
  expect(calls).toContain('GET /api/budget/months?months=2026-11,2026-12');
  expect(calls).not.toContain('GET /api/budget/2026-11');
});
