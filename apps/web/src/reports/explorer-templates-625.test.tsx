// @vitest-environment jsdom
import {
  DEFAULT_EXPLORER_QUERY,
  type ExplorerTemplateFacts,
  type PersistedExplorerView,
  type VerdictFacts,
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
import { reportTablesQuery, type ReportTables } from './table-reports-api';
import { VerdictLine } from './verdict-line';

vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({
    children,
    extraFields,
    verdict,
  }: {
    children: ReactNode;
    extraFields?: { label: string; value: ReactNode }[];
    verdict?: VerdictFacts;
  }) => (
    <main>
      {verdict && <VerdictLine facts={verdict} />}
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
  vi.restoreAllMocks();
  localStorage.removeItem(`budget.report-sections.${location.pathname}`);
});

function mount(search = '', templateFacts = facts) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(explorerTemplateQuery.queryKey, templateFacts);
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
  const rendered = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { router, client, ...rendered };
}

describe('625 fixed templates beside retained custom views', () => {
  it('renders the selected category verdict with privacy and withholds stale/error facts', async () => {
    const { client } = mount('?vorlage=category&zeitraum=1J&kategorien=%5B%22food%22%5D');
    const verdict = await screen.findByTestId('report-verdict');
    expect(verdict.textContent).toContain('Lebensmittel');
    expect(verdict.textContent).toContain('30,02 €');
    expect(verdict.textContent).not.toContain('300,03');
    act(() => setAmountsHidden(true));
    expect(verdict.textContent).toContain('••• €');
    expect(verdict.textContent).not.toContain('30,02');
    let release!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            release = done;
          }),
      ),
    );
    act(() => {
      void client.invalidateQueries({ queryKey: explorerTemplateQuery.queryKey });
    });
    await waitFor(() => expect(screen.queryByTestId('report-verdict')).toBeNull());
    expect(screen.queryByTestId('template-category')).toBeNull();
    await act(async () => {
      release(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }));
    });
    await screen.findByRole('alert');
    expect(screen.queryByTestId('report-verdict')).toBeNull();
  });

  it('uses the shared landscape print wrapper and remembers a real supplementary section without losing matrix columns', async () => {
    const first = mount('?vorlage=year');
    const table = await screen.findByTestId('template-year');
    expect(table.classList.contains('report-table-print')).toBe(true);
    expect(table.classList.contains('table-report')).toBe(true);
    expect(table.querySelectorAll('table.rtable thead th')).toHaveLength(15);
    const toggle = await within(table).findByRole('button', {
      name: /Abschnitt ein- oder ausklappen.*Datenbasis und Darstellung/,
    });
    const section = toggle.closest('section')!;
    fireEvent.click(toggle);
    expect(section.dataset['collapsed']).toBe('true');
    expect(localStorage.getItem(`budget.report-sections.${location.pathname}`)).toContain(
      'explorer-template-year-basis',
    );
    first.unmount();
    mount('?vorlage=year');
    const second = await screen.findByTestId('template-year');
    const restored = await within(second).findByRole('button', {
      name: /Abschnitt ein- oder ausklappen.*Datenbasis und Darstellung/,
    });
    expect(restored.getAttribute('aria-expanded')).toBe('false');
    expect(second.querySelectorAll('table.rtable thead th')).toHaveLength(15);
    localStorage.removeItem(`budget.report-sections.${location.pathname}`);
  });
  it('remounts the all-history disclosure closed after a template switch or source refresh without a hidden read', async () => {
    const legacy: ReportTables = {
      ...facts,
      categories: [...facts.categories],
      incomeTypes: [...facts.incomeTypes],
      payees: {},
      targets: { savingsRateBp: 2000, moneyAgeDays: 30 },
      netWorth: 'unavailable',
    };
    const reads: string[] = [];
    let release!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        reads.push(path);
        if (path === '/api/report-tables/months?netWorth=1')
          return Promise.resolve(new Response(JSON.stringify(legacy)));
        if (path === '/api/report-tables/income-expense')
          return new Promise<Response>((done) => {
            release = done;
          });
        throw new Error(`Unexpected read ${path}`);
      }),
    );
    const { client } = mount('?vorlage=total');
    const summary = () => screen.getByText('Alle Monate: Nettovermögen und CSV', { exact: true });
    await screen.findByTestId('template-total');
    fireEvent.click(summary());
    await screen.findByTestId('csv-download');
    fireEvent.click(screen.getByRole('button', { name: 'Jahresansicht' }));
    await screen.findByTestId('template-year');
    fireEvent.click(screen.getByRole('button', { name: 'Gesamttabelle' }));
    await screen.findByTestId('template-total');
    expect(summary().closest('details')!.open).toBe(false);
    expect(screen.queryByTestId('csv-download')).toBeNull();
    expect(reads.filter((path) => path.includes('netWorth'))).toHaveLength(1);
    fireEvent.click(summary());
    await screen.findByTestId('csv-download');
    act(() => {
      void client.invalidateQueries({ queryKey: explorerTemplateQuery.queryKey });
    });
    await waitFor(() =>
      expect(screen.queryByText('Alle Monate: Nettovermögen und CSV', { exact: true })).toBeNull(),
    );
    await act(async () => {
      release(new Response(JSON.stringify(facts)));
    });
    await screen.findByTestId('template-total');
    expect(summary().closest('details')!.open).toBe(false);
    expect(screen.queryByTestId('csv-download')).toBeNull();
    expect(reads.filter((path) => path.includes('netWorth'))).toHaveLength(1);
  });

  it('retains all-history net worth and its exact CSV only after opening the total disclosure, withholding stale values', async () => {
    const legacy: ReportTables = {
      ...facts,
      categories: [...facts.categories],
      incomeTypes: [...facts.incomeTypes],
      payees: {},
      targets: { savingsRateBp: 2000, moneyAgeDays: 30 },
      netWorth: 'ok',
      months: [
        { ...facts.months[0]!, netWorthCents: 123456 },
        { ...facts.months[1]!, netWorthCents: 234567 },
        { ...facts.months[1]!, month: '2024-03', netWorthCents: 8473000 },
      ],
    };
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn((path: string, init?: RequestInit) => {
      expect(path).toBe('/api/report-tables/months?netWorth=1');
      expect(init?.method).toBe('GET');
      return new Promise<Response>((done) => {
        resolve = done;
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const { client } = mount('?vorlage=total&zeitraum=1M');
    await screen.findByTestId('template-total');
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Alle Monate: Nettovermögen und CSV', { exact: true }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('csv-download')).toBeNull();
    await act(async () => {
      resolve(new Response(JSON.stringify(legacy)));
    });
    const csv = await screen.findByTestId('csv-download');
    expect(screen.getByText('Datenbasis: Jän 24 bis Mär 24')).toBeDefined();
    expect(screen.getByTestId('total-history-verdict')).toBeDefined();
    expect(
      document.querySelector('table.rg-all tbody tr:last-child td:last-child')?.textContent,
    ).toBe('84.730');
    const NativeURL = URL;
    let blob!: Blob;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static override createObjectURL = vi.fn((value: Blob) => {
          blob = value;
          return 'blob:total-620';
        });
        static override revokeObjectURL = vi.fn();
      },
    );
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download;
    });
    fireEvent.click(csv);
    expect(filename).toBe('gesamttabelle-2024-01-2024-03.csv');
    const text = await new Promise<string>((done) => {
      const reader = new FileReader();
      reader.onload = () => done(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toContain('"Nettovermögen am Monatsende";1234,56;2345,67;84730,00');
    act(() => setAmountsHidden(true));
    expect(document.querySelector('table.rg-all')?.textContent).not.toContain('84.730');
    act(() => {
      void client.invalidateQueries({ queryKey: reportTablesQuery(true).queryKey });
    });
    await waitFor(() => expect(screen.queryByTestId('csv-download')).toBeNull());
    await act(async () => {
      resolve(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }));
    });
    await screen.findByRole('alert');
    expect(document.querySelector('table.rg-all')).toBeNull();
    expect(screen.queryByTestId('csv-download')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await act(async () => {
      resolve(
        new Response(
          JSON.stringify({
            ...legacy,
            netWorth: 'unavailable',
            months: legacy.months.map((month) => ({ ...month, netWorthCents: null })),
          }),
        ),
      );
    });
    await screen.findByTestId('csv-download');
    expect(
      screen.getByText('Das Nettovermögen am Monatsende ist nicht verfügbar:', { exact: false }),
    ).toBeDefined();
    expect(
      document.querySelector('table.rg-all tbody tr:last-child td:last-child')?.textContent,
    ).toBe('–');
  });

  it('defaults a year bookmark to the latest year with full source data, including gaps after it', async () => {
    mount('?vorlage=year', { ...facts, currentMonth: '2025-03', lastFullMonth: '2025-02' });
    const table = await screen.findByTestId('template-year');
    expect(
      table.querySelector('[data-template-row="cat:food"] [data-template-column="2024-02"]')
        ?.textContent,
    ).toContain('20,01');
    expect(table.querySelector('[data-template-column="2025-02"]')).toBeNull();
    expect((screen.getByRole('combobox', { name: 'Jahr' }) as HTMLSelectElement).value).toBe(
      '2024',
    );
  });

  it('offers all four templates in addition to the unchanged custom presets and validates exact deep-link selectors', async () => {
    mount();
    const chips = await screen.findByRole('group', { name: 'Vorlagen' });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Heatmap Ausgaben', 'Jahresansicht', 'Gesamttabelle', 'Kategorie im Verlauf']);
    expect(
      screen.getByRole('button', { name: 'Wunsch je Quartal' }).getAttribute('aria-pressed'),
    ).toBe('true');
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
    expect((screen.getByRole('combobox', { name: 'Jahr' }) as HTMLSelectElement).value).toBe(
      '2024',
    );
  });

  it('restores a saved custom tuple and its validated CSV control without changing the saved schema', async () => {
    saved.views = [{ id: 'saved', name: 'Mein Filter', query: DEFAULT_EXPLORER_QUERY }];
    mount('?vorlage=heatmap&zeitraum=1J');
    await screen.findByTestId('template-heatmap');
    expect(screen.queryByRole('button', { name: 'CSV exportieren' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Ansicht speichern' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mein Filter' }));
    const csv = await screen.findByRole('button', { name: 'CSV exportieren' });
    expect(csv.matches(':enabled')).toBe(true);
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

/** Immediate-staleness stress only (production defaults20s): real-router same-figure reads. */
function mountReturningTemplate() {
  const pending: ((response: Response) => void)[] = [];
  const calls: { method: string; path: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>((input, init) => {
      const url = new URL(String(input), 'http://localhost');
      calls.push({ method: init?.method ?? 'GET', path: url.pathname });
      if (url.pathname !== '/api/report-tables/income-expense')
        throw new Error(`Unexpected lifecycle fixture request: ${url.pathname}`);
      return new Promise<Response>((resolve) => pending.push(resolve));
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(explorerTemplateQuery.queryKey, facts);
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
    validateSearch: (value: Record<string, unknown>) => ({ buchung: value['buchung'] }),
    component: () => <p data-testid="lifecycle-raw-booking">Raw source booking −20,02 €</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([explorer, bookings]),
    history: createMemoryHistory({
      initialEntries: ['/reports/explorer?vorlage=heatmap&zeitraum=1J&kategorien=%5B%22food%22%5D'],
    }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const resolve = async (index: number) => {
    const done = pending[index];
    if (!done) throw new Error(`Expected pending canonical read ${index}`);
    await act(async () =>
      done(
        new Response(JSON.stringify(facts), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  };
  return { router, client, calls, pending, resolve };
}

describe('625 source booking → history back → close under immediate-staleness stress', () => {
  it.each(['already-resolved', 'pending-return-observed'] as const)(
    'clears only selected cell and returns focus with %s refetch',
    async (phase) => {
      const { router, client, calls, pending, resolve } = mountReturningTemplate();
      await waitFor(() => expect(pending).toHaveLength(1));
      await resolve(0);
      await screen.findByTestId('template-heatmap');
      expect(client.getDefaultOptions().queries?.staleTime).toBe(0);
      const cell = () =>
        screen.getByRole('button', { name: /Lebensmittel · Februar 2024 · 20,01 €/ });
      fireEvent.click(cell());
      const sources = await screen.findByTestId('template-sources');
      expect(sources.textContent).toContain('Gewählte Zelle: 20,01 €');
      expect(sources.textContent).toContain('Summe der zugeordneten Anteile: 20,01 €');
      expect(sources.textContent).toContain('20,02 €');
      expect(sources.textContent).toContain('−0,01 €');
      const links = within(sources).getAllByRole('link');
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/konten/buchungen?buchung=out',
        '/konten/buchungen?buchung=refund',
      ]);
      fireEvent.click(links[0]!);
      await screen.findByTestId('lifecycle-raw-booking');
      expect(router.state.location.search).toMatchObject({ buchung: 'out' });
      await act(async () => router.history.back());
      await waitFor(() => expect(pending).toHaveLength(2));
      expect(router.state.location.search).toMatchObject({
        vorlage: 'heatmap',
        zeitraum: '1J',
        kategorien: ['food'],
        zelle: 'cat:food',
        spalte: '2024-02',
      });
      if (phase === 'pending-return-observed') {
        // Existing stale-scope protection intentionally hides the entire template while fetching.
        // Observe that lifecycle without turning it into a new close-while-pending requirement.
        expect(client.getQueryState(explorerTemplateQuery.queryKey)?.fetchStatus).toBe('fetching');
        expect(screen.queryByTestId('template-heatmap')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Buchungen schließen' })).toBeNull();
        console.info('625-unit-pending-return', {
          phase,
          sourcePresent: false,
          fetchStatus: 'fetching',
        });
      }
      await resolve(1);
      await screen.findByTestId('template-sources');
      const close = screen.getByRole('button', { name: 'Buchungen schließen' });
      fireEvent.click(close);
      await waitFor(() => {
        expect(router.state.location.search.zelle).toBeUndefined();
        expect(router.state.location.search.spalte).toBeUndefined();
      });
      await screen.findByTestId('template-heatmap');
      await waitFor(() => expect(screen.queryByTestId('template-sources')).toBeNull());
      expect(router.state.location.search).toMatchObject({
        vorlage: 'heatmap',
        zeitraum: '1J',
        kategorien: ['food'],
      });
      await waitFor(() => expect(document.activeElement).toBe(cell()));
      expect(
        calls.every(
          (call) => call.method === 'GET' && call.path === '/api/report-tables/income-expense',
        ),
      ).toBe(true);
    },
  );
});

describe('625 source close control stays in the source heading rather than after booking content', () => {
  it.each(['heatmap', 'year', 'total', 'category'] as const)(
    'keeps %s close semantics and source identity in the header',
    async (id) => {
      const { router } = mount(`?vorlage=${id}&zeitraum=1J&kategorien=%5B%22food%22%5D`);
      await screen.findByTestId(`template-${id}`);
      const cell = screen.getByRole('button', { name: /Lebensmittel · Februar 2024 · 20,01 €/ });
      fireEvent.click(cell);
      const sources = await screen.findByTestId('template-sources');
      const heading = within(sources).getByRole('heading', { level: 3 });
      const close = within(sources).getByRole('button', { name: 'Buchungen schließen' });
      const header = sources.querySelector('.ex-template-source-heading');
      expect(header).not.toBeNull();
      expect(header!.contains(heading)).toBe(true);
      expect(header!.contains(close)).toBe(true);
      expect(header!.querySelectorAll('button')).toHaveLength(1);
      expect(sources.getAttribute('aria-labelledby')).toBe(heading.id);
      const links = within(sources).getAllByRole('link');
      expect(
        Boolean(header!.compareDocumentPosition(links[0]!) & Node.DOCUMENT_POSITION_FOLLOWING),
      ).toBe(true);
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/konten/buchungen?buchung=out',
        '/konten/buchungen?buchung=refund',
      ]);
      expect(sources.textContent).toContain('Gewählte Zelle: 20,01 €');
      expect(sources.textContent).toContain('Summe der zugeordneten Anteile: 20,01 €');
      fireEvent.click(close);
      await waitFor(() => expect(screen.queryByTestId('template-sources')).toBeNull());
      expect(router.state.location.search).toMatchObject({
        vorlage: id,
        kategorien: ['food'],
      });
      expect(router.state.location.search).not.toHaveProperty('zelle');
      expect(router.state.location.search).not.toHaveProperty('spalte');
      expect(document.activeElement).toBe(cell);
      expect(saved.write).not.toHaveBeenCalled();
    },
  );
});
