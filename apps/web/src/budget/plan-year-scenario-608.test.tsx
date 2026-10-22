// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { planYearMonths } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { PlanYearPage } from './plan-year-page';
import { budgetMonthsQuery, type BudgetMonthView } from './budget-api';
import { plannedEventsQuery, type PlannedEventView } from '../reports/liquidity-api';
import { reportTablesQuery } from '../reports/table-reports-api';

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ monat: '2026-11' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
// jsdom has no layout; exercise the real chart, inspection and data table at a fixed width.
vi.mock('../charts/use-element-width', () => ({
  useElementWidth: () => [{ current: null }, 800],
}));

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

it('masks scenario amounts, event names and chart inspection reactively', () => {
  const { container } = show([event('Synthetische Ausgabe 123,00 €', -10_001)]);
  expect(screen.getByTestId('scenario-year-end').textContent).toBe('900,00 €');
  act(() => setAmountsHidden(true));
  expect(screen.getByTestId('scenario-year-end').textContent).not.toContain('900,00');
  expect(container.textContent).not.toContain('100,01');
  expect(container.textContent).not.toContain('Synthetische Ausgabe 123,00 €');
  expect(screen.getByTestId('year-scenario-chart').getAttribute('aria-label')).not.toContain(
    '900,00',
  );
  act(() => setAmountsHidden(false));
  expect(screen.getByTestId('scenario-year-end').textContent).toBe('900,00 €');
});

function event(id: string, amountCents: number, date = '2026-11-30'): PlannedEventView {
  return {
    id,
    name: id,
    date,
    amountCents,
    recurrence: 'once',
    recurrenceMonths: [],
    recurrenceUntil: null,
    enabled: true,
    categoryId: null,
    categoryName: null,
    accountId: null,
    accountName: null,
    note: null,
    status: 'in_horizon',
  };
}

function show(events: PlannedEventView[] = [], asOf = '2026-10-06') {
  const fetch = vi.fn(() => Promise.reject(new Error('Unexpected uncached request')));
  vi.stubGlobal('fetch', fetch);
  const months = planYearMonths(2026);
  const views: BudgetMonthView[] = months.map((month, i) => ({
    summary: {
      month,
      toBeAssignedCents: i === 10 ? -101 : 100_001,
      carryInCents: 100_001,
      incomeCents: 0,
      uncoveredCents: 0,
      heldCents: 0,
      assignedCents: 0,
      activityCents: 0,
      availableCents: 0,
      creditOverspentCents: 0,
      cashOverspentCents: 0,
      cards: [],
      envelopes: [
        {
          categoryId: 'travel',
          carryCents: 0,
          assignedCents: i === 0 ? 10_001 : i === 1 ? 5_000 : 0,
          activityCents: i === 0 ? -3_002 : i === 1 ? 203 : 0,
          availableCents: i === 0 ? 6_999 : 12_202,
          overspentCents: 0,
          cashOverspentCents: 0,
          creditOverspentCents: 0,
          fundedCardCents: 0,
          goalCents: 0,
          needCents: 0,
          dueMonth: null,
          target: null,
        },
      ],
    },
    groups: [{ id: 'group', name: 'Synthetische Gruppe', sortOrder: 0 }],
    categories: [
      {
        id: 'travel',
        name: 'Synthetische Reise',
        groupId: 'group',
        icon: null,
        class: 'want',
        kind: 'variable',
        stage: null,
        cardAccountId: null,
        rolloverOverspending: false,
        sortOrder: 0,
        hiddenAt: null,
        splitCount: 0,
      },
    ],
  }));
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(budgetMonthsQuery(months).queryKey, {
    months: Object.fromEntries(views.map((view) => [view.summary.month, view])),
  });
  client.setQueryData(plannedEventsQuery().queryKey, { events, asOf, budgetAccounts: [] });
  client.setQueryData(reportTablesQuery(false).queryKey, {
    asOf,
    currentMonth: '2026-10',
    firstMonth: null,
    lastFullMonth: null,
    months: [],
    categories: [],
    incomeTypes: [],
    payees: {},
    targets: { savingsRateBp: 2000, moneyAgeDays: 30 },
    netWorth: 'omitted',
  });
  return {
    ...render(
      <QueryClientProvider client={client}>
        <PlanYearPage />
      </QueryClientProvider>,
    ),
    fetch,
    client,
  };
}

function decemberValue(container: HTMLElement) {
  const row = [...container.querySelectorAll('.chart-data-table tbody tr')].find(
    (row) => row.textContent?.includes('31.12.2026') && row.textContent.includes('Monatsende'),
  );
  return row?.querySelector('.chart-data-value')?.textContent;
}

it('keeps literal December, lead, cumulative inspection and toggles identical without writes', () => {
  // Saved December 1000.01; November -100.01 + 20.03, December -0.01 => 920.02.
  const { container, fetch } = show([
    event('Ausgabe', -10_001),
    event('Gutschrift', 2_003),
    event('Dezember', -1, '2026-12-31'),
    event('Bereits vergangen', -999_999, '2026-10-06'),
    { ...event('Ausgeschaltet', -999_999), enabled: false },
    { ...event('Anderes Konto', -999_999), status: 'off_budget' },
  ]);
  const lead = screen.getByTestId('scenario-year-end');
  const chart = screen.getByTestId('year-scenario-chart');
  expect(lead.textContent).toBe('920,02 €');
  expect(chart.getAttribute('aria-label')).toContain('Dezember 920,02 €');
  expect(decemberValue(container)).toBe('920,02 €');
  expect(screen.getByTestId('scenario-year-effect').textContent).toBe('−79,99 €');
  expect(container.querySelector('.year-chart-low')?.textContent).toContain('−80,99 €');
  const november = [...container.querySelectorAll('.chart-data-table tbody tr')].filter((row) =>
    row.textContent?.includes('30.11.2026'),
  );
  expect(november.map((row) => row.textContent)).toEqual([
    '30.11.2026Zu verteilen mit Ereignissen · Monatsende−80,99 €',
    '30.11.2026Gespeicherter Monatsplan ohne Ereignisse−1,01 €',
    '30.11.2026Ereignisse bis dahin zusammen−79,98 €',
    '30.11.2026Ausgabe−100,01 €',
    '30.11.2026Gutschrift+20,03 €',
  ]);
  fireEvent.focus(chart.parentElement!);
  for (let i = 0; i < 11; i++) fireEvent.keyDown(chart.parentElement!, { key: 'ArrowRight' });
  expect(screen.getByRole('status').textContent).toContain('Ausgabe−100,01 €');
  expect(screen.getByRole('status').textContent).toContain('Gutschrift+20,03 €');
  fireEvent.keyDown(chart.parentElement!, { key: 'ArrowRight' });
  expect(screen.getByRole('status').textContent).toContain('Monatsende920,02 €');
  fireEvent.click(screen.getByRole('button', { name: 'Ohne Auswahl' }));
  expect(lead.textContent).toBe('1.000,01 €');
  expect(decemberValue(container)).toBe('1.000,01 €');
  fireEvent.click(screen.getByRole('button', { name: 'Mit Auswahl' }));
  fireEvent.click(container.querySelector('.year-events summary')!);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ausgabe im Szenario' }));
  expect(lead.textContent).toBe('1.020,03 €');
  expect(decemberValue(container)).toBe('1.020,03 €');
  expect(chart.getAttribute('aria-label')).toContain('Dezember 1.020,03 €');
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['2025-12-31', '2026-10-06', '2027-01-01'])(
  'retains saved December for a zero-event year as of %s',
  (asOf) => {
    const { container, fetch } = show([], asOf);
    expect(screen.getByTestId('scenario-year-end').textContent).toBe('1.000,01 €');
    expect(decemberValue(container)).toBe('1.000,01 €');
    expect(screen.getByTestId('year-scenario-chart').getAttribute('aria-label')).toContain(
      'Dezember 1.000,01 €',
    );
    expect(fetch).not.toHaveBeenCalled();
  },
);

it('starts groups collapsed and preserves literal annual flows and December balances for every metric', async () => {
  const { container, client, fetch } = show();
  const table = container.querySelector<HTMLTableElement>('.year-table')!;
  const group = within(table).getByRole('button', { name: 'Synthetische Gruppe' });
  expect(group.getAttribute('aria-expanded')).toBe('false');
  expect(table.textContent).not.toContain('Synthetische Reise');
  expect(table.querySelector('tbody .year-end')?.textContent).toBe('150,01 €');
  fireEvent.click(group);
  expect(table.textContent).toContain('Synthetische Reise');
  fireEvent.click(screen.getByRole('button', { name: 'Aktivität' }));
  expect(table.querySelector('tbody .year-end')?.textContent).toBe('−27,99 €');
  expect(table.querySelector('tfoot .year-end')?.textContent).toBe('−27,99 €');
  fireEvent.click(screen.getByRole('button', { name: 'Verfügbar' }));
  expect(table.querySelector('tbody .year-end')?.textContent).toBe('122,02 €');
  expect(table.querySelector('tfoot .year-end')?.textContent).toBe('122,02 €');
  const phoneTotals = container.querySelector('.year-phone-annual .year-totals');
  expect(phoneTotals?.textContent).toBe(
    'Zugewiesen · Jahr150,01 €Aktivität · Jahr−27,99 €Verfügbar · Dezember122,02 €',
  );
  const key = budgetMonthsQuery(planYearMonths(2026)).queryKey;
  await act(async () => {
    client.setQueryData<{ months: Record<string, BudgetMonthView> }>(key, (data) => ({
      months: Object.fromEntries(
        Object.entries(data!.months).map(([month, view]) => [
          month,
          {
            ...view,
            groups: [...view.groups, { id: 'new-group', name: 'Neue Gruppe', sortOrder: 1 }],
            categories: [
              ...view.categories,
              { ...view.categories[0]!, id: 'new', groupId: 'new-group', name: 'Neue Kategorie' },
            ],
            summary: {
              ...view.summary,
              envelopes: [
                ...view.summary.envelopes,
                { ...view.summary.envelopes[0]!, categoryId: 'new' },
              ],
            },
          },
        ]),
      ),
    }));
  });
  expect(
    (await within(table).findByRole('button', { name: 'Neue Gruppe' })).getAttribute(
      'aria-expanded',
    ),
  ).toBe('false');
  expect(table.textContent).not.toContain('Neue Kategorie');
  expect(fetch).not.toHaveBeenCalled();
});
