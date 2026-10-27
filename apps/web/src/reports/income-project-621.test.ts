import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { validateReportSearch } from './report-search';
import { cashflowQuery } from './cashflow-api';
import { incomeReportQuery } from './month-api';
import { LEDGER_KEY } from '../ledger/queries';
import { filterFromSearch, validateBookingsSearch } from '../ledger/bookings-search';

afterEach(() => vi.unstubAllGlobals());

it('unions project/view filters with saved-view IDs and both exact-window URL spellings', () => {
  for (const exact of [true, 'true']) {
    expect(
      validateReportSearch({
        ansicht: 'server-saved-id',
        exakt: exact,
        vorlage: 'heatmap',
        projekt: 'a',
        darstellung: 'cashflow',
        kategorien: ['miete'],
        gruppen: ['g'],
      }),
    ).toMatchObject({
      ansicht: 'server-saved-id',
      exakt: true,
      vorlage: 'heatmap',
      projekt: 'a',
      darstellung: 'cashflow',
      kategorien: ['miete'],
      gruppen: ['g'],
    });
  }
  for (const projekt of ['', 'x'.repeat(65), 7])
    expect(validateReportSearch({ projekt })).toMatchObject({
      projekt: undefined,
      projektUngueltig: true,
    });
  expect(validateReportSearch({ projektUngueltig: 'true' })).toMatchObject({
    projektUngueltig: true,
  });
  expect(
    validateReportSearch({
      projekt: undefined,
      projektUngueltig: undefined,
      darstellung: 'unknown',
    }),
  ).toMatchObject({ projekt: undefined, projektUngueltig: undefined, darstellung: undefined });
});

it('retains legacy no-project cache keys/URLs and separates encoded project reads without writes', async () => {
  const client = new QueryClient();
  const fetch = vi.fn(async () => Response.json({ synthetic: true }));
  vi.stubGlobal('fetch', fetch);
  const period = '2026-08..2026-08';
  expect(cashflowQuery(period).queryKey).toEqual([...LEDGER_KEY, 'cashflow-report', period]);
  expect(incomeReportQuery('2026-08').queryKey).toEqual([
    ...LEDGER_KEY,
    'month-report',
    'income',
    '2026-08',
  ]);
  expect(cashflowQuery(period, 'a').queryKey).not.toEqual(cashflowQuery(period, 'b').queryKey);
  expect(incomeReportQuery('2026-08', 'a').queryKey).not.toEqual(
    incomeReportQuery('2026-08', 'b').queryKey,
  );
  try {
    await client.fetchQuery(cashflowQuery(period));
    await client.fetchQuery(incomeReportQuery('2026-08'));
    await client.fetchQuery(cashflowQuery(period, 'a /&'));
    await client.fetchQuery(incomeReportQuery('2026-08', 'a /&'));
    expect(fetch.mock.calls).toEqual([
      [`/api/cashflow?period=${period}`, expect.objectContaining({ method: 'GET' })],
      ['/api/reports/month/income?month=2026-08', expect.objectContaining({ method: 'GET' })],
      [
        `/api/cashflow?period=${period}&projectId=a%20%2F%26`,
        expect.objectContaining({ method: 'GET' }),
      ],
      [
        '/api/reports/month/income?month=2026-08&projectId=a%20%2F%26',
        expect.objectContaining({ method: 'GET' }),
      ],
    ]);
  } finally {
    client.clear();
  }
});

it('drills into an actual scoped booking ID using supported ledger fields and retains project context only in the report return URL', () => {
  const back =
    '/reports/einnahmen-ausgaben/buchungen?projekt=a&darstellung=overview&monat=2026-08&zeitraum=2026-08..2026-08&zelle=inc&spalte=2026-08';
  const search = validateBookingsSearch({
    buchung: 'salary-a',
    von: '2026-08-01',
    bis: '2026-08-31',
    ruecksprung: back,
  });
  expect(search).toMatchObject({
    buchung: 'salary-a',
    von: '2026-08-01',
    bis: '2026-08-31',
    ruecksprung: back,
  });
  expect(filterFromSearch(search)).toMatchObject({
    id: 'salary-a',
    from: '2026-08-01',
    to: '2026-08-31',
  });
  expect(filterFromSearch(search)).not.toHaveProperty('projectId');
});

it('rereads a fresh cached project on remount and exposes its deleted-scope error, while global reads stay cached', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000 } } });
  const global = incomeReportQuery('2026-08');
  const scoped = incomeReportQuery('2026-08', 'a');
  const cached = { income: { earnedCents: 100001 } };
  client.setQueryData([...global.queryKey], cached);
  client.setQueryData([...scoped.queryKey], cached);
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetch = vi.fn(() => pending);
  vi.stubGlobal('fetch', fetch);
  const globalObserver = new QueryObserver(client, global);
  const stopGlobal = globalObserver.subscribe(() => undefined);
  const scopedObserver = new QueryObserver(client, scoped);
  let stopScoped: () => void = () => undefined;
  try {
    expect(globalObserver.getCurrentResult().isFetching).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    stopScoped = scopedObserver.subscribe(() => undefined);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/reports/month/income?month=2026-08&projectId=a',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(scopedObserver.getCurrentResult().isFetching).toBe(true);
    expect(client.getQueryData(scoped.queryKey)).toEqual({ income: { earnedCents: 100001 } });
    finish(Response.json({ error: 'Project not found' }, { status: 404 }));
    await vi.waitFor(() => expect(scopedObserver.getCurrentResult().isError).toBe(true));
    expect(scopedObserver.getCurrentResult().isFetching).toBe(false);
    expect(scopedObserver.getCurrentResult().error).toMatchObject({ status: 404 });
    expect(globalObserver.getCurrentResult().isSuccess).toBe(true);
    expect(client.getQueryData(global.queryKey)).toEqual({ income: { earnedCents: 100001 } });
  } finally {
    finish(Response.json({ error: 'Project not found' }, { status: 404 }));
    stopScoped();
    stopGlobal();
    client.clear();
  }
});

it('rereads fresh cached A when the same observer switches from B and rejects deleted A', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000 } } });
  const a = incomeReportQuery('2026-08', 'a');
  const b = incomeReportQuery('2026-08', 'b');
  const cachedA = { income: { earnedCents: 100001 } };
  const cachedB = { income: { earnedCents: 200002 } };
  client.setQueryData([...a.queryKey], cachedA);
  client.setQueryData([...b.queryKey], cachedB);
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetch = vi.fn((path: string) =>
    path.endsWith('projectId=b') ? Promise.resolve(Response.json(cachedB)) : pending,
  );
  vi.stubGlobal('fetch', fetch);
  const observer = new QueryObserver(client, b);
  const stop = observer.subscribe(() => undefined);
  try {
    await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false));
    expect(observer.getCurrentResult().data?.income.earnedCents).toBe(200002);
    expect(fetch).toHaveBeenCalledTimes(1);
    observer.setOptions(a);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/reports/month/income?month=2026-08&projectId=a',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(observer.getCurrentResult().isFetching).toBe(true);
    expect(client.getQueryData(a.queryKey)).toEqual({ income: { earnedCents: 100001 } });
    finish(Response.json({ error: 'Project not found' }, { status: 404 }));
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    expect(observer.getCurrentResult().error).toMatchObject({ status: 404 });
  } finally {
    finish(Response.json({ error: 'Project not found' }, { status: 404 }));
    stop();
    client.clear();
  }
});
