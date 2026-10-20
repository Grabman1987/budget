// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { createTestDatabase, portfolioSummary, schema } from '@budget/db';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import { PortfolioPerformanceReport } from './portfolio-performance-report';
import { REPORTS } from '../nav/reports-catalog';
import { REPORTS_CATALOG } from '../nav/pages';
import { portfolioPerformanceQuery } from '../wealth/portfolio-api';
import type { WithValuationNotes } from '../ledger/valuation-hint';
import { AUTH_STATUS_KEY } from '../auth/status-query';
const resources: Array<ReturnType<typeof createTestDatabase>> = [];
const clients: QueryClient[] = [];
function response(options: { cashGap?: boolean; fifo?: boolean; history?: boolean } = {}) {
  const opened = createTestDatabase();
  resources.push(opened);
  opened.db
    .insert(schema.account)
    .values({
      id: 'eur-depot',
      name: 'Musterdepot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-08-20',
    })
    .run();
  opened.db
    .insert(schema.security)
    .values({ id: 'eur-security', name: 'Musterwertpapier', kind: 'stock', currency: 'EUR' })
    .run();
  opened.db
    .insert(schema.holding)
    .values({
      id: 'eur-holding',
      accountId: 'eur-depot',
      securityId: 'eur-security',
      asOf: '2026-08-20',
      unitsE8: 100000000,
      costBasisCents: 10000,
    })
    .run();
  opened.db
    .insert(schema.price)
    .values([
      {
        securityId: 'eur-security',
        date: '2026-08-20',
        priceMicro: 100000000,
        currency: 'EUR',
        source: 'manual',
      },
      {
        securityId: 'eur-security',
        date: '2026-09-20',
        priceMicro: 114000000,
        currency: 'EUR',
        source: 'manual',
      },
    ])
    .run();
  if (options.fifo)
    opened.db
      .insert(schema.investmentPreference)
      .values({ id: 'portfolio', costMethod: 'fifo' })
      .run();
  if (options.cashGap)
    opened.db
      .insert(schema.account)
      .values({
        id: 'unrelated-usd-cash',
        name: 'Andere Allokationskassa',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        currency: 'USD',
        allocationScope: 'included',
        openingDate: '2026-08-20',
        openingBalanceCents: 10000,
      })
      .run();
  const portfolio = portfolioSummary(opened.db, {
    today: '2026-09-20',
    period: '1M',
    view: 'securities',
    includePerformanceHistory: options.history ?? false,
  });
  // Expected cents and rate text are independently literal below, not computed from this helper.
  const data: { portfolio: typeof portfolio } & WithValuationNotes = { portfolio };
  return data;
}
function browserPrimitives() {
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Unexpected uncached request in the disclosure fixture'))),
  );
}
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
  for (const client of clients.splice(0)) client.clear();
  for (const opened of resources.splice(0)) opened.close();
  vi.unstubAllGlobals();
});

async function mount(data: ReturnType<typeof response>) {
  browserPrimitives();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(AUTH_STATUS_KEY, {
    setupRequired: false,
    authenticated: true,
    stepUpValidUntil: null,
    viaRecovery: false,
  });
  client.setQueryData(portfolioPerformanceQuery('1M').queryKey, data);
  client.setQueryData(portfolioPerformanceQuery('3M').queryKey, {
    ...data,
    portfolio: { ...data.portfolio, period: '3M' },
  });
  const report = REPORTS.find((item) => item.id === 'prendite');
  if (!report) throw new Error('Existing report catalog entry missing');
  const root = createRootRoute({
    component: () => (
      <main>
        <Outlet />
      </main>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/reports/$reportId',
        validateSearch: (search: Record<string, unknown>) => search,
        component: () => <PortfolioPerformanceReport report={report} meta={REPORTS_CATALOG} />,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/vermoegen/portfolio',
        component: () => <p>Portfolio-Ziel</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/reports/prendite?zeitraum=1M'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByTestId('period-ttwror');
  return { router, user: userEvent.setup() };
}

it('explains the returned FIFO identity while preserving literal 11400/1400 cents, period and the real destination', async () => {
  const data = response({ fifo: true });
  expect(data.portfolio.valueCents).toBe(11400);
  expect(data.portfolio.performance).toMatchObject({
    from: '2026-08-20',
    to: '2026-09-20',
    days: 31,
    startValueCents: 10000,
    endValueCents: 11400,
    gainCents: 1400,
  });
  const before = JSON.stringify(data);
  const { router, user } = await mount(data);
  expect(screen.getByTestId('period-ttwror').textContent).toBe('+14 %');
  const chain = screen.getByRole('group', {
    name: 'Maßkette Portfolioleistung im gewählten Zeitraum',
  });
  expect(chain.textContent).toContain('114');
  expect(chain.textContent).toContain('14');
  expect(screen.getByText('Kostenmethode: FIFO')).toBeTruthy();
  expect(screen.getByText(/Stichtag.*20\.09\.2026/)).toBeTruthy();
  expect(screen.getByText(/TTWROR und XIRR nach Portfolio Performance/).textContent).toContain(
    'Wertpapiere ohne Depotkassa',
  );
  await user.click(
    within(screen.getByRole('group', { name: 'Zeitraum' })).getByRole('button', { name: '3M' }),
  );
  expect(router.state.location.search['zeitraum']).toBe('3M');
  expect(screen.getByTestId('period-ttwror').textContent).toBe('+14 %');
  expect(JSON.stringify(data)).toBe(before);
  await user.click(screen.getByRole('button', { name: 'Portfolio öffnen' }));
  expect(router.state.location.pathname).toBe('/vermoegen/portfolio');
  expect(router.state.location.search['zeitraum']).toBe('3M');
});

it('keeps an unrelated current allocation FX gap out of the complete period-return marker', async () => {
  const data = response({ cashGap: true });
  expect(data.portfolio.quality.missingFxAccountIds).toEqual(['unrelated-usd-cash']);
  await mount(data);
  expect(screen.getByTestId('period-ttwror').textContent).toBe('+14 %');
  expect(screen.getByTestId('report-verdict').textContent).not.toContain('geschätzt');
  expect(screen.getByText(/Allokationsstand.*20\.09\.2026/)).toBeTruthy();
  expect(screen.getByText(/Wechselkurs fehlt/)).toBeTruthy();
  expect(screen.getByTestId('period-ttwror').parentElement?.textContent).not.toContain('≈');
  expect(document.body.textContent).not.toContain('USD/EUR vom');
});

it('retains reported estimated/missing bounds despite complete allocation without claiming every bounded day', async () => {
  const data = response();
  data.portfolio.quality = {
    ...data.portfolio.quality,
    valuationQuality: 'exact',
    confidence: 'exact',
    classification: 'complete',
    unclassifiedValueCents: 0,
    unclassifiedExposureCents: 0,
    unclassifiedShareBp: 0,
    unclassifiedProductCount: 0,
    unclassifiedSecurityIds: [],
    estimatedSecurityIds: [],
    staleSecurityIds: [],
    missingPriceSecurityIds: [],
    missingFxSecurityIds: [],
    missingFxAccountIds: [],
  };
  data.incomplete = [
    {
      securityId: 'historic-cost',
      name: 'Historische Schätzung',
      quality: 'estimated',
      from: '2026-08-21',
      to: '2026-08-23',
    },
    {
      securityId: 'historic-missing',
      name: 'Historische Fehlbewertung',
      quality: 'missing',
      from: '2026-08-25',
      to: '2026-08-26',
    },
  ];
  await mount(data);
  expect(screen.getByText(/Historische Schätzung/)).toBeTruthy();
  expect(screen.getByText(/Historische Fehlbewertung/)).toBeTruthy();
  expect(screen.getByText(/21\.08\.2026.*23\.08\.2026/)).toBeTruthy();
  expect(screen.getByText(/25\.08\.2026.*26\.08\.2026/)).toBeTruthy();
  expect(screen.getByText(/nicht jeder Tag/)).toBeTruthy();
  expect(
    screen.getByText(/historischen.*Quellen.*nicht|Quellen.*historischen.*nicht/),
  ).toBeTruthy();
  expect(screen.getByTestId('period-ttwror').textContent).toBe('+14 %');
});

it('does not reveal literal money through added explanations or metadata in privacy mode', async () => {
  const data = response();
  await mount(data);
  act(() => setAmountsHidden(true));
  expect(screen.getByText('Kostenmethode: gleitender Durchschnitt')).toBeTruthy();
  const chain = screen.getByRole('group', {
    name: 'Maßkette Portfolioleistung im gewählten Zeitraum',
  });
  expect(chain.textContent).not.toMatch(/114|100|14/);
  const explanations = screen.getByText('Kostenmethode: gleitender Durchschnitt').parentElement;
  expect(explanations?.textContent).not.toMatch(/11400|114,00|14,00/);
  expect(explanations?.innerHTML).not.toMatch(/11400|114,00|14,00/);
});

it('retains unavailable XIRR without inventing a zero return or an exclusive cause', async () => {
  const data = response();
  if (!data.portfolio.performance) throw new Error('Literal fixture lacks existing performance');
  data.portfolio.performance.xirr = null;
  await mount(data);
  const metric = screen.getByRole('button', { name: 'XIRR' }).closest('.performance-metric');
  expect(metric?.querySelector('dd')?.textContent).toContain('–');
  expect(metric?.querySelector('dd')?.textContent).not.toContain('0 %');
  expect(metric?.querySelector('dd')?.textContent).toContain('für diesen Zeitraum nicht verfügbar');
});
