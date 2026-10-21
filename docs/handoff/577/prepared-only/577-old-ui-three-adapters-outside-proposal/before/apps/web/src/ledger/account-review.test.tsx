// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
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
import {
  createTestDatabase,
  createEntity,
  createBooking,
  reconcileAccount,
  schema,
} from '@budget/db';
import { afterEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { OverviewPage } from './overview-page';
import { AccountRoute } from './account-page';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('shows type-specific due and quiet review dates and updates a manual account with undo', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T12:00:00+02:00'));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const opened = createTestDatabase();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let view: ReturnType<typeof render> | undefined;
  try {
    for (const [id, type] of [
      ['stale', 'checking'],
      ['fresh', 'loan'],
      ['quiet', 'checking'],
      ['never', 'brokerage'],
      ['value', 'p2p'],
      ['asset', 'other_asset'],
    ] as const) {
      createEntity(
        opened.db,
        schema.account,
        {
          id,
          name: `Muster ${id}`,
          type,
          role: 'investment',
          onBudget: false,
          openingDate: '2026-09-01',
        },
        { actor: 'test' },
      );
    }
    for (const [id, date] of [
      ['stale', '2026-09-06'],
      ['fresh', '2026-09-07'],
      ['quiet', '2026-09-06'],
    ]) {
      reconcileAccount(
        opened.db,
        { accountId: id!, date: date!, statementBalanceCents: 0, today: '2026-10-11' },
        { actor: 'test' },
      );
    }
    createEntity(
      opened.db,
      schema.valuation,
      { accountId: 'value', date: '2026-09-06', valueCents: 12501 },
      { actor: 'test' },
    );
    for (const accountId of ['stale', 'value'])
      for (const amountCents of [1, -1])
        createBooking(
          opened.db,
          {
            accountId,
            date: '2026-09-08',
            amountCents,
            status: 'pending',
            splits: [{ categoryId: null, amountCents }],
          },
          { actor: 'test' },
        );
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
        createRoute({ getParentRoute: () => root, path: '/konten', component: OverviewPage }),
        createRoute({ getParentRoute: () => root, path: '/konten/$id', component: AccountRoute }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/konten'] }),
    });
    view = render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await screen.findByRole('link', { name: 'Muster stale' }, { timeout: 10000 });
    expect(screen.getByText('Fällig · geprüft am 06.09.2026').classList.contains('is-stale')).toBe(
      true,
    );
    expect(screen.getByText('geprüft am 06.09.2026').classList.contains('is-stale')).toBe(false);
    expect(screen.getByText('geprüft am 07.09.2026').classList.contains('is-stale')).toBe(false);
    expect(screen.getByText('Fällig · Wert vom 06.09.2026').classList.contains('is-stale')).toBe(
      true,
    );
    expect(screen.getAllByText('nie geprüft')).toHaveLength(2);
    await user.click(screen.getByRole('link', { name: 'Muster value' }));
    await user.click(await screen.findByRole('button', { name: 'Wert aktualisieren' }));
    expect(screen.queryByRole('button', { name: 'Kontostand prüfen' })).toBeNull();
    expect(screen.getByText(/Letzter Wert: 125,01 €/)).toBeTruthy();
    expect((screen.getByLabelText('Stichtag') as HTMLInputElement).value).toBe('11.10.2026');
    const amount = screen.getByLabelText('Wert in EUR');
    await user.clear(amount);
    await user.type(amount, '150,02');
    await user.click(screen.getByRole('button', { name: 'Wert speichern' }));
    await screen.findByText(/Letzter Wert: 150,02 €/);
    await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
    await waitFor(() => expect(screen.getByText(/Letzter Wert: 125,01 €/)).toBeTruthy());
  } finally {
    view?.unmount();
    client.clear();
    opened.close();
  }
});
