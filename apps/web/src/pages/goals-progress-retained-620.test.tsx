// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { GoalView } from '../budget/goals-api';
import { findReport } from '../nav/reports-catalog';
import { REPORTS_CATALOG } from '../nav/pages';
import { GoalDetail, GoalsProgressReport, goalsProgressReportQuery } from './goals-progress-report';
import { goalReportRows } from './goals-progress-model';

vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({
    children,
    reportStand,
  }: {
    children: ReactNode;
    reportStand?: { value: string };
  }) => (
    <main>
      <span data-testid="boundary">{reportStand?.value}</span>
      {children}
    </main>
  ),
}));
vi.mock('@tanstack/react-router', () => ({
  useLinkProps: ({ to, search }: { to: string; search?: Record<string, string> }) => ({
    href: `${to}${search ? `?${new URLSearchParams(search)}` : ''}`,
  }),
}));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});
const goal = (patch: Partial<GoalView> = {}): GoalView => ({
  id: 'travel-goal',
  name: 'Reiseziel',
  categoryId: 'travel',
  accountId: null,
  targetCents: 300000,
  targetDate: '2027-07-31',
  note: null,
  savedCents: 85000,
  remainingCents: 215000,
  monthsLeft: 10,
  neededMonthlyCents: 21500,
  averageRateCents: 25000,
  forecastMonth: '2027-06',
  status: 'on_track',
  ...patch,
});
const reserve = goal({
  id: 'account-goal',
  name: 'Reserve',
  categoryId: null,
  accountId: 'reserve',
  targetCents: 100000,
  targetDate: '2027-03-31',
  savedCents: 30000,
  remainingCents: 70000,
  monthsLeft: 6,
  neededMonthlyCents: 11667,
  averageRateCents: 10000,
  forecastMonth: '2027-04',
  status: 'behind',
});
const categories = [{ id: 'travel', name: 'Reisen', class: 'want' }];
const accounts = [{ id: 'reserve', name: 'Reservekonto', currency: 'EUR' }];
function mount(goals: GoalView[], cats = categories, accts = accounts) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    expect(init?.method).toBe('GET');
    const data =
      path === '/api/goals/report'
        ? {
            month: '2026-09',
            reserveCents: 30000,
            coverage: { averageNeedCents: 10000, tenthsOfMonth: 30, months: 12 },
            cash: [],
            history: [],
            reserveComplete: true,
          }
        : path === '/api/goals'
          ? { month: '2026-09', goals }
          : path === '/api/categories'
            ? { groups: [], categories: cats, targets: [] }
            : path === '/api/accounts?asOf=2026-09-30'
              ? { accounts: accts }
              : undefined;
    if (!data) throw new Error(`Unexpected source ${path}`);
    return new Response(JSON.stringify(data));
  });
  vi.stubGlobal('fetch', fetcher);
  const rendered = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <GoalsProgressReport report={findReport('sparziele')!} meta={REPORTS_CATALOG} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { client, fetcher, ...rendered };
}

it('retains literal goal renderer figures, source cutoffs and forecasts shared by Plan detail', async () => {
  const { container, fetcher } = mount([goal(), reserve]);
  await waitFor(() =>
    expect(screen.getByTestId('goal-report-summary').textContent).toBe(
      '1 von 2 im Plan · geprüfte Ziele',
    ),
  );
  expect(screen.getByTestId('boundary').textContent).toBe('30.09.2026 · Monatsende');
  const rows = container.querySelectorAll('.goals-report-table tbody tr');
  for (const value of ['3.000,00 €', '850,00 €', '2.150,00 €', '215,00 €', 'Jun 2027'])
    expect(rows[0]?.textContent).toContain(value);
  expect(rows[1]?.textContent).toContain('116,67 €');
  expect(rows[1]?.textContent).toContain('Apr 2027');
  const model = goalReportRows([goal(), reserve], categories, accounts);
  const detail = render(
    <section>
      <GoalDetail row={model[0]!} month="2026-09" />
    </section>,
  );
  for (const value of ['3.000,00 €', '850,00 €', '2.150,00 €', '215,00 €', '250,00 €'])
    expect(detail.container.textContent).toContain(value);
  expect(detail.container.textContent).toContain('Prognose: Jun 2027');
  expect(
    within(detail.container)
      .getByRole('link', { name: 'Buchungen der Quelle öffnen' })
      .getAttribute('href'),
  ).toBe('/konten/buchungen?kategorie=travel&bis=2026-09-30');
  expect(
    within(detail.container)
      .getByRole('link', { name: 'Zuweisungen im Plan öffnen' })
      .getAttribute('href'),
  ).toBe('/plan/monat?monat=2026-09');
  detail.rerender(
    <section>
      <GoalDetail row={model[1]!} month="2026-09" />
    </section>,
  );
  expect(
    within(detail.container)
      .getByRole('link', { name: 'Buchungen der Quelle öffnen' })
      .getAttribute('href'),
  ).toBe('/konten/buchungen?konto=reserve&bis=2026-09-30');
  expect(detail.container.textContent).toContain('Wertpapierbestände sind keine Quelle');
  expect(fetcher.mock.calls.map(([path]) => path)).toContain('/api/accounts?asOf=2026-09-30');
});

it('retains source uncertainty, exact large cents, reached, no-date, overdue and zero-rate rendering', async () => {
  const goals = [
    goal({ id: 'duplicate1', name: 'Gemeinsames Ziel A' }),
    goal({ id: 'duplicate2', name: 'Gemeinsames Ziel B' }),
    goal({ id: 'missing', name: 'Gelöschte Quelle', categoryId: 'gone' }),
    goal({ id: 'none', name: 'Ohne Quelle', categoryId: null }),
    goal({ id: 'usd-goal', name: 'Fremdwährung', categoryId: null, accountId: 'usd' }),
    goal({
      id: 'large',
      name: 'Sehr langes Sparziel für eine spätere Anschaffung ohne verkürzte Finanzwerte',
      categoryId: 'large',
      targetCents: 9007199254740990,
      savedCents: 9007199254740990,
      remainingCents: 0,
      monthsLeft: null,
      neededMonthlyCents: 0,
      forecastMonth: null,
      status: 'reached',
    }),
    goal({
      id: 'nodate',
      name: 'Ohne Zieldatum',
      categoryId: 'nodate',
      targetDate: null,
      monthsLeft: null,
      neededMonthlyCents: null,
      forecastMonth: null,
      averageRateCents: -100,
      status: 'behind',
      savedCents: 0,
      remainingCents: 300000,
    }),
    goal({
      id: 'overdue',
      name: 'Überfälliges Ziel',
      categoryId: 'overdue',
      targetDate: '2026-08-31',
      monthsLeft: 1,
      neededMonthlyCents: 215000,
      status: 'behind',
    }),
  ];
  const cats = [
    ...categories,
    ...['large', 'nodate', 'overdue'].map((id) => ({ id, name: id, class: 'future' })),
  ];
  const accts = [...accounts, { id: 'usd', name: 'Fremdkonto', currency: 'USD' }];
  const { container } = mount(goals, cats, accts);
  await waitFor(() =>
    expect(screen.getByTestId('goal-report-summary').textContent).toBe(
      '1 von 3 im Plan · geprüfte Ziele · 5 ungeklärt',
    ),
  );
  const rows = container.querySelectorAll('.goals-report-table tbody tr');
  for (let i = 0; i < 5; i++) {
    expect(rows[i]?.querySelectorAll('td')[1]?.textContent).toBe('nicht verfügbar');
    expect(rows[i]?.textContent).toContain('Status ungeklärt');
    expect(rows[i]?.textContent).not.toContain('€');
  }
  expect(rows[5]?.textContent).toContain('90.071.992.547.409,90 €');
  expect(rows[5]?.textContent).toContain('erreicht');
  for (const text of ['0,00 €', '−1,00 €', 'ohne Zieldatum', 'kein Termin aus aktueller Rate'])
    expect(rows[6]?.textContent).toContain(text);
  expect(rows[7]?.textContent).toContain('Zieldatum erreicht, Rest offen');
  const detail = render(
    <GoalDetail row={goalReportRows(goals, cats, accts)[0]!} month="2026-09" />,
  );
  expect(detail.container.textContent).toContain('Mehrere Sparziele verwenden dieselbe Quelle');
  expect(detail.container.textContent).not.toContain('€');
});

it('withholds cached goal/source figures through pending metadata, failure, retry and empty response', async () => {
  const { client, fetcher, container } = mount([goal()]);
  await screen.findByTestId('goal-report-summary');
  const original = fetcher.getMockImplementation()!;
  let release!: (response: Response) => void;
  fetcher.mockImplementation((path, init) =>
    path.startsWith('/api/accounts?')
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : original(path, init),
  );
  act(() => {
    void client.invalidateQueries({ queryKey: goalsProgressReportQuery().queryKey });
  });
  await waitFor(() => expect(screen.getByTestId('boundary').textContent).toBe('wird geladen'));
  expect(screen.queryByTestId('goal-report-summary')).toBeNull();
  expect(container.querySelector('.goals-report-table')).toBeNull();
  await act(async () => {
    release(
      new Response(JSON.stringify({ error: 'unavailable', message: 'Synthetische Quelle fehlt' }), {
        status: 503,
      }),
    );
  });
  await screen.findByRole('alert');
  expect(screen.getByTestId('boundary').textContent).toBe('nicht verfügbar');
  expect(screen.getByTestId('boundary').textContent).not.toContain('noch nie');
  expect(screen.queryByTestId('goal-report-summary')).toBeNull();
  expect(container.querySelector('.goal-report-bar')).toBeNull();
  fetcher.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  await waitFor(() =>
    expect(screen.getByTestId('goal-report-summary').textContent).toBe(
      '1 von 1 im Plan · geprüfte Ziele',
    ),
  );
  let emptyReads = 0;
  fetcher.mockImplementation((path, init) => {
    if (path !== '/api/goals') return original(path, init);
    emptyReads++;
    return Promise.resolve(new Response(JSON.stringify({ month: '2026-09', goals: [] })));
  });
  await act(async () => {
    await client.invalidateQueries({ queryKey: goalsProgressReportQuery().queryKey });
  });
  await screen.findByText('Noch keine gespeicherten Sparziele.', { exact: false });
  expect(emptyReads).toBe(1);
  expect(client.getQueryData(goalsProgressReportQuery().queryKey)?.goals).toEqual([]);
  expect(container.querySelector('.goals-report-table')).toBeNull();
});
