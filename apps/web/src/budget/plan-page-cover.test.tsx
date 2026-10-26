// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanMonthPage } from './plan-page';

/**
 * #587: the cover actions moved from the removed "N überzogen" chip into the Zu verteilen
 * disclosure. Both kinds stay reachable there: covering overspent rows and taking back an
 * over-assignment ("Zurücknehmen"), which writes the same assignment as before.
 */

vi.mock('../shell/app-link', () => ({
  AppLink: ({
    children,
    to,
    className,
  }: {
    children: ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

const category = (id: string, name: string) => ({
  id,
  name,
  icon: null,
  groupId: 'g',
  class: 'need',
  kind: 'variable',
  stage: 2,
  cardAccountId: null,
  rolloverOverspending: false,
  sortOrder: id === 'miete' ? 0 : 1,
  hiddenAt: null,
  splitCount: 0,
});
const envelope = (categoryId: string, assignedCents: number, activityCents: number) => {
  const availableCents = assignedCents + activityCents;
  return {
    categoryId,
    carryCents: 0,
    assignedCents,
    activityCents,
    availableCents,
    overspentCents: Math.max(0, -availableCents),
    cashOverspentCents: Math.max(0, -availableCents),
    creditOverspentCents: 0,
    fundedCardCents: 0,
    goalCents: 0,
    needCents: 0,
    dueMonth: null,
    target: null,
  };
};

/** Miete 50 € assigned, Essen 10 € assigned and 25 € spent; "Zu verteilen" is −30 €. */
const view = () => ({
  groups: [{ id: 'g', name: 'Alltag', sortOrder: 0 }],
  categories: [category('miete', 'Miete'), category('essen', 'Essen')],
  targets: [],
  summary: {
    month: '2026-09',
    carryInCents: 0,
    incomeCents: 3_000,
    uncoveredCents: 0,
    heldCents: 0,
    assignedCents: 6_000,
    activityCents: -2_500,
    availableCents: 3_500,
    toBeAssignedCents: -3_000,
    creditOverspentCents: 0,
    cashOverspentCents: 1_500,
    envelopes: [envelope('miete', 5_000, 0), envelope('essen', 1_000, -2_500)],
    cards: [],
  },
});

let writes: Array<{ method: string; path: string; body: unknown }> = [];

function renderPlan() {
  writes = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const route = path.split('?')[0]!;
      const method = init?.method ?? 'GET';
      if (method === 'GET' && route === '/api/expected/income')
        return Response.json({
          receivedCents: 2500,
          expectedCents: 10000,
          byPayment: [],
          byIncomeType: [],
        });
      if (method !== 'GET') {
        writes.push({ method, path: route, body: JSON.parse(String(init?.body ?? 'null')) });
        return new Response(JSON.stringify({ groupId: 'g-1' }), { status: 200 });
      }
      const body = route.startsWith('/api/budget/')
        ? view()
        : route === '/api/accounts'
          ? { accounts: [] }
          : route === '/api/expected'
            ? { payments: [] }
            : { groups: [], categories: [], targets: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  const root = createRootRoute({ component: () => <PlanMonthPage /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/plan/monat?monat=2026-09'] }),
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(fn, 0));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows no overspending chip in the head; the disclosure holds every cover action', async () => {
  const { container } = renderPlan();
  const figure = await screen.findByTestId('to-be-assigned');
  expect(figure.textContent).toBe('−30,00 €');
  expect(container.querySelector('.plan-chip-scroll')!.textContent).not.toMatch(/überzogen/);
  const panel = container.querySelector<HTMLElement>('#plan-chip-panel-0')!;
  expect(panel.hidden).toBe(true);

  const details = figure.closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await waitFor(() => expect(panel.hidden).toBe(false));
  expect(panel.textContent).toContain('1 Envelopes überzogen · 15,00 € zu decken');
  expect(panel.querySelector('#cover-all-source')).not.toBeNull();
  expect(panel.textContent).toContain('Zu viel zugewiesen · 30,00 € fehlen');
  expect(container.querySelector('tr.prow.is-over')!.textContent).toContain('Essen');
});

it('"Zurücknehmen" in the disclosure takes the over-assignment back from the lowest rows', async () => {
  const { container } = renderPlan();
  const figure = await screen.findByTestId('to-be-assigned');
  const details = figure.closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  const panel = container.querySelector<HTMLElement>('#plan-chip-panel-0')!;
  await waitFor(() => expect(panel.hidden).toBe(false));
  const back = Array.from(panel.querySelectorAll('button')).find(
    (b) => b.textContent === 'Zurücknehmen',
  )!;
  fireEvent.click(back);
  await waitFor(() => expect(writes).toHaveLength(1));
  // Same stage: the bottom row (Essen, 10 €) first, the remaining 20 € from Miete.
  expect(writes[0]).toEqual({
    method: 'PUT',
    path: '/api/budget/2026-09/assigned',
    body: {
      items: [
        { categoryId: 'essen', assignedCents: 0 },
        { categoryId: 'miete', assignedCents: 3_000 },
      ],
    },
  });
});
