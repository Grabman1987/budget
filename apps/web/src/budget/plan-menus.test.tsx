// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanMonthPage } from './plan-page';

/**
 * #588: the toolbar menus "Verteilen ▾" and "Optionen ▾". The booking calls are the existing ones
 * (quick-assign, cover-all); only their home changed.
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

const category = (id: string, name: string, sortOrder: number) => ({
  id,
  name,
  icon: null,
  groupId: 'g',
  class: 'need',
  kind: 'variable',
  stage: 2,
  cardAccountId: null,
  rolloverOverspending: false,
  sortOrder,
  hiddenAt: null,
  splitCount: 0,
});
const envelope = (
  categoryId: string,
  assignedCents: number,
  activityCents: number,
  ghostCents = 0,
) => {
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
    quickAssign: {
      lastMonthCents: 0,
      averageCents: 0,
      ghostCents,
      ghostSource: 'median',
      historyMonths: ['2026-06', '2026-07', '2026-08'],
    },
  };
};

/** Miete 50 € assigned; Essen 10 € assigned, 25 € spent (overspent 15 €); Kino empty, 12 € ghost. */
const view = (toBeAssignedCents: number, overspent: boolean) => ({
  groups: [{ id: 'g', name: 'Alltag', sortOrder: 0 }],
  categories: [
    category('miete', 'Miete', 0),
    category('essen', 'Essen', 1),
    category('kino', 'Kino', 2),
  ],
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
    toBeAssignedCents,
    creditOverspentCents: 0,
    cashOverspentCents: overspent ? 1_500 : 0,
    envelopes: [
      envelope('miete', 5_000, 0),
      envelope('essen', 1_000, overspent ? -2_500 : -500),
      envelope('kino', 0, 0, 1_200),
    ],
    cards: [],
  },
});

let writes: Array<{ method: string; path: string; body: unknown }> = [];

function renderPlan(toBeAssignedCents: number, overspent = false) {
  writes = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const route = path.split('?')[0]!;
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        writes.push({ method, path: route, body: JSON.parse(String(init?.body ?? 'null')) });
        return new Response(
          JSON.stringify({ groupId: 'g-1', changedCount: 1, openCount: 0, missingCents: 0 }),
          { status: 200 },
        );
      }
      const body = route.startsWith('/api/budget/')
        ? view(toBeAssignedCents, overspent)
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

const summaryOf = (name: string) =>
  screen.getAllByText(name, { selector: 'summary' })[0] as HTMLElement;
const menu = (name: string) =>
  within(summaryOf(name).closest('details')!.querySelector<HTMLElement>('.plan-menu-panel')!);

it('replaces "Schnell zuweisen", the "Ansicht" select and the ⋯ menu by two named menus', async () => {
  const { container } = renderPlan(10_000);
  await screen.findByTestId('to-be-assigned');
  expect(summaryOf('Verteilen').textContent).toBe('Verteilen ▾');
  expect(summaryOf('Optionen').textContent).toBe('Optionen ▾');
  expect(screen.queryByText(/Schnell zuweisen/)).toBeNull();
  expect(screen.queryByLabelText('Weitere Monatsaktionen')).toBeNull();
  expect(container.querySelector('select')).toBeNull();
  expect(
    menu('Verteilen')
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Leere füllen', 'Wie letzter Monat', 'Ø 3 Monate', 'Ziel', 'Wasserfall-Assistent']);
});

it('"Leere füllen" and the selection actions use the existing quick-assign call', async () => {
  renderPlan(10_000);
  await screen.findByTestId('to-be-assigned');
  fireEvent.click(menu('Verteilen').getByRole('button', { name: 'Leere füllen' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    method: 'POST',
    path: '/api/budget/2026-09/quick-assign',
    body: { mode: 'empty', categoryIds: ['kino'] },
  });

  // Without a selection the per-category actions say why they are off and do not call anything.
  const last = menu('Verteilen').getByRole('button', { name: 'Wie letzter Monat' });
  expect(last.getAttribute('aria-disabled')).toBe('true');
  expect(last).toHaveProperty('disabled', false);
  expect(document.getElementById(last.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Erst Kategorien in der Liste auswählen',
  );
  fireEvent.click(last);
  expect(writes).toHaveLength(1);

  fireEvent.click(screen.getByRole('checkbox', { name: 'Essen auswählen' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Miete auswählen' }));
  // Opening the menu is not an outside click: the selection the actions work on stays.
  fireEvent.click(summaryOf('Verteilen'));
  expect(
    (screen.getByRole('checkbox', { name: 'Essen auswählen' }) as HTMLInputElement).checked,
  ).toBe(true);
  const expected = [
    ['Wie letzter Monat', 'last-month'],
    ['Ø 3 Monate', 'average'],
    ['Ziel', 'target'],
  ] as const;
  for (const [i, [label, mode]] of expected.entries()) {
    fireEvent.click(menu('Verteilen').getByRole('button', { name: label }));
    await waitFor(() => expect(writes).toHaveLength(2 + i));
    expect(writes[1 + i]).toEqual({
      method: 'POST',
      path: '/api/budget/2026-09/quick-assign',
      body: { mode, categoryIds: ['miete', 'essen'] },
    });
  }
});

it('"Überzogene decken" appears only when something is overspent and sends the cover-all call of the disclosure', async () => {
  const none = renderPlan(10_000);
  await screen.findByTestId('to-be-assigned');
  expect(menu('Verteilen').queryByRole('button', { name: 'Überzogene decken' })).toBeNull();
  none.unmount();

  const { container } = renderPlan(10_000, true);
  const figure = await screen.findByTestId('to-be-assigned');
  const item = menu('Verteilen').getByRole('button', { name: 'Überzogene decken' });
  expect(document.getElementById(item.getAttribute('aria-describedby')!)?.textContent).toContain(
    '1 überzogen',
  );
  fireEvent.click(item);
  await waitFor(() => expect(writes).toHaveLength(1));
  const fromMenu = writes[0];
  expect(fromMenu).toEqual({
    method: 'POST',
    path: '/api/budget/2026-09/move',
    body: { coverAll: true },
  });

  // The disclosure button (unchanged) sends exactly the same request.
  const details = figure.closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  const panel = container.querySelector<HTMLElement>('#plan-chip-panel-0')!;
  await waitFor(() => expect(panel.hidden).toBe(false));
  fireEvent.click(within(panel).getByRole('button', { name: /^Alle aus .* decken$/ }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(fromMenu);
});

it('says why "Wasserfall-Assistent" is off at 0 € and when too much is assigned', async () => {
  const zero = renderPlan(0);
  await screen.findByTestId('to-be-assigned');
  expect(summaryOf('Verteilen').getAttribute('title')).toBe('Nichts zu verteilen');
  const item = menu('Verteilen').getByRole('button', { name: 'Wasserfall-Assistent' });
  expect(item.getAttribute('aria-disabled')).toBe('true');
  expect(document.getElementById(item.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Nichts zu verteilen',
  );
  fireEvent.click(item);
  expect(screen.queryByText(/noch 0,00/)).toBeNull();
  zero.unmount();

  renderPlan(-3_000);
  await screen.findByTestId('to-be-assigned');
  expect(summaryOf('Verteilen').getAttribute('title')).toBe('Zu viel zugewiesen');
});

it('"Wasserfall-Assistent" starts the same distribution as "Geld verteilen"', async () => {
  renderPlan(10_000);
  await screen.findByTestId('to-be-assigned');
  fireEvent.click(menu('Verteilen').getByRole('button', { name: 'Wasserfall-Assistent' }));
  expect(await screen.findByText('noch 100,00 €')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Fertig' })).toBeTruthy();
});

it('opens with the arrow keys, walks the items and closes with Esc back on the summary', async () => {
  renderPlan(10_000);
  await screen.findByTestId('to-be-assigned');
  const summary = summaryOf('Verteilen');
  const details = summary.closest('details')!;
  summary.focus();
  fireEvent.keyDown(summary, { key: 'ArrowDown' });
  expect(details.open).toBe(true);
  const items = [...details.querySelectorAll<HTMLElement>('.plan-menu-panel button')];
  expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(items[1]);
  fireEvent.keyDown(items[1]!, { key: 'End' });
  expect(document.activeElement).toBe(items.at(-1));
  fireEvent.keyDown(items.at(-1)!, { key: 'ArrowUp' });
  expect(document.activeElement).toBe(items.at(-2));
  fireEvent.keyDown(items.at(-2)!, { key: 'Home' });
  expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(items[0]!, { key: 'Escape' });
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(summary);
});

it('closes when the focus leaves the menu, but not while it moves inside', async () => {
  renderPlan(10_000);
  await screen.findByTestId('to-be-assigned');
  const summary = summaryOf('Verteilen');
  const details = summary.closest('details')!;
  fireEvent.click(summary);
  details.open = true;
  const items = [...details.querySelectorAll<HTMLElement>('.plan-menu-panel button')];
  fireEvent.focusOut(items[0]!, { relatedTarget: items[1]! });
  expect(details.open).toBe(true);
  fireEvent.focusOut(items[1]!, { relatedTarget: summaryOf('Optionen') });
  expect(details.open).toBe(false);
});

it('"Optionen ▾" holds Ansicht (default Gruppen, no "Nur Überzogene"), Monate, collapse and Monatsabschluss', async () => {
  const { container } = renderPlan(10_000);
  await screen.findByTestId('to-be-assigned');
  const optionen = menu('Optionen');
  const ansicht = optionen.getByRole('group', { name: 'Ansicht' });
  expect(
    within(ansicht)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Gruppen', 'Wasserfall', 'Zeit', 'Klassen']);
  const pressed = (scope: ReturnType<typeof within>, name: string) =>
    scope.getByRole('button', { name }).getAttribute('aria-pressed');
  expect(pressed(within(ansicht), 'Gruppen')).toBe('true');
  expect(screen.queryByText('Nur Überzogene')).toBeNull();
  fireEvent.click(within(ansicht).getByRole('button', { name: 'Zeit' }));
  expect(pressed(within(ansicht), 'Zeit')).toBe('true');

  const months = optionen.getByRole('group', { name: 'Anzahl Monate' });
  expect(
    within(months)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['1 Monat', '2 Monate', '3 Monate']);
  expect(pressed(within(months), '1 Monat')).toBe('true');

  expect(container.querySelectorAll('tr.pgroup:not(.is-collapsed)').length).toBeGreaterThan(0);
  fireEvent.click(optionen.getByRole('button', { name: 'Alle einklappen' }));
  expect(container.querySelectorAll('tr.pgroup:not(.is-collapsed)')).toHaveLength(0);
  expect(menu('Optionen').getByRole('button', { name: 'Alle ausklappen' })).toBeTruthy();

  expect(
    menu('Optionen')
      .getByRole('link', { name: 'Monatsabschluss starten oder fortsetzen' })
      .getAttribute('href'),
  ).toBe('/monatsabschluss/2026-09');
  // The visible "Monat abschließen" action of #587 stays.
  expect(screen.getByRole('link', { name: 'Monat abschließen' })).toBeTruthy();
});
