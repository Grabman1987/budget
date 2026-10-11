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
import { createTestDatabase, createEntity, schema } from '@budget/db';
import { afterEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { MonthClosePage } from './month-close-page';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each(['2026-10', '2026-09'])(
  'defaults both account flows to the earlier of month end and today in %s',
  async (month) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T12:00:00+02:00'));
    vi.stubGlobal('scrollTo', () => {});
    const opened = createTestDatabase();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      for (const [id, type] of [
        ['cash', 'checking'],
        ['manual', 'p2p'],
      ] as const) {
        createEntity(
          opened.db,
          schema.account,
          {
            id,
            name: `Muster ${id}`,
            type,
            role: 'investment',
            openingDate: '2026-09-01',
            onBudget: type === 'checking',
          },
          { actor: 'test' },
        );
      }
      createEntity(
        opened.db,
        schema.appSetting,
        {
          id: `month_close.${month}`,
          value: JSON.stringify({ currentStep: 2, decisions: [] }),
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
      const route = createRoute({
        getParentRoute: () => root,
        path: '/close/$month',
        component: MonthClosePage,
      });
      const router = createRouter({
        routeTree: root.addChildren([route]),
        history: createMemoryHistory({ initialEntries: [`/close/${month}`] }),
      });
      const view = render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </QueryClientProvider>,
      );
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: 'Kontostand prüfen' }, { timeout: 10000 }),
      );
      const expected = month === '2026-10' ? '2026-10-11' : '2026-09-30';
      const displayDate = month === '2026-10' ? '11.10.2026' : '30.09.2026';
      expect((screen.getByLabelText('Stichtag') as HTMLInputElement).value).toBe(displayDate);
      expect(screen.queryByText('Stichtag liegt in der Zukunft.')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Einklappen' }));
      await user.click(screen.getByRole('button', { name: 'Wert aktualisieren' }));
      const date = screen.getByLabelText('Stichtag') as HTMLInputElement;
      expect(date.value).toBe(displayDate);
      const amount = screen.getByLabelText('Wert in EUR');
      await user.clear(amount);
      await user.type(amount, '-1');
      expect(screen.getByRole('button', { name: 'Wert speichern' }).hasAttribute('disabled')).toBe(
        true,
      );
      expect(screen.getByText('Der Wert darf nicht negativ sein.')).toBeTruthy();
      await user.clear(amount);
      await user.type(amount, '125,01');
      await user.click(screen.getByRole('button', { name: 'Wert speichern' }));
      await waitFor(() =>
        expect(opened.db.select().from(schema.valuation).get()).toMatchObject({
          date: expected,
          valueCents: 12501,
        }),
      );
      await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
      await waitFor(() =>
        expect(opened.db.select().from(schema.valuation).get()?.deletedAt).not.toBeNull(),
      );
      view.unmount();
    } finally {
      client.clear();
      opened.close();
    }
  },
);
