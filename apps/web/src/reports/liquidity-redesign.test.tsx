// @vitest-environment jsdom
import { createTestDatabase, schema } from '@budget/db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { liquidityQuery } from './liquidity-api';
import { LiquidityReportPage } from './liquidity-report';
import { PLAN_PROGNOSE } from '../nav/pages';
import { LIQUIDITY_FORECAST } from '../nav/reports-catalog';
import type * as LiquiditySelection from './liquidity-selection';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/use-month', () => ({ useMonth: () => ['2026-10', vi.fn(), vi.fn()] }));
vi.mock('./liquidity-selection', async (importOriginal) => ({
  ...(await importOriginal<typeof LiquiditySelection>()),
  useLiquiditySelection: () => ({
    horizon: '35d',
    levers: [],
    setHorizon: vi.fn(),
    setLevers: vi.fn(),
  }),
}));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('./liquidity-chart', () => ({ LiquidityChart: () => null }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('ON retains the shared 35-day result, source date and all horizon controls; tools remain open across a refetch', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const opened = createTestDatabase();
  opened.db
    .insert(schema.account)
    .values({
      id: 'funds',
      name: 'Synthetic forecast funds',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-10-01',
      openingBalanceCents: 10_001,
    })
    .run();
  const api = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-15',
    stepUp: async (_c, next) => next(),
  });
  const response = await api.request('/liquidity?horizon=35d');
  const data = await response.json();
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(liquidityQuery('35d', []).queryKey, data);
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    expect(options?.method ?? 'GET').toBe('GET');
    return api.request(path.replace(/^\/api/, ''), options);
  });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <LiquidityReportPage report={LIQUIDITY_FORECAST} meta={PLAN_PROGNOSE} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByTestId('liq-low').textContent).toBe('100,01 €');
  expect(screen.getByText(/Stand 15.10.2026/)).toBeTruthy();
  expect(
    screen.getByRole('combobox', { name: 'Prognosezeitraum' }).querySelectorAll('option'),
  ).toHaveLength(4);
  const tools = container.querySelector<HTMLDetailsElement>('details.rf-tools')!;
  expect(tools.open).toBe(false);
  act(() => {
    tools.open = true;
    fireEvent(tools, new Event('toggle'));
  });
  act(() => client.setQueryData(liquidityQuery('35d', []).queryKey, structuredClone(data)));
  expect(tools.open).toBe(true);
  expect(screen.getByTestId('liq-low').textContent).toBe('100,01 €');
  cleanup();
  await client.cancelQueries();
  client.clear();
  opened.close();
});
