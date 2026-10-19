// @vitest-environment jsdom
import {
  DEFAULT_EXPLORER_QUERY,
  type ExplorerTemplateFacts,
  type PersistedExplorerView,
} from '@budget/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportEntry } from '../nav/reports-catalog';
import type { PageMeta } from '../nav/pages';
import { ExplorerReportPage } from './explorer-report';
import { explorerTemplateQuery } from './explorer-template-api';
import { explorerQuery } from './overview-api';
import { validateReportSearch } from './report-search';

vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({
    children,
    extraFields,
  }: {
    children: ReactNode;
    extraFields?: { label: string; value: ReactNode }[];
  }) => (
    <main>
      {extraFields?.map((field) => (
        <div key={field.label}>{field.value}</div>
      ))}
      {children}
    </main>
  ),
}));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 320] }));
const saved = vi.hoisted(() => ({ write: vi.fn(), views: [] as PersistedExplorerView[] }));
vi.mock('./use-explorer-views', () => ({
  useExplorerViews: () => ({
    views: saved.views,
    data: { unavailable: false },
    busy: false,
    write: saved.write,
  }),
}));

const facts: ExplorerTemplateFacts = {
  asOf: '2024-03-05',
  firstMonth: '2024-01',
  lastFullMonth: '2024-02',
  currentMonth: '2024-03',
  categories: [
    {
      id: 'food',
      name: 'Lebensmittel',
      class: 'need',
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
      assigned: { food: 1200 },
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
      bookingId: 'part',
      date: '2024-01-02',
      kind: 'spend',
      amountCents: 1001,
      categoryId: 'food',
      incomeTypeId: null,
      incomeGroup: null,
      payeeId: null,
      payeeName: null,
    },
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
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  saved.views = [];
  saved.write.mockReset();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});

function mount(search = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(explorerTemplateQuery.queryKey, facts);
  client.setQueryData(explorerQuery(DEFAULT_EXPLORER_QUERY).queryKey, {
    today: '2024-03-05',
    ref: '2024-02',
    firstMonth: '2024-01',
    result: {
      query: DEFAULT_EXPLORER_QUERY,
      months: ['2024-01', '2024-02'],
      columns: [{ key: '2024-Q1', months: ['2024-01', '2024-02'] }],
      unit: 'cents',
      rows: [{ key: 'x', label: 'Eigene Kategorie', class: 'want', values: [1234], total: 1234 }],
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
    question: 'Eigene Frage',
    form: 'Pivot',
    controls: [],
  };
  const explorer = createRoute({
    getParentRoute: () => root,
    path: '/reports/explorer',
    validateSearch: (value: Record<string, unknown>) => ({
      ...validateReportSearch(value),
      zeitraum: value['zeitraum'],
    }),
    component: () => <ExplorerReportPage report={report} meta={{} as PageMeta} />,
  });
  const bookings = createRoute({
    getParentRoute: () => root,
    path: '/konten/buchungen',
    component: () => <div>Buchungen</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([explorer, bookings]),
    history: createMemoryHistory({ initialEntries: [`/reports/explorer${search}`] }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { router, client };
}

describe('625 fixed templates beside retained custom views', () => {
  it('offers all four templates in addition to the unchanged custom presets and validates exact deep-link selectors', async () => {
    mount();
    const chips = await screen.findByRole('group', { name: 'Vorlagen' });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Heatmap Ausgaben', 'Jahresansicht', 'Gesamttabelle', 'Kategorie im Verlauf']);
    expect(screen.getByRole('button', { name: 'Wunsch je Quartal' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      validateReportSearch({
        vorlage: 'category',
        zelle: 'cat:food',
        spalte: '2024-02',
        kategorien: ['food'],
      }),
    ).toMatchObject({
      vorlage: 'category',
      zelle: 'cat:food',
      spalte: '2024-02',
      kategorien: ['food'],
    });
    expect(
      validateReportSearch({ vorlage: 'unknown', zelle: 'x'.repeat(100), spalte: '2024-13' }),
    ).toMatchObject({ vorlage: undefined, zelle: undefined, spalte: undefined });
  });

  it('opens exact net source shares and preserves template/month/category identity across a real router refresh', async () => {
    const { router } = mount('?vorlage=category&zeitraum=1J&kategorien=%5B%22food%22%5D');
    await screen.findByTestId('template-category');
    fireEvent.click(screen.getByRole('button', { name: /Lebensmittel · Februar 2024 · 20,01 €/ }));
    const detail = await screen.findByTestId('template-sources');
    expect(detail.textContent).toContain('Gewählte Zelle: 20,01 €');
    expect(detail.textContent).toContain('Summe der zugeordneten Anteile: 20,01 €');
    expect(
      within(detail)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/konten/buchungen?buchung=out', '/konten/buchungen?buchung=refund']);
    expect(router.state.location.search).toMatchObject({
      vorlage: 'category',
      zelle: 'cat:food',
      spalte: '2024-02',
      kategorien: ['food'],
    });
    await router.invalidate();
    await waitFor(() =>
      expect(screen.getByTestId('template-sources').textContent).toContain('20,01 €'),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the canonical single-category line plus mean and keeps arithmetic averages nonclickable', async () => {
    const container = document.body;
    mount('?vorlage=category&zeitraum=1J');
    await screen.findByTestId('template-category');
    expect(container.querySelector('.ex-template-trend .l-actual')).not.toBeNull();
    expect(container.querySelector('.ex-template-trend .l-prev')).not.toBeNull();
    expect(
      container.querySelector('.ex-template-trend .l-actual')?.getAttribute('d'),
    ).not.toContain('NaN');
    expect(screen.getByText('15,01 €', { selector: 'strong' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /15,01/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Jahresansicht' }));
    await screen.findByTestId('template-year');
    expect(screen.getByRole('combobox', { name: 'Jahr' })).toHaveValue('2024');
  });

  it('restores a saved custom tuple and its validated CSV control without changing the saved schema', async () => {
    saved.views = [{ id: 'saved', name: 'Mein Filter', query: DEFAULT_EXPLORER_QUERY }];
    mount('?vorlage=heatmap&zeitraum=1J');
    await screen.findByTestId('template-heatmap');
    expect(screen.queryByRole('button', { name: 'CSV exportieren' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Ansicht speichern' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mein Filter' }));
    const csv = await screen.findByRole('button', { name: 'CSV exportieren' });
    expect(csv).toBeEnabled();
    expect(screen.queryByTestId('template-heatmap')).toBeNull();
    expect(screen.getByTestId('ex-table').textContent).toContain('Eigene Kategorie');
    expect(saved.write).not.toHaveBeenCalled();
    expect(Object.keys(saved.views[0]!.query).sort()).toEqual([
      'cls',
      'cols',
      'dim',
      'meas',
      'period',
    ]);
  });

  it('masks current template, source and chart figures without discarding selected identities', async () => {
    mount('?vorlage=category&zeitraum=1J&zelle=cat%3Afood&spalte=2024-02');
    await screen.findByTestId('template-sources');
    act(() => setAmountsHidden(true));
    await waitFor(() =>
      expect(screen.getByTestId('template-category').textContent).not.toContain('20,01'),
    );
    expect(screen.queryByRole('button', { name: /20,01/ })).toBeNull();
    expect(screen.getByTestId('template-sources').textContent).toContain('Buchungen');
  });

  it('removes stale clickable values on a failed canonical refetch and offers the normal retry', async () => {
    const { client } = mount('?vorlage=heatmap&zeitraum=1J');
    await screen.findByTestId('template-heatmap');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'synthetic_failure' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await act(async () => {
      await client.invalidateQueries({ queryKey: explorerTemplateQuery.queryKey });
    });
    await screen.findByRole('alert');
    expect(screen.queryByTestId('template-heatmap')).toBeNull();
    expect(screen.getByRole('button', { name: /Erneut/ })).toBeDefined();
  });
});
