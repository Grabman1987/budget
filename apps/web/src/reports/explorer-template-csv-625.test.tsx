// @vitest-environment jsdom
import { DEFAULT_EXPLORER_QUERY } from '@budget/domain';
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { ExplorerReportPage } from './explorer-report';
import { explorerTemplateQuery } from './explorer-template-api';
import { EXPLORER_CSV_CHANGED_MESSAGE, explorerQuery } from './overview-api';
import { validateReportSearch } from './report-search';

vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('./use-explorer-views', () => ({
  useExplorerViews: () => ({ views: [], data: { unavailable: false }, busy: false }),
}));

// Independent literal bytes of the unchanged custom #627 table, including BOM and effective window.
const CSV =
  '\uFEFF"record_type";"report_key";"period";"dimension";"class";"measure";"unit";"truncated_count";"row_key";"Kategorie";"Q1 24"\r\n' +
  '"data";"explorer";"3J";"kategorie";"want";"summe";"cents";0;"food";"Synthetic";1234\r\n';
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(explorerQuery(DEFAULT_EXPLORER_QUERY).queryKey, {
    today: '2024-03-05',
    ref: '2024-02',
    firstMonth: '2024-01',
    result: {
      query: DEFAULT_EXPLORER_QUERY,
      months: ['2024-01', '2024-02'],
      columns: [{ key: '2024-Q1', months: ['2024-01', '2024-02'] }],
      unit: 'cents',
      rows: [{ key: 'food', label: 'Synthetic', class: 'want', values: [1234], total: 1234 }],
      totals: null,
      truncated: 0,
      good: 'low',
    },
  });
  client.setQueryData(explorerTemplateQuery.queryKey, {
    asOf: '2024-03-05',
    firstMonth: null,
    lastFullMonth: null,
    currentMonth: '2024-03',
    categories: [],
    incomeTypes: [],
    months: [],
    splits: [],
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
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/reports/explorer'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const objectURL = vi.fn(() => 'blob:synthetic-625');
  const revoke = vi.fn();
  const OriginalURL = URL;
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static override createObjectURL = objectURL;
      static override revokeObjectURL = revoke;
    },
  );
  const filenames: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    filenames.push(this.download);
  });
  return { objectURL, revoke, filenames };
}
const response = () =>
  new Response(CSV, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="explorer-2024-01-2024-02.csv"',
    },
  });

describe('625 template/custom transitions retain627 exact CSV semantics', () => {
  it('rejects an otherwise byte-identical custom CSV when the displayed table switches to a fixed template', async () => {
    let resolve!: (value: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const { objectURL } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'CSV exportieren' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/api/overview/explorer.csv?');
    fireEvent.click(screen.getByRole('button', { name: 'Heatmap Ausgaben' }));
    await screen.findByTestId('template-heatmap');
    resolve(response());
    await screen.findByText(EXPLORER_CSV_CHANGED_MESSAGE, { exact: false });
    fireEvent.click(screen.getByRole('button', { name: 'Eigene Auswertung' }));
    await screen.findByText(EXPLORER_CSV_CHANGED_MESSAGE, { exact: false });
    expect(objectURL).not.toHaveBeenCalled();
  });

  it('still downloads the unchanged byte-validated current custom table after leaving a template', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response()),
    );
    const { objectURL, revoke, filenames } = mount();
    await screen.findByRole('button', { name: 'CSV exportieren' });
    fireEvent.click(screen.getByRole('button', { name: 'Gesamttabelle' }));
    await screen.findByTestId('template-total');
    fireEvent.click(screen.getByRole('button', { name: 'Eigene Auswertung' }));
    const button = await screen.findByRole('button', { name: 'CSV exportieren' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await act(async () => {
        fireEvent.click(button);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(objectURL).toHaveBeenCalledTimes(1);
      expect(filenames).toEqual(['explorer-2024-01-2024-02.csv']);
      expect(revoke).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(999);
      });
      expect(revoke).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(revoke).toHaveBeenCalledWith('blob:synthetic-625');
    } finally {
      vi.useRealTimers();
    }
  });
});
