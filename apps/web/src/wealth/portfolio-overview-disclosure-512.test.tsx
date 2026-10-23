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
import { PortfolioOverview } from './portfolio-overview';
import { portfolioPerformanceQuery } from './portfolio-api';
import type { WithValuationNotes } from '../ledger/valuation-hint';
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
  client.setQueryData(portfolioPerformanceQuery('1M').queryKey, data);
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
        path: '/vermoegen/portfolio',
        validateSearch: (search: Record<string, unknown>) => search,
        component: PortfolioOverview,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/reports/gruppe/portfolio',
        component: () => <p>Reportkatalog-Ziel</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/vermoegen/portfolio?zeitraum=1M'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const region = await screen.findByRole('region', { name: 'Portfolioentwicklung' });
  const user = userEvent.setup();
  await user.click(region.querySelector('summary')!);
  return { region, router, user };
}

it('explains the SAME response method and period inside the existing compact disclosure', async () => {
  const data = response({ fifo: true, history: true });
  expect(data.portfolio.valueCents).toBe(11400);
  expect(data.portfolio.performanceHistory?.dailyValues.at(-1)?.valueCents).toBe(11400);
  const before = JSON.stringify(data);
  const { region, router, user } = await mount(data);
  expect(within(region).getByText('Kostenmethode: FIFO')).toBeTruthy();
  expect(within(region).getByText(/Stichtag.*20\.09\.2026/)).toBeTruthy();
  expect(region.textContent).toContain('20.08.2026');
  expect(region.textContent).toContain('20.09.2026');
  expect(within(region).getByTestId('portfolio-overview-chart')).toBeTruthy();
  expect(JSON.stringify(data)).toBe(before);
  await user.click(within(region).getByRole('link', { name: 'Reportkatalog Portfolio öffnen' }));
  expect(router.state.location.pathname).toBe('/reports/gruppe/portfolio');
});

it('does not infer selected-period return quality from unrelated current cash FX', async () => {
  const data = response({ cashGap: true, history: true });
  expect(data.portfolio.quality.missingFxAccountIds).toEqual(['unrelated-usd-cash']);
  const { region } = await mount(data);
  expect(within(region).getByText(/Allokationsstand.*20\.09\.2026/)).toBeTruthy();
  expect(within(region).getByText(/Wechselkurs fehlt/)).toBeTruthy();
  expect(region.querySelector('summary')?.textContent).not.toContain('≈');
  expect(region.textContent).not.toContain('USD/EUR vom');
});

it('keeps response historical bounds even when current allocation is exact and private money is hidden', async () => {
  const data = response({ history: true });
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
  };
  data.incomplete = [
    {
      securityId: 'historic-cost',
      name: 'Historische Schätzung',
      quality: 'estimated',
      from: '2026-08-21',
      to: '2026-08-23',
    },
  ];
  const before = JSON.stringify(data);
  const { region } = await mount(data);
  expect(within(region).getByText(/Historische Schätzung/)).toBeTruthy();
  expect(within(region).getByText(/21\.08\.2026.*23\.08\.2026/)).toBeTruthy();
  expect(within(region).getByText(/nicht jeder Tag/)).toBeTruthy();
  act(() => setAmountsHidden(true));
  const explanation = within(region).getByText(
    'Kostenmethode: gleitender Durchschnitt',
  ).parentElement;
  expect(explanation?.textContent).not.toMatch(/11400|114,00|100,00|14,00/);
  expect(explanation?.innerHTML).not.toMatch(/11400|114,00|100,00|14,00/);
  expect(JSON.stringify(data)).toBe(before);
});
