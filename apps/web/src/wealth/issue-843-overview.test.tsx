// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { WealthOverview } from './redesign-overview';
import { netWorthQuery } from './api';
import { freedomQuery } from './freedom-api';
import { savingsProposalsQuery } from './savings-api';
import { portfolioContributionsQuery, portfolioPerformanceQuery } from './portfolio-api';

vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({
    children,
    pageNavigation,
  }: {
    children: React.ReactNode;
    pageNavigation?: React.ReactNode;
  }) => (
    <>
      {pageNavigation}
      {children}
    </>
  ),
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('../nav/page-menu', () => ({ PageMenu: () => <div>Übersicht</div> }));
vi.mock('../ledger/account-form', () => ({ AccountFormPanel: () => null }));
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ zeitraum: 'YTD' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
afterEach(cleanup);

it('leads with net worth, preserves signed selected basis and never invents a world benchmark', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const seed = (key: readonly unknown[], value: unknown) => client.setQueryData(key, value);
  seed(netWorthQuery('YTD').queryKey, {
    period: 'YTD',
    from: '2025-12-31',
    to: '2026-09-17',
    chain: { nowCents: 20500, startCents: 20500, deltaCents: 0, ownCents: 0, marketCents: 0 },
    composition: {
      assets: [{ accountId: 'synthetic', valueCents: 23500 }],
      debts: [{ valueCents: -3000 }],
    },
  });
  seed(freedomQuery().queryKey, {
    asOf: '2026-09-17',
    investedCents: 17000,
    progressBp: null,
    multiple: 25,
  });
  seed(savingsProposalsQuery().queryKey, { proposals: [] });
  seed(portfolioContributionsQuery('YTD').queryKey, {
    portfolio: { contributionHistory: null },
  });
  seed(portfolioPerformanceQuery('YTD').queryKey, {
    portfolio: {
      asOf: '2026-09-17',
      performance: { ttwror: 0.12, to: '2026-09-17' },
      benchmarks: [{ id: 'benchmark-sp500', name: 'S&P 500', benchmarkReturn: 0.1 }],
    },
  });
  render(
    <QueryClientProvider client={client}>
      <WealthOverview />
    </QueryClientProvider>,
  );
  expect(screen.getByTestId('wealth-net-value').textContent).toBe('205,00 €');
  expect(screen.getByTestId('wealth-invested').textContent).toBe('170,00 €');
  expect(screen.getByText('Benchmark auswählen')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Weltaktienvergleich YTD' }).textContent).toContain(
    'Nicht verfügbar',
  );
  expect(screen.queryByText('S&P 500')).toBeNull();
  expect(screen.getByText('Nettovermögen und Verlauf im Detail').getAttribute('href')).toBe(
    '/vermoegen/nettovermoegen',
  );
  client.clear();
});
