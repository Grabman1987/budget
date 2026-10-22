// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { ToastProvider } from '@budget/ui';
import { createTestDatabase, schema } from '@budget/db';
import { afterEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { validateLiquiditySearch } from '../reports/liquidity-selection';
import { AccountRoute } from './account-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

it('represents the linked 35-day account forecast and lets users return to it (#568/#569)', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const opened = createTestDatabase();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    opened.db
      .insert(schema.account)
      .values({
        id: 'forecast-account',
        name: 'Synthetic forecast account',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        currency: 'EUR',
        openingDate: '2026-09-17',
        openingBalanceCents: 100_000,
      })
      .run();
    const api = createLedgerApi({
      db: opened.db,
      today: () => '2026-09-17',
      stepUp: async (_c, next) => next(),
    });
    const series: string[] = [];
    vi.stubGlobal('fetch', (path: string, options?: RequestInit) => {
      if (path.includes('/series?')) series.push(path);
      return api.request(path.replace(/^\/api/, ''), options);
    });
    const root = createRootRoute();
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({
          getParentRoute: () => root,
          path: '/konten/$id',
          component: AccountRoute,
          validateSearch: (search: Record<string, unknown>) => ({
            ...validateLiquiditySearch(search),
            vorschau: search['vorschau'] === 'liquiditaet' ? 'liquiditaet' : undefined,
          }),
        }),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/konten/forecast-account?vorschau=liquiditaet&horizon=35d&levers='],
      }),
    });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const select = await screen.findByRole('combobox', { name: 'Kontovorschau Zeitraum' });
    await waitFor(() => expect(select).toHaveProperty('value', '35d'));
    expect(screen.getByRole('option', { name: 'Liquidität · 35 Tage' })).toHaveProperty(
      'selected',
      true,
    );
    await waitFor(() =>
      expect(
        series.some(
          (path) => new URL(path, 'http://localhost').searchParams.get('horizon') === '35d',
        ),
      ).toBe(true),
    );
    await userEvent.setup().selectOptions(select, '90d');
    await waitFor(() => expect(select).toHaveProperty('value', '90d'));
    await userEvent.setup().selectOptions(select, '35d');
    await waitFor(() => expect(select).toHaveProperty('value', '35d'));
    expect(router.state.location.search).toMatchObject({
      horizon: '35d',
      vorschau: 'liquiditaet',
      levers: '',
    });
  } finally {
    cleanup();
    client.clear();
    opened.close();
  }
});
