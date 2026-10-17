// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanMonthPage } from './plan-page';

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

const view = (toBeAssignedCents: number) => ({
  groups: [],
  categories: [],
  targets: [],
  summary: {
    month: '2026-09',
    carryInCents: 0,
    incomeCents: 10_000,
    uncoveredCents: 0,
    heldCents: 0,
    assignedCents: 10_000 - toBeAssignedCents,
    activityCents: 0,
    availableCents: 0,
    toBeAssignedCents,
    creditOverspentCents: 0,
    cashOverspentCents: 0,
    envelopes: [],
    cards: [],
  },
});

function renderPlan(toBeAssignedCents: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      const route = path.split('?')[0]!;
      const body = route.startsWith('/api/budget/')
        ? view(toBeAssignedCents)
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows a positive "Zu verteilen" as is-positive and keeps "Geld verteilen" on without a hint', async () => {
  renderPlan(12_345);
  const figure = await screen.findByTestId('to-be-assigned');
  expect(figure.textContent).toBe('123,45 €');
  expect(figure.closest('summary')!.className).toMatch(/is-positive/);
  expect(
    (screen.getByRole('button', { name: 'Geld verteilen' }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(screen.queryByTestId('distribute-hint')).toBeNull();
});

it('marks a negative "Zu verteilen" red and says why "Geld verteilen" is off', async () => {
  renderPlan(-5_000);
  const figure = await screen.findByTestId('to-be-assigned');
  expect(figure.closest('summary')!.className).toMatch(/is-negative/);
  const button = screen.getByRole('button', { name: 'Geld verteilen' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(screen.getByTestId('distribute-hint').textContent).toBe('Zu viel zugewiesen');
  expect(button.getAttribute('aria-describedby')).toBe('plan-distribute-hint');
});

it('keeps zero neutral with the reason "Nichts zu verteilen"', async () => {
  renderPlan(0);
  const figure = await screen.findByTestId('to-be-assigned');
  expect(figure.closest('summary')!.className).not.toMatch(/is-positive|is-negative/);
  expect(screen.getByTestId('distribute-hint').textContent).toBe('Nichts zu verteilen');
});

it('offers "Monat abschließen" as a visible link to the shown month, no position numbers', async () => {
  const { container } = renderPlan(0);
  await screen.findByTestId('to-be-assigned');
  const close = screen.getByRole('link', { name: 'Monat abschließen' });
  expect(close.getAttribute('href')).toBe('/monatsabschluss/2026-09');
  expect(close.closest('details')).toBeNull();
  expect(container.querySelector('.ptable .col-pos, .ptable .grp-no')).toBeNull();
});
