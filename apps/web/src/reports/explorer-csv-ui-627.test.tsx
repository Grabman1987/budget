// @vitest-environment jsdom
import { DEFAULT_EXPLORER_QUERY, explorerCsv, type ExplorerQuery } from '@budget/domain';
import type { ExplorerReport } from '@budget/db';
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { ExplorerReportPage } from './explorer-report';
import { explorerQuery } from './overview-api';

vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#synthetic">{children}</a>,
}));
vi.mock('./period-quick-select', () => ({ PeriodQuickSelect: () => null }));
vi.mock('./use-explorer-views', () => ({
  useExplorerViews: () => ({ views: [], data: { unavailable: false }, busy: false }),
}));

const table = (query: ExplorerQuery = DEFAULT_EXPLORER_QUERY): ExplorerReport => ({
  today: '2024-03-05',
  ref: '2024-02',
  firstMonth: '2024-01',
  result: {
    query,
    months: ['2024-01', '2024-02'],
    columns: [{ key: query.cols === 'jahr' ? '2024' : '2024-Q1', months: ['2024-01', '2024-02'] }],
    unit: 'cents',
    rows: [{ key: 'a', label: 'Synthetic category', class: 'want', values: [1234], total: 1234 }],
    totals: null,
    truncated: 0,
    good: 'low',
  },
});
const csvResponse = (text: string) =>
  new Response(text, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="explorer-2024-01-2024-02.csv"',
    },
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
const createObjectURL = vi.fn(() => 'blob:synthetic-explorer-627');
const revokeObjectURL = vi.fn();
const clickedFilenames: string[] = [];
beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clickedFilenames.length = 0;
  const OriginalURL = URL;
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clickedFilenames.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const report: ReportEntry = {
    id: 'explorer',
    pos: '5.3',
    name: 'Explorer',
    question: 'Synthetic',
    form: 'Pivot',
    controls: [],
  };
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ExplorerReportPage report={report} meta={{} as PageMeta} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return client;
}
const button = () => screen.getByRole('button', { name: 'CSV exportieren' }) as HTMLButtonElement;

describe('Explorer #627 current-result UI export guard', () => {
  it('cannot export pending, refetching, placeholder or failed report data', async () => {
    let next = deferred<Response>();
    const csv = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => (path.includes('.csv?') ? csv() : next.promise)),
    );
    const client = mount();
    expect(screen.queryByRole('button', { name: 'CSV exportieren' })).toBeNull();
    await act(async () => next.resolve(Response.json(table())));
    await waitFor(() => expect(button().disabled).toBe(false));

    next = deferred<Response>();
    await act(async () => {
      void client.invalidateQueries({ queryKey: explorerQuery(DEFAULT_EXPLORER_QUERY).queryKey });
    });
    await waitFor(() => expect(button().disabled).toBe(true));
    fireEvent.click(button());
    expect(csv).not.toHaveBeenCalled();
    await act(async () => next.resolve(Response.json({ error: 'unavailable' }, { status: 503 })));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(button().disabled).toBe(true);
    expect(screen.getByTestId('ex-table').textContent).toContain('Synthetic category');
  });

  it('does not export a successful response for a different tuple', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(table({ ...DEFAULT_EXPLORER_QUERY, cls: 'alle' }))),
    );
    mount();
    await screen.findByTestId('ex-table');
    expect(button().disabled).toBe(true);
    expect((screen.getByLabelText('Klasse') as HTMLSelectElement).value).toBe('want');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('keeps the old pivot visible but disables placeholder export and rejects an in-flight tuple change', async () => {
    const pendingCsv = deferred<Response>();
    const pendingTable = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.includes('.csv?')) return pendingCsv.promise;
        const query = new URL(path, 'https://synthetic.test').searchParams;
        return query.get('cols') === 'jahr' ? pendingTable.promise : Response.json(table());
      }),
    );
    mount();
    await waitFor(() => expect(button().disabled).toBe(false));
    fireEvent.click(button());
    fireEvent.change(screen.getByLabelText('Spalten'), { target: { value: 'jahr' } });
    expect(screen.getByTestId('ex-table').textContent).toContain('Synthetic category');
    expect(
      (screen.getByRole('button', { name: 'CSV wird geprüft …' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () =>
      pendingTable.resolve(Response.json(table({ ...DEFAULT_EXPLORER_QUERY, cols: 'jahr' }))),
    );
    await act(async () => pendingCsv.resolve(csvResponse(explorerCsv(table().result))));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Daten haben sich geändert'),
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Spalten') as HTMLSelectElement).value).toBe('jahr');
    expect(screen.getByTestId('ex-table').textContent).toContain('2024');
  });

  it('downloads no file for changed server data, retains the view, and allows a clean retry', async () => {
    let changed = true;
    const view = table();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (!path.includes('.csv?')) return Response.json(view);
        const csv = explorerCsv(view.result);
        return csvResponse(changed ? csv.replace(';1234\r\n', ';1235\r\n') : csv);
      }),
    );
    mount();
    await waitFor(() => expect(button().disabled).toBe(false));
    fireEvent.click(button());
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Daten haben sich geändert'),
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByTestId('ex-table').textContent).toContain('Synthetic category');
    expect((screen.getByLabelText('Spalten') as HTMLSelectElement).value).toBe('quartal');
    changed = false;
    fireEvent.click(button());
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(clickedFilenames).toEqual(['explorer-2024-01-2024-02.csv']);
    expect(document.querySelector('a[download]')).toBeNull();
    await waitFor(
      () => expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-explorer-627'),
      { timeout: 1500 },
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
