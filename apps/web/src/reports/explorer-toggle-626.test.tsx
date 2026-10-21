// @vitest-environment jsdom
import { DEFAULT_EXPLORER_QUERY, type ExplorerTemplateFacts } from '@budget/domain';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { ExplorerReportPage } from './explorer-report';
import { explorerTemplateQuery } from './explorer-template-api';
import { explorerQuery, type ExplorerReport } from './overview-api';
import { validateReportSearch } from './report-search';

vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 320] }));
const views = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('./use-explorer-views', () => ({
  useExplorerViews: () => ({
    views: [],
    data: { unavailable: false },
    busy: false,
    write: views.write,
  }),
}));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
  views.write.mockReset();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});

const facts: ExplorerTemplateFacts = {
  asOf: '2024-03-05',
  firstMonth: '2024-01',
  lastFullMonth: '2024-02',
  currentMonth: '2024-03',
  categories: [
    {
      id: 'food',
      name: 'Lebensmittel',
      class: 'want',
      kind: 'variable',
      groupId: 'g',
      groupName: 'Haushalt',
    },
  ],
  incomeTypes: [{ id: 'salary', name: 'Gehalt', role: 'income' }],
  months: [
    {
      month: '2024-01',
      income: { salary: 10001 },
      spending: { food: 1001 },
      assigned: {},
      netWorthCents: null,
      moneyAgeDays: null,
    },
    {
      month: '2024-02',
      income: { salary: 20002 },
      spending: { food: 2001 },
      assigned: {},
      netWorthCents: null,
      moneyAgeDays: null,
    },
  ],
  splits: [
    {
      bookingId: 'out',
      date: '2024-02-03',
      kind: 'spend',
      amountCents: 2002,
      categoryId: 'food',
      incomeTypeId: null,
      incomeGroup: null,
      payeeId: null,
      payeeName: null,
    },
    {
      bookingId: 'refund',
      date: '2024-02-04',
      kind: 'spend',
      amountCents: -1,
      categoryId: 'food',
      incomeTypeId: null,
      incomeGroup: null,
      payeeId: null,
      payeeName: null,
    },
  ],
};

async function mount(search = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(explorerTemplateQuery.queryKey, facts);
  client.setQueryData(explorerQuery(DEFAULT_EXPLORER_QUERY).queryKey, {
    today: facts.asOf,
    ref: '2024-02',
    firstMonth: '2024-01',
    result: {
      query: DEFAULT_EXPLORER_QUERY,
      months: ['2024-01', '2024-02'],
      columns: [{ key: '2024-Q1', months: ['2024-01', '2024-02'] }],
      unit: 'cents',
      rows: [{ key: 'food', label: 'Lebensmittel', class: 'want', values: [1234], total: 1234 }],
      totals: null,
      truncated: 0,
      good: 'low',
    },
  });
  const root = createRootRoute();
  const report: ReportEntry = {
    id: 'explorer',
    pos: '5.3',
    name: 'Explorer',
    question: 'Synthetic',
    form: 'Pivot',
    controls: [],
  };
  const route = createRoute({
    getParentRoute: () => root,
    path: '/reports/explorer',
    validateSearch: (search: Record<string, unknown>) => ({
      ...validateReportSearch(search),
      zeitraum: search['zeitraum'],
    }),
    component: () => <ExplorerReportPage report={report} meta={{} as PageMeta} />,
  });
  const bookings = createRoute({
    getParentRoute: () => root,
    path: '/konten/buchungen',
    component: () => <div>Buchungen</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([route, bookings]),
    history: createMemoryHistory({ initialEntries: [`/reports/explorer${search}`] }),
  });
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.reject(new Error('Unexpected network access from a presentation switch')),
  );
  vi.stubGlobal('fetch', fetch);
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await router.load();
  });
  return { router, fetch, client };
}

describe('626 same-source table and chart presentation', () => {
  it('offers a read-only Diagramm mode alongside the existing default native table', async () => {
    const { router, fetch } = await mount();
    const table = await screen.findByTestId('ex-table');
    expect(within(table).getByRole('link', { name: 'Lebensmittel' })).toBeTruthy();
    // Before product edits, the existing page reaches this assertion and lacks this control.
    const diagram = screen.getByRole('button', { name: 'Diagramm' });
    expect(screen.getByRole('button', { name: 'Tabelle' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    const originalSearch = router.state.location.searchStr;
    fireEvent.click(diagram);
    await waitFor(() => expect(diagram.getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('img', { name: /Diagramm/ })).toBeTruthy();
    expect(router.state.location.searchStr).toBe(originalSearch);
    expect(fetch).not.toHaveBeenCalled();
    expect(views.write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    expect(
      within(screen.getByTestId('ex-table')).getByRole('link', { name: 'Lebensmittel' }),
    ).toBeTruthy();
  });

  it('inspects the exact custom row, existing quarter label and cents by hover and keyboard', async () => {
    await mount();
    const table = await screen.findByTestId('ex-table');
    fireEvent.pointerMove(table.querySelector('tbody td')!, { pointerType: 'mouse' });
    await waitFor(() =>
      expect(document.querySelector('.chart-tooltip')?.textContent).toContain('12,34 €'),
    );
    expect(document.querySelector('.chart-tooltip')?.textContent).toContain('Lebensmittel');
    expect(document.querySelector('.chart-tooltip')?.textContent).toContain('Q1 24');
    fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));
    const chart = document.querySelector('.ex-chart-626 .chart-interactive');
    expect(chart).not.toBeNull();
    fireEvent.keyDown(chart!, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(document.querySelector('.chart-tooltip')?.textContent).toContain('12,34 €'),
    );
    expect(document.querySelector('.chart-tooltip')?.textContent).toContain('Q1 24');
    fireEvent.keyDown(chart!, { key: 'Escape' });
    expect(document.querySelector('.chart-tooltip')).toBeNull();
  });

  it('retains selected fixed-template source IDs and signed contributions across mode changes', async () => {
    const { router, fetch } = await mount('?vorlage=heatmap&zeitraum=1J');
    const table = await screen.findByTestId('template-heatmap');
    fireEvent.click(
      within(table).getByRole('button', { name: /^Lebensmittel · Februar 2024 · 20,01 €/ }),
    );
    const detail = await screen.findByTestId('template-sources');
    expect(detail.textContent).toContain('Summe der zugeordneten Anteile: 20,01 €');
    expect(detail.textContent).toContain('20,02 €');
    expect(detail.textContent).toContain('−0,01 €');
    const ids = within(detail)
      .getAllByRole('link')
      .map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get('buchung'));
    expect(ids).toEqual(['out', 'refund']);
    const selected = router.state.location.searchStr;
    fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));
    expect(screen.getByTestId('template-sources').textContent).toContain('20,01 €');
    expect(router.state.location.searchStr).toBe(selected);
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    expect(
      within(screen.getByTestId('template-sources'))
        .getAllByRole('link')
        .map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get('buchung')),
    ).toEqual(['out', 'refund']);
    expect(fetch).not.toHaveBeenCalled();
    expect(views.write).not.toHaveBeenCalled();
  });

  it.each(['heatmap', 'year', 'total', 'category'])(
    'offers a Diagramm for every fixed template: %s',
    async (template) => {
      await mount(`?vorlage=${template}&zeitraum=1J`);
      await screen.findByTestId(`template-${template}`);
      fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));
      expect(screen.getByRole('button', { name: 'Diagramm' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(screen.getByRole('img', { name: /Diagramm/ })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
      expect(within(screen.getByTestId(`template-${template}`)).getByRole('table')).toBeTruthy();
    },
  );

  it('keeps native table-region arrow keys available for browser horizontal scrolling', async () => {
    await mount();
    await screen.findByTestId('ex-table');
    const scroller = screen.getByRole('region', {
      name: 'Pivottabelle, bei Bedarf horizontal verschiebbar',
    });
    scroller.focus();
    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      scroller.dispatchEvent(arrow);
    });
    expect(arrow.defaultPrevented).toBe(false);
    expect(document.querySelector('.chart-tooltip')).toBeNull();
    // This unit asserts event ownership only; genuine browser pan is a separate native proof.
  });

  it('fails closed for a background-refetch error while the original table data is retained', async () => {
    const { client } = await mount();
    await screen.findByTestId('ex-table');
    fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));
    expect(screen.getByRole('img', { name: /Diagramm/ })).toBeTruthy();
    const key = explorerQuery(DEFAULT_EXPLORER_QUERY).queryKey;
    const original = client.getQueryData(key);
    await act(async () => {
      await client
        .fetchQuery({
          queryKey: key,
          staleTime: 0,
          retry: false,
          queryFn: () => Promise.reject(new Error('Synthetic626 background read unavailable')),
        })
        .catch(() => undefined);
    });
    await waitFor(() => expect(client.getQueryState(key)?.status).toBe('error'));
    expect(client.getQueryData(key)).toBe(original);
    expect(screen.queryByRole('img', { name: /Diagramm/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Diagramm' }).matches(':disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    expect(
      within(screen.getByTestId('ex-table')).getByRole('link', { name: 'Lebensmittel' }),
    ).toBeTruthy();
  });

  it('does not label a paused offline placeholder as the current Diagramm selection', async () => {
    const { client, fetch } = await mount();
    await screen.findByTestId('ex-table');
    fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));
    expect(screen.getByRole('img', { name: /Diagramm/ })).toBeTruthy();
    act(() => {
      onlineManager.setOnline(false);
    });
    fireEvent.change(screen.getByLabelText('Spalten', { exact: true }), {
      target: { value: 'monat' },
    });
    const nextKey = explorerQuery({ ...DEFAULT_EXPLORER_QUERY, cols: 'monat' }).queryKey;
    await waitFor(() => expect(client.getQueryState(nextKey)?.fetchStatus).toBe('paused'));
    expect(client.getQueryData(nextKey)).toBeUndefined();
    expect(screen.queryByRole('img', { name: /Diagramm/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Diagramm' }).matches(':disabled')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    expect(
      within(screen.getByTestId('ex-table')).getByRole('link', { name: 'Lebensmittel' }),
    ).toBeTruthy();
  });

  it('rejects a successful cached response whose literal query tuple belongs to another selection', async () => {
    const { client } = await mount();
    await screen.findByTestId('ex-table');
    fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));
    const key = explorerQuery(DEFAULT_EXPLORER_QUERY).queryKey;
    const original = client.getQueryData<ExplorerReport>(key)!;
    await act(async () => {
      client.setQueryData<ExplorerReport>(key, {
        ...original,
        result: { ...original.result, query: { ...original.result.query, cols: 'jahr' } },
      });
    });
    expect(client.getQueryState(key)?.status).toBe('success');
    expect(client.getQueryState(key)?.fetchStatus).toBe('idle');
    await waitFor(() => expect(screen.queryByRole('img', { name: /Diagramm/ })).toBeNull());
    expect(screen.getByRole('button', { name: 'Diagramm' }).matches(':disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    expect(
      within(screen.getByTestId('ex-table')).getByRole('link', { name: 'Lebensmittel' }),
    ).toBeTruthy();
  });

  it('masks exact inspection values and accessible chart alternatives in privacy mode', async () => {
    await mount();
    await screen.findByTestId('ex-table');
    fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));
    await act(async () => {
      setAmountsHidden(true);
    });
    const chart = document.querySelector('.ex-chart-626 .chart-interactive');
    expect(chart).not.toBeNull();
    fireEvent.keyDown(chart!, { key: 'ArrowRight' });
    await waitFor(() => expect(document.querySelector('.chart-tooltip')).not.toBeNull());
    expect(document.querySelector('.chart-tooltip')?.textContent).not.toContain('12,34');
    expect(screen.getByRole('img', { name: /Diagramm/ }).getAttribute('aria-label')).not.toContain(
      '12,34',
    );
  });
});

it('remembers the literal native pan when the hidden or detached old CSS box reports zero', async () => {
  await mount();
  await screen.findByTestId('ex-table');
  const scroller = screen.getByRole('region', {
    name: 'Pivottabelle, bei Bedarf horizontal verschiebbar',
  });
  let visibleOffset = 0;
  // CSSOM View reports zero without an associated CSS box. Model that browser boundary
  // locally; JSDOM itself does not lay out hidden/detached scrollers. This is not native-pan proof.
  Object.defineProperty(scroller, 'scrollLeft', {
    configurable: true,
    get: () => (scroller.isConnected && !scroller.closest('[hidden]') ? visibleOffset : 0),
    set: (value: number) => {
      visibleOffset = value;
    },
  });
  scroller.scrollLeft = 47;
  fireEvent.scroll(scroller);
  expect(scroller.scrollLeft).toBe(47);
  fireEvent.click(screen.getByRole('button', { name: 'Diagramm' }));
  expect(scroller.scrollLeft).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
  expect(
    screen.getByRole('region', {
      name: 'Pivottabelle, bei Bedarf horizontal verschiebbar',
    }).scrollLeft,
  ).toBe(47);
  expect(
    within(screen.getByTestId('ex-table')).getByRole('link', { name: 'Lebensmittel' }),
  ).toBeTruthy();
});
