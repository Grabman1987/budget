// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { NetWorthContent } from './networth-page';
import { netWorthQuery, type NetWorthView } from './api';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 640] }));
vi.mock('./networth-chart', () => ({ NetWorthChart: () => <div data-testid="nw-chart" /> }));
vi.mock('../shell/app-link', () => ({ AppLink: () => null }));
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ zeitraum: 'YTD' }),
  useNavigate: () => vi.fn(),
}));
afterEach(cleanup);

function renderContent(dedupe: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(netWorthQuery('YTD').queryKey, {
    period: 'YTD',
    from: '2025-12-31',
    to: '2026-09-17',
    chain: {
      nowCents: 20500,
      startCents: 10000,
      deltaCents: 10500,
      ownCents: 8000,
      marketCents: 2500,
    },
    daily: [],
    bars: { unit: 'month', buckets: [] },
    composition: { assets: [], debts: [] },
  } as unknown as NetWorthView);
  render(
    <QueryClientProvider client={client}>
      <NetWorthContent inReport dedupe={dedupe} />
    </QueryClientProvider>,
  );
}

it('keeps the Maßkette and figure in the report detail unless the report already shows them', () => {
  renderContent(false);
  expect(screen.getByRole('group', { name: 'Maßkette Nettovermögen im Zeitraum' })).toBeTruthy();
  expect(screen.getByTestId('nw-figure')).toBeTruthy();
  cleanup();
  renderContent(true);
  expect(screen.queryByRole('group', { name: 'Maßkette Nettovermögen im Zeitraum' })).toBeNull();
  expect(screen.queryByTestId('nw-figure')).toBeNull();
  expect(screen.getByTestId('nw-chart')).toBeTruthy();
});
