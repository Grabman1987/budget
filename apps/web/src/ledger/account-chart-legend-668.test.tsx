// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
import { AccountRoute, CHART_OPEN_KEY } from './account-page';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

it('names the shown currency in the Cash-Saldo legend: account currency, then EUR (#668)', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T12:00:00+02:00'));
  localStorage.setItem(CHART_OPEN_KEY, '1');
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
        id: 'usd-konto',
        name: 'Muster Dollarkonto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        currency: 'USD',
        openingDate: '2026-09-30',
        openingBalanceCents: 10_000,
      })
      .run();
    opened.db
      .insert(schema.fxRate)
      .values([
        { currency: 'USD', date: '2026-09-30', rateMicro: 500_000, source: 'ecb' },
        { currency: 'USD', date: '2026-10-11', rateMicro: 750_000, source: 'ecb' },
      ])
      .run();
    const api = createLedgerApi({
      db: opened.db,
      today: () => '2026-10-11',
      stepUp: async (_c, next) => next(),
    });
    vi.stubGlobal('fetch', (path: string, options: RequestInit) =>
      api.request(path.replace(/^\/api/, ''), options),
    );
    const root = createRootRoute();
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/konten/$id', component: AccountRoute }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/konten/usd-konto'] }),
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const legend = async () => {
      await screen.findByTestId('account-chart-body', {}, { timeout: 10000 });
      await vi.waitFor(() => expect(container.querySelector('.legend')).not.toBeNull(), {
        timeout: 10000,
      });
      return container.querySelector('.legend')!.textContent ?? '';
    };
    expect(await legend()).toContain('Cash-Saldo · USD');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'EUR' }));
    const eurLegend = await legend();
    expect(eurLegend).toContain('Cash-Saldo · EUR');
    expect(eurLegend).not.toContain('USD');
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Kontowährung · USD' }));
    expect(await legend()).toContain('Cash-Saldo · USD');
  } finally {
    client.clear();
    opened.close();
  }
}, 30000);
