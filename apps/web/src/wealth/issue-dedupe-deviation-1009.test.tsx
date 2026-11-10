// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { WealthOverview } from './redesign-overview';
import { accountsQuery } from '../ledger/queries';
import { allocationQuery } from './allocation-api';
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
  AppLink: ({
    children,
    to,
    'aria-label': label,
  }: {
    children: React.ReactNode;
    to: string;
    'aria-label'?: string;
  }) => (
    <a href={to} aria-label={label}>
      {children}
    </a>
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

it('shows the Ist vs. Ziel column and pill when an asset type has a real target deviation', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const seed = (key: readonly unknown[], value: unknown) => client.setQueryData(key, value);
  seed(accountsQuery().queryKey, { asOf: '2026-09-17', accounts: [] });
  seed(allocationQuery().queryKey, {
    valueCents: 10000,
    quality: { confidence: 'exact' },
    classes: [{ id: 'c1', name: 'Krypto', assignedSecurities: [{ kind: 'crypto' }] }],
    risk: {
      allocation: {
        rows: [
          { assetClass: 'c1', side: 'under', targetBp: 5000, deviationBp: -200, gapCents: 200 },
        ],
      },
    },
  });
  seed(netWorthQuery('2026-09..2026-09').queryKey, {
    period: 'YTD',
    from: '2025-12-31',
    to: '2026-09-17',
    chain: { nowCents: 20500, startCents: 20500, deltaCents: 0, ownCents: 0, marketCents: 0 },
    composition: {
      assets: [{ accountId: 'synthetic', valueCents: 23500 }],
      debts: [{ valueCents: -3000 }],
    },
    assetComposition: {
      groups: [
        {
          key: 'crypto',
          label: 'Krypto',
          valueCents: 10000,
          shareBp: 5000,
          accounts: [{ accountId: 'synthetic', name: 'Konto', valueCents: 10000 }],
        },
      ],
      accounts: [],
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
  expect(screen.getByRole('table').textContent).toContain('Ist vs. Ziel');
  expect(screen.getByText(/Pp zum Ziel/)).toBeTruthy();
  client.clear();
});
