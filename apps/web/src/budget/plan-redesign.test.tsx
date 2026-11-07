// @vitest-environment jsdom
import { setAmountsHidden, ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanMonthPage } from './plan-page';
import type { BudgetMonthView, EnvelopeSummary } from './budget-api';
import { setMonthSpan } from './month-span';
import { isMonth } from '../nav/month';
import { validatePlanFilterSearch } from './plan-filters';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../shell/redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return flag.enabled;
  },
}));

const envelope = (id: string, values: Partial<EnvelopeSummary>): EnvelopeSummary => ({
  categoryId: id,
  carryCents: 0,
  assignedCents: 0,
  activityCents: 0,
  availableCents: 0,
  overspentCents: 0,
  cashOverspentCents: 0,
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents: 0,
  dueMonth: null,
  target: null,
  ...values,
});
const target = {
  id: 'target',
  categoryId: 'goal',
  kind: 'keep_balance' as const,
  amountCents: 10000,
  everyMonths: 1,
  targetDate: null,
  dueDay: null,
  validFrom: '2026-09',
};
// Carry already funds 90 EUR of this target; the server's monthly goal is 10 EUR.
const envelopes = [
  envelope('goal', {
    carryCents: 9000,
    assignedCents: 2000,
    availableCents: 11000,
    goalCents: 1000,
    target,
  }),
  envelope('open', {
    assignedCents: 1000,
    availableCents: 1000,
    goalCents: 2000,
    needCents: 1000,
    target: { ...target, categoryId: 'open' },
  }),
  envelope('met', {
    assignedCents: 2000,
    availableCents: 500,
    activityCents: -1500,
    goalCents: 2000,
    target: { ...target, categoryId: 'met' },
  }),
  envelope('cash', {
    activityCents: -700,
    availableCents: -700,
    overspentCents: 700,
    cashOverspentCents: 700,
  }),
  envelope('credit', {
    activityCents: -300,
    availableCents: -300,
    overspentCents: 300,
    creditOverspentCents: 300,
  }),
  envelope('zero', {}),
];
const data: BudgetMonthView = {
  groups: [{ id: 'group', name: 'Synthetic group', sortOrder: 0 }],
  categories: envelopes.map((row, sortOrder) => ({
    id: row.categoryId,
    name: `Synthetic ${row.categoryId}`,
    icon: null,
    groupId: 'group',
    class: 'need' as const,
    kind: 'variable' as const,
    stage: 2,
    cardAccountId: null,
    rolloverOverspending: false,
    sortOrder,
    hiddenAt: null,
    splitCount: 0,
  })),
  summary: {
    month: '2026-09',
    carryInCents: 9000,
    incomeCents: 10000,
    uncoveredCents: 0,
    heldCents: 0,
    assignedCents: 5000,
    activityCents: -2500,
    availableCents: 11500,
    toBeAssignedCents: 14000,
    creditOverspentCents: 300,
    cashOverspentCents: 700,
    envelopes,
    cards: [],
  },
};
let client: QueryClient;
let writes: string[];
beforeEach(() => {
  flag.enabled = true;
  setMonthSpan(1);
  localStorage.clear();
  writes = [];
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const method = init?.method ?? 'GET';
    if (method !== 'GET') writes.push(`${method} ${url.pathname}`);
    if (url.pathname === '/api/budget/2026-09') return Response.json(data);
    if (url.pathname === '/api/expected/income')
      return Response.json({
        receivedCents: 2500,
        expectedCents: 30000,
        byPayment: [],
        byIncomeType: [],
      });
    if (url.pathname === '/api/accounts') return Response.json({ accounts: [] });
    if (url.pathname === '/api/categories') return Response.json({ ...data, targets: [] });
    if (url.pathname === '/api/expected') return Response.json({ payments: [] });
    if (url.pathname === '/api/auth/status')
      return Response.json({
        authenticated: true,
        setupRequired: false,
        viaRecovery: false,
        stepUpValidUntil: null,
      });
    return Response.json({ error: 'unexpected_test_request' }, { status: 404 });
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await client.cancelQueries();
  cleanup();
  client.clear();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
  expect(writes).toEqual([]);
});
function mount() {
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      monat: isMonth(search['monat']) ? search['monat'] : undefined,
    }),
  });
  const plan = createRoute({
    getParentRoute: () => root,
    path: '/plan/monat',
    validateSearch: validatePlanFilterSearch,
    component: PlanMonthPage,
  });
  const income = createRoute({
    getParentRoute: () => root,
    path: '/plan/monat/einnahmen',
    component: () => <h1>Synthetic income destination</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([plan, income]),
    history: createMemoryHistory({ initialEntries: ['/plan/monat?monat=2026-09'] }),
  });
  return {
    router,
    ...render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

it('ON leads with class assignments and keeps the literal cent derivation in the amount disclosure', async () => {
  const { router } = mount();
  const lead = await screen.findByRole('region', { name: 'Monatsbudget' });
  expect(lead.textContent).toContain('Monatszuweisung · September 2026');
  expect(lead.textContent).toContain('140,00 €');
  const classes = within(lead).getByRole('group', { name: 'Zuweisungen nach Klasse' });
  expect(classes.textContent).toMatch(/Bedarf.*50,00.*Wunsch.*0,00.*Zukunft.*0,00/);
  const summary = lead.querySelector('summary.plan-tba')!;
  summary.parentElement!.setAttribute('open', '');
  fireEvent(summary.parentElement!, new Event('toggle'));
  const chain = await within(lead).findByRole('group', { name: 'Maßkette Zu verteilen' });
  expect(chain.textContent).toMatch(
    /Übertrag.*90,00.*Einnahmen.*100,00.*Zugewiesen.*50,00.*Zu verteilen.*140,00/,
  );
  fireEvent.click(within(chain).getByRole('button', { name: /Einnahmen/ }));
  await screen.findByRole('heading', { name: 'Synthetic income destination' });
  expect(router.state.location.search).toEqual({ monat: '2026-09' });
});

it('ON distinguishes target, cash, credit and zero states using canonical monthly fields, including the selected inspector', async () => {
  const { container } = mount();
  await screen.findByRole('button', { name: 'Synthetic goal' });
  const row = (id: string) =>
    container.querySelector(`.pname[data-category-id="${id}"]`)!.closest('tr')!;
  for (const [id, text] of [
    ['goal', 'Mehr als Ziel'],
    ['open', 'Offen'],
    ['met', 'Ziel erfüllt'],
    ['cash', 'Überzogen'],
    ['credit', 'Neue Kartenschuld'],
    ['zero', 'Kein verfügbares Geld'],
  ] as const) {
    expect(row(id).textContent).toContain(text);
    expect(row(id).querySelector('.plan-row-state svg')).not.toBeNull();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Synthetic goal' }));
  expect(
    (await screen.findByRole('complementary', { name: 'Plan-Inspektor' })).textContent,
  ).toContain('Mehr als Ziel');
  act(() => setAmountsHidden(true));
  expect(screen.getByRole('region', { name: 'Monatsbudget' }).textContent).not.toContain('140,00');
  expect(row('cash').textContent).not.toContain('7,00');
});

it('OFF retains the original compact head and original unadorned values', async () => {
  flag.enabled = false;
  const { container } = mount();
  expect((await screen.findByTestId('to-be-assigned')).textContent).toBe('140,00 €');
  expect(screen.queryByRole('region', { name: 'Monatsbudget' })).toBeNull();
  expect(container.querySelector('.plan-row-state')).toBeNull();
  expect(screen.getByRole('button', { name: 'Geld verteilen' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Synthetic cash decken' }).querySelector('svg'),
  ).not.toBeNull();
});

it('ON desktop keeps exact spending hints and moves the named cover action onto the available pill', async () => {
  const { container } = mount();
  await screen.findByRole('button', { name: 'Synthetic met' });
  const row = (id: string) =>
    container.querySelector(`.pname[data-category-id="${id}"]`)!.closest('tr')!;
  expect(row('met').querySelector('.plan-spending-copy')!.textContent).toBe('15,00 von 20,00');
  expect(row('cash').querySelector('.plan-spending-copy')!.textContent).toBe('Überzogen 7,00');
  const cover = within(row('cash')).getByRole('button', { name: 'Synthetic cash decken' });
  const amountId = cover.getAttribute('aria-describedby')!;
  expect(document.getElementById(amountId)!.textContent).toBe('−7,00 €');
  expect(cover.parentElement!.classList.contains('plan-available-action')).toBe(true);
  expect(cover.querySelector('svg')).toBeNull();
  expect(row('credit').querySelector('.pill')!.getAttribute('title')).toBe('neue Kartenschuld');
  fireEvent.click(cover);
  const inspector = await screen.findByRole('complementary', { name: 'Plan-Inspektor' });
  expect(within(inspector).getByRole('heading', { name: 'Synthetic cash' })).toBeTruthy();
  expect(within(inspector).getByRole('button', { name: 'Mit 7,00 € decken' })).toBeTruthy();
});

it('ON phone separates a singleton group heading and its available sum from the member row', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /max-width: (767|1179)px/.test(query),
    addEventListener() {},
    removeEventListener() {},
  }));
  const fetchFixture = fetch;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    if (new URL(input, 'http://localhost').pathname === '/api/budget/2026-09')
      return Promise.resolve(
        Response.json({
          ...data,
          groups: [...data.groups, { id: 'single', name: 'Synthetic singleton', sortOrder: 1 }],
          categories: data.categories.map((category) =>
            category.id === 'goal' ? { ...category, groupId: 'single' } : category,
          ),
        }),
      );
    return fetchFixture(input, init);
  });
  const { container } = mount();
  const toggle = await screen.findByRole('button', { name: 'Synthetic singleton' });
  const heading = toggle.closest('tr')!;
  expect(heading.classList.contains('prow')).toBe(false);
  expect(heading.querySelector('.plan-group-available')!.textContent).toBe('Verfügbar 110,00 €');
  expect(heading.nextElementSibling!.querySelector('.pname')!.textContent).toBe('Synthetic goal');
  expect(container.querySelector('.pgroup.psingle')).toBeNull();
  fireEvent.click(toggle);
  expect(screen.queryByRole('button', { name: 'Synthetic goal' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Synthetic singleton' }));
  expect(await screen.findByRole('button', { name: 'Synthetic goal' })).toBeTruthy();
});

it('ON phone separates actual assignment, quick-assign suggestion, and available balance labels', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /max-width: (767|1179)px/.test(query),
    addEventListener() {},
    removeEventListener() {},
  }));
  const quickAssign = {
    lastMonthCents: 0,
    averageCents: 0,
    ghostCents: 89000,
    ghostSource: 'target' as const,
    historyMonths: ['2026-06', '2026-07', '2026-08'],
  };
  const phoneData: BudgetMonthView = {
    ...data,
    categories: data.categories.map((category) =>
      category.id === 'zero' ? { ...category, name: 'Miete' } : category,
    ),
    summary: {
      ...data.summary,
      activityCents: 15102,
      availableCents: 29102,
      envelopes: data.summary.envelopes.map((row) =>
        row.categoryId === 'zero'
          ? { ...row, activityCents: 17602, availableCents: 17602, quickAssign }
          : row,
      ),
    },
  };
  const fetchFixture = fetch;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    if (new URL(input, 'http://localhost').pathname === '/api/budget/2026-09')
      return Promise.resolve(Response.json(phoneData));
    return fetchFixture(input, init);
  });

  mount();
  const category = await screen.findByRole('button', { name: 'Miete' });
  const row = category.closest('tr')!;
  expect(row.querySelector('.phone-assigned')!.textContent).toBe(
    'Zugewiesen 0,00 € · Vorschlag ≈ 890,00 €',
  );
  expect(
    within(row).getByRole('button', {
      name: 'Details für Miete öffnen · Verfügbar 176,02 €',
    }),
  ).toBeTruthy();
});

it('ON phone keeps month read utilities reachable through native menu keyboard navigation and returns to the income inspector without writes', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /max-width: (767|1179)px/.test(query),
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  mount();
  await screen.findByTestId('to-be-assigned');
  const summary = screen.getByText('Optionen', { selector: 'summary' });
  const menu = summary.closest('details')!;
  summary.focus();
  fireEvent.keyDown(summary, { key: 'ArrowDown' });
  expect(menu.open).toBe(true);
  const utilities = within(menu).getByRole('group', { name: 'Monatsdetails' });
  expect(utilities.textContent).toContain('0 vorgemerkt / ohne Kategorie');
  const missing = within(utilities).getByRole('link', { name: 'Ohne Kategorie öffnen' });
  const pending = within(utilities).getByRole('link', { name: 'Unbestätigte öffnen' });
  const missingUrl = new URL(missing.getAttribute('href')!, 'http://localhost');
  expect(missingUrl.pathname).toBe('/konten/buchungen');
  expect(missingUrl.searchParams.get('von')).toBe('2026-09-01');
  expect(missingUrl.searchParams.get('bis')).toBe('2026-09-30');
  expect(missingUrl.searchParams.get('kategorie')).toBe('none');
  expect(
    new URL(pending.getAttribute('href')!, 'http://localhost').searchParams.get('status'),
  ).toBe('pending');
  fireEvent.keyDown(summary, { key: 'End' });
  expect(document.activeElement).toBe(pending);
  fireEvent.keyDown(pending, { key: 'Home' });
  expect(document.activeElement).toBe(within(menu).getByRole('button', { name: 'Auswählen' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(menu.open).toBe(false);
  expect(document.activeElement).toBe(summary);
  fireEvent.keyDown(summary, { key: 'ArrowDown' });
  fireEvent.click(within(utilities).getByRole('button', { name: 'Unterfinanziert 10,00 €' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(document.querySelector('#inspector-income > summary')),
  );
  expect(document.querySelector<HTMLDetailsElement>('#inspector-income')!.open).toBe(true);
  expect(menu.open).toBe(false);
});
