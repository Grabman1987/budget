// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { createTestDatabase, ensureDefaultRules } from '@budget/db';
import type { HistoryMatrix } from '@budget/domain';
import { ToastProvider } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { ReportRoute } from './reports-pages';
import { RulesPage } from '../rules/rules-page';
import { validateReportSearch } from '../reports/report-search';
import { isMonth } from '../nav/month';
import { isZeitraum } from '../wealth/zeitraum';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 360] }));
const bookmark =
  '/reports/onepager?monat=2026-08&period=month&zeitraum=2026-01..2026-08&darstellung=finanzcheck&trend=true&ansicht=synthetic-view&kategorien=%5B%22synthetic-food%22%5D#fc-matrix';
const days = [
  '2025-09-30',
  '2025-10-31',
  '2025-11-30',
  '2025-12-31',
  '2026-01-31',
  '2026-02-28',
  '2026-03-31',
  '2026-04-30',
  '2026-05-31',
  '2026-06-30',
  '2026-07-31',
  '2026-08-31',
  '2026-09-17',
];
let opened: ReturnType<typeof createTestDatabase>;
let client: QueryClient;
let inFlight: Set<Promise<Response>>;
let writes: string[];
let held: { promise: Promise<void>; release: () => void } | undefined;
const originalScroll = HTMLElement.prototype.scrollIntoView;

beforeEach(async () => {
  flags.REDESIGN_ENABLED = true;
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-17T08:30:00+02:00'));
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  opened = createTestDatabase();
  opened.sqlite.exec(`INSERT INTO account
    (id,name,type,role,on_budget,opening_date,opening_balance_cents)
    VALUES ('synthetic-budget','Synthetic budget','checking','budget',1,'2025-01-01',-500);`);
  ensureDefaultRules(opened.db);
  const api = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
  expect((await api.request('/rules/evaluate', { method: 'POST' })).status).toBe(200);
  const matrix = (await (await api.request('/rules/results')).json()) as HistoryMatrix;
  expect(matrix.days).toEqual(days);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  inFlight = new Set();
  writes = [];
  held = undefined;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    if ((init?.method ?? 'GET') !== 'GET') writes.push(`${init?.method} ${url.pathname}`);
    const result = (async () => {
      if (url.pathname === '/api/rules/results' && held) await held.promise;
      return api.request(url.pathname.replace(/^\/api/, '') + url.search, init);
    })();
    inFlight.add(result);
    void result.then(
      () => inFlight.delete(result),
      () => inFlight.delete(result),
    );
    return result;
  });
});

afterEach(async () => {
  cleanup();
  held?.release();
  await client.cancelQueries();
  const completed = await Promise.allSettled([...inFlight]);
  client.clear();
  opened.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalScroll) HTMLElement.prototype.scrollIntoView = originalScroll;
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.useRealTimers();
  // The existing report/settings visits may derive rule results, but must not book/edit money.
  expect(writes.every((write) => write === 'POST /api/rules/evaluate')).toBe(true);
  expect(completed.filter((result) => result.status === 'rejected')).toEqual([]);
});

function mount(at = bookmark) {
  const root = createRootRoute({
    component: Outlet,
    validateSearch: (value: Record<string, unknown>) => ({
      monat: isMonth(value['monat']) ? value['monat'] : undefined,
      period:
        value['period'] === 'month' || value['period'] === 'payday' ? value['period'] : undefined,
      zeitraum: isZeitraum(value['zeitraum']) ? value['zeitraum'] : undefined,
      trend: value['trend'] === true || value['trend'] === 'true' ? true : undefined,
    }),
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [at] }),
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/reports/$reportId',
        validateSearch: validateReportSearch,
        component: ReportRoute,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/einstellungen/regelwerk',
        component: RulesPage,
      }),
    ]),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

it('ON renders real stored history, follows R07 to its focused source and returns to the complete bookmark', async () => {
  const router = mount();
  await screen.findByRole('heading', { name: 'Finanz-Check-Verlauf' });
  await screen.findByRole('heading', { name: /aktive Regeln, 13 Auswertungstage/ });
  // The matrix has literal historical dates/statuses from the isolated real ledger, not a mocked body.
  const matrix = document.querySelector('.fc-table')!;
  expect(matrix.querySelectorAll('tr[data-rule="R07"] .ov-strip .ov-cell')).toHaveLength(13);
  const row = matrix.querySelector('tr[data-rule="R07"]')! as HTMLElement;
  expect(row.textContent).toContain('verletzt');
  expect(row.querySelector('.ov-cell')?.getAttribute('title')).toContain('Sep 25');
  expect(row.querySelector('.ov-cell:last-child')?.getAttribute('title')).toContain('17.09.');
  await screen.findByRole('heading', { name: 'R07 · Kontoprognose' });
  const source = within(row).getByRole('link', { name: /R07/ });
  expect(source.getAttribute('href')).toBe(
    '/einstellungen/regelwerk?monat=2026-08&period=month#rule-result-R07',
  );
  fireEvent.click(source);
  await waitFor(() => expect(document.activeElement?.id).toBe('rule-result-R07'));
  expect(router.state.location.search).toMatchObject({ monat: '2026-08', period: 'month' });
  expect(document.activeElement?.textContent).toContain('Stand 17.09.2026');
  await act(async () => router.history.back());
  await screen.findByRole('heading', { name: 'Finanz-Check-Verlauf' });
  expect(router.state.location.href).toBe(bookmark);
  cleanup();
  mount(router.state.location.href);
  await screen.findByRole('heading', { name: 'Finanz-Check-Verlauf' });
  expect(document.querySelector('.fc-table tr[data-rule="R07"]')).toBeTruthy();
});

it('ON focuses a recognized cold matrix hash only after real history loads, without stealing refetch focus', async () => {
  let release = () => {};
  held = {
    promise: new Promise<void>((resolve) => {
      release = resolve;
    }),
    release: () => release(),
  };
  mount();
  await screen.findByRole('heading', { name: 'Finanz-Check-Verlauf' });
  expect(document.getElementById('fc-matrix')).toBeNull();
  held.release();
  await waitFor(() => expect(document.activeElement?.id).toBe('fc-matrix'));
  const source = screen.getByRole('link', { name: /R07/ });
  source.focus();
  await act(async () => {
    await client.invalidateQueries();
  });
  expect(document.activeElement).toBe(source);
});

it.each([
  [false, 'finanzcheck'],
  [true, 'unknown-finanzcheck'],
  [true, undefined],
])('keeps the real OnePager for flag %s and presentation %s', async (enabled, presentation) => {
  flags.REDESIGN_ENABLED = enabled;
  mount(
    `/reports/onepager?monat=2026-08&period=month${presentation ? `&darstellung=${presentation}` : ''}`,
  );
  await screen.findByRole('heading', { name: 'Monats-One-Pager' });
  await screen.findByRole('article', { name: 'Monats-One-Pager August 2026' });
  expect(screen.queryByRole('heading', { name: 'Finanz-Check-Verlauf' })).toBeNull();
  expect(screen.queryByRole('link', { name: /R07/ })).toBeNull();
});

it('does not turn an unknown report ID into a Finanzcheck via the presentation selector', async () => {
  mount('/reports/unknown?darstellung=finanzcheck');
  await screen.findByRole('heading', { name: 'Report nicht gefunden' });
  expect(screen.queryByRole('heading', { name: 'Finanz-Check-Verlauf' })).toBeNull();
});
