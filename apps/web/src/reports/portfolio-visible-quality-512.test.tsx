// @vitest-environment jsdom
// OUTSIDE PROPOSAL ONLY. Uses existing exports; no product adoption or execution yet.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { benchmarkSelection, createTestDatabase, portfolioSummary } from '@budget/db';
import { eachDay } from '@budget/domain';
import { setAmountsHidden, ToastProvider } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import { PortfolioPerformanceReport } from '../pages/portfolio-performance-report';
import { PortfolioOverview } from '../wealth/portfolio-overview';
import { portfolioPerformanceQuery } from '../wealth/portfolio-api';
import { AUTH_STATUS_KEY } from '../auth/status-query';
import { REPORTS } from '../nav/reports-catalog';
import { REPORTS_CATALOG } from '../nav/pages';

const opened: ReturnType<typeof createTestDatabase>[] = [];
const clients: QueryClient[] = [];
const unexpectedTransport: string[] = [];
const FROM = '2026-08-20',
  TO = '2026-09-20';
function response(shape: boolean | 'carried-quote' | 'carried-fx') {
  const fresh = shape === true,
    carryQuote = shape === 'carried-quote',
    carryFx = shape === 'carried-fx';
  const f = createTestDatabase();
  opened.push(f);
  f.sqlite.exec(`
    INSERT INTO account(id,name,type,role,on_budget,opening_date) VALUES ('a','Musterdepot','brokerage','investment',0,'2026-08-20');
    INSERT INTO security(id,name,kind,currency) VALUES ('s','Musterwertpapier','stock','EUR');
    INSERT INTO holding(id,account_id,security_id,as_of,units_e8,cost_basis_cents) VALUES ('h','a','s','2026-08-20',100000000,10000);
    INSERT INTO account(id,name,type,role,on_budget,currency,allocation_scope,opening_date,opening_balance_cents)
      VALUES ('chf','Andere Allokationskassa','checking','investment',0,'CHF','included','2026-08-20',10000);
  `);
  const dates =
    fresh || carryQuote || carryFx ? eachDay(FROM, carryQuote ? '2026-09-18' : TO) : [FROM, TO];
  const insert = f.sqlite.prepare(
    "INSERT INTO price(security_id,date,price_micro,currency,source) VALUES ('s',?,?,?,'manual')",
  );
  for (const date of dates)
    insert.run(
      date,
      carryFx
        ? date >= '2026-09-18'
          ? 120000000
          : 100000000
        : date === TO || (carryQuote && date === '2026-09-18')
          ? 114000000
          : 100000000,
      carryFx ? 'USD' : 'EUR',
    );
  if (carryFx) {
    const rate = f.sqlite.prepare(
      "INSERT INTO fx_rate(currency,date,rate_micro,source) VALUES ('USD',?,?,'ecb')",
    );
    for (const date of eachDay(FROM, '2026-09-18'))
      rate.run(date, date === '2026-09-18' ? 950000 : 1000000);
  }
  const portfolio = portfolioSummary(f.db, {
    today: TO,
    period: '1M',
    view: 'securities',
    includePerformanceHistory: true,
    valuationProvenance: 'valuation-v1',
  });
  expect(portfolio.performance).toMatchObject({
    startValueCents: 10000,
    endValueCents: 11400,
    gainCents: 1400,
    from: FROM,
    to: TO,
    days: 31,
  });
  expect(portfolio.performance?.ttwror).toBeCloseTo(0.14, 12);
  expect(portfolio.quality.missingFxAccountIds).toEqual(['chf']);
  return { portfolio };
}
type Data = ReturnType<typeof response>;
type Surface = 'report' | 'overview';
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
  for (const c of clients.splice(0)) c.clear();
  for (const f of opened.splice(0)) f.close();
  const attempted = unexpectedTransport.splice(0);
  vi.unstubAllGlobals();
  expect(attempted).toEqual([]);
});
async function mount(surface: Surface, data: Data) {
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method =
        init?.method ?? (typeof input === 'string' || input instanceof URL ? 'GET' : input.method);
      unexpectedTransport.push(method + ' ' + new URL(url, 'http://synthetic.invalid').pathname);
      return Promise.reject(new Error('Unexpected uncached API request'));
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(AUTH_STATUS_KEY, {
    setupRequired: false,
    authenticated: true,
    stepUpValidUntil: null,
    viaRecovery: false,
  });
  client.setQueryData(portfolioPerformanceQuery('1M').queryKey, data);
  // Real endpoint-local selection from this case's sole live synthetic ledger.
  const ledger = opened.at(-1);
  if (!ledger) throw new Error('Fixture ledger missing');
  const selection: ReturnType<typeof benchmarkSelection> = benchmarkSelection(ledger.db);
  client.setQueryData(['portfolio-benchmarks'], selection);
  const report = REPORTS.find((x) => x.id === 'prendite');
  if (!report) throw new Error('Existing Report entry missing');
  const root = createRootRoute({
    component: () => (
      <main>
        <Outlet />
      </main>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/reports/$reportId',
        validateSearch: (search: Record<string, unknown>) => search,
        component: () => <PortfolioPerformanceReport report={report} meta={REPORTS_CATALOG} />,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/vermoegen/portfolio',
        validateSearch: (search: Record<string, unknown>) => search,
        component: PortfolioOverview,
      }),
    ]),
    history: createMemoryHistory({
      initialEntries: [
        surface === 'report' ? '/reports/prendite?zeitraum=1M' : '/vermoegen/portfolio?zeitraum=1M',
      ],
    }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const result = await screen.findByTestId(
    surface === 'report' ? 'period-ttwror' : 'portfolio-return',
  );
  if (surface === 'report') expect(result.textContent).toBe('+14 %');
  else {
    expect(result.textContent).not.toContain('≈');
    expect(result.closest('details')?.hasAttribute('open')).toBe(false);
  }
  return { result, user: userEvent.setup() };
}
function expectLocalCue(result: HTMLElement, message: string) {
  const cue = screen.getByRole('status', { name: 'Historische Bewertungsgrundlage' });
  expect(cue.textContent).toContain(message);
  expect(cue.id).not.toBe('');
  expect(result.getAttribute('aria-describedby')?.split(/\s+/)).toContain(cue.id);
  expect(result.closest('details')?.contains(cue) ?? false).toBe(false);
  // Visible while the original return disclosure is closed; avoid mere existence inside details.
  for (let node: HTMLElement | null = cue; node; node = node.parentElement) {
    expect(node.hidden).toBe(false);
    expect(getComputedStyle(node).display).not.toBe('none');
    if (node.tagName === 'DETAILS') expect(node.hasAttribute('open')).toBe(true);
  }
  return cue;
}
for (const surface of ['report', 'overview'] as const) {
  it(`${surface}: separately qualifies selected carried history while preserving the original result and closed summary`, async () => {
    const data = response(false);
    const before = JSON.stringify(data);
    expect(data.portfolio.valuationProvenance?.runs.some((r) => r.quality === 'stale')).toBe(true);
    const { result, user } = await mount(surface, data);
    if (surface === 'report')
      expect(screen.getByTestId('report-verdict').textContent).not.toContain('geschätzt');
    const cue = expectLocalCue(result, '≈ Bewertungsdaten fortgeschrieben');
    expect(cue.textContent).not.toContain('Rendite geschätzt');
    await user.click(within(cue).getByRole('link', { name: 'Bewertungsquellen ansehen' }));
    const sourceSummary = screen.getByText('Historische Bewertungsquellen', { exact: true });
    expect(sourceSummary.closest('details')?.hasAttribute('open')).toBe(true);
    expect(document.activeElement).toBe(sourceSummary);
    expect(JSON.stringify(data)).toBe(before);
  });
  it(`${surface}: does not qualify fresh selected history merely because current unrelated cash FX is missing`, async () => {
    const data = response(true);
    expect(data.portfolio.valuationProvenance?.coverage.complete).toBe(true);
    expect(
      data.portfolio.valuationProvenance?.runs.every(
        (r) => r.quality === 'exact' && r.date === r.from && r.from === r.to,
      ),
    ).toBe(true);
    await mount(surface, data);
    expect(screen.queryByRole('status', { name: 'Historische Bewertungsgrundlage' })).toBeNull();
  });
  for (const shape of ['carried-quote', 'carried-fx'] as const)
    it(`${surface}: qualifies actual carried ${shape} even while original quality stays exact`, async () => {
      const data = response(shape),
        runs = data.portfolio.valuationProvenance?.runs;
      if (!runs) throw new Error('Fixture lacks original selected observations');
      expect(runs.every((r) => r.quality === 'exact')).toBe(true);
      if (shape === 'carried-quote')
        expect(runs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              from: '2026-09-18',
              to: TO,
              date: '2026-09-18',
              quality: 'exact',
            }),
          ]),
        );
      else {
        expect(runs.every((r) => r.date === r.from && r.from === r.to)).toBe(true);
        expect(runs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              from: TO,
              to: TO,
              fx: { kind: 'rate', date: '2026-09-18', source: 'ecb' },
            }),
          ]),
        );
      }
      const before = JSON.stringify(data);
      const { result } = await mount(surface, data);
      expectLocalCue(result, '≈ Bewertungsdaten fortgeschrieben');
      expect(JSON.stringify(data)).toBe(before);
    });
  it(`${surface}: preserves both known carried basis and unknown omitted facts in one truncated response`, async () => {
    const data = response(false),
      m = data.portfolio.valuationProvenance;
    if (!m) throw new Error('Fixture lacks original selected observations');
    expect(m.runs.at(-1)).toMatchObject({ from: TO, to: TO, days: '1' });
    data.portfolio.valuationProvenance = {
      ...m,
      runs: m.runs.slice(0, -1),
      coverage: {
        ...m.coverage,
        complete: false,
        truncated: true,
        byteLimit: true,
        retainedRuns: m.runs.length - 1,
        retainedPositionDays: '31',
        omittedPositionDays: '1',
        omittedRuns: '1',
      },
    };
    expect(data.portfolio.valuationProvenance.runs.some((r) => r.quality === 'stale')).toBe(true);
    const before = JSON.stringify(data);
    const { result } = await mount(surface, data);
    const cue = expectLocalCue(result, '≈ Bewertungsdaten fortgeschrieben');
    expect(cue.textContent).toContain('Quellenhinweise unvollständig');
    expect(JSON.stringify(data)).toBe(before);
  });
  // Consumer-only supplied-DTO contracts: producer branch/value proofs already exist in
  // domain/DB/API tests. These variants do not claim a fresh monetary recomputation.
  for (const [kind, text] of [
    ['cost-estimate', '≈ Bewertung teilweise geschätzt'],
    ['future-execution', '≈ Spätere Ausführung als Bewertungsfallback'],
    ['missing-cost-fx', 'Bewertung teilweise nicht verfügbar'],
    ['unknown-label', 'Quellenhinweise unvollständig'],
  ] as const)
    it(`${surface}: gives ${kind} its own historical-basis reason without changing the supplied monetary result`, async () => {
      const data = response(true),
        m = data.portfolio.valuationProvenance;
      if (!m || !m.runs[0]) throw new Error('Fixture lacks actual selected source');
      if (kind === 'unknown-label')
        data.portfolio.valuationProvenance = {
          ...m,
          runs: m.runs.map((r) => ({ ...r, source: null })),
          coverage: { ...m.coverage, complete: false, unknownSourceLabelPositionDays: '32' },
        };
      else {
        const common = { ...m.runs[0], from: FROM, to: TO, days: '32', source: null };
        const run =
          kind === 'future-execution'
            ? {
                ...common,
                kind: 'execution' as const,
                quality: 'exact' as const,
                date: '2026-09-21',
                lookAhead: true,
              }
            : {
                ...common,
                kind: 'cost' as const,
                quality: kind === 'missing-cost-fx' ? ('missing' as const) : ('estimated' as const),
                date: null,
                lookAhead: false,
                costMethod: 'average' as const,
                ...(kind === 'missing-cost-fx'
                  ? { currency: 'USD', fx: { kind: 'missing' as const }, missing: 'fx' as const }
                  : {}),
              };
        data.portfolio.valuationProvenance = {
          ...m,
          runs: [run],
          coverage: { ...m.coverage, observedRuns: '1', retainedRuns: 1 },
        };
      }
      const before = JSON.stringify(data);
      const { result } = await mount(surface, data);
      expectLocalCue(result, text);
      expect(JSON.stringify(data)).toBe(before);
    });
  for (const state of ['absent', 'truncated'] as const)
    it(`${surface}: ${state} metadata is unknown, never a claim of exact complete return`, async () => {
      const data = response(true);
      if (state === 'absent') delete data.portfolio.valuationProvenance;
      else {
        const m = data.portfolio.valuationProvenance;
        if (!m) throw new Error('Fixture lacks opted-in metadata');
        data.portfolio.valuationProvenance = {
          ...m,
          runs: [],
          coverage: {
            ...m.coverage,
            retainedRuns: 0,
            retainedPositionDays: '0',
            omittedRuns: m.coverage.observedRuns,
            omittedPositionDays: m.coverage.observedPositionDays,
            complete: false,
            truncated: true,
            byteLimit: true,
          },
        };
      }
      const before = JSON.stringify(data);
      const { result } = await mount(surface, data);
      const cue = expectLocalCue(result, 'Quellenhinweise unvollständig');
      expect(cue.textContent).not.toMatch(/Rendite exakt|Rendite vollständig|Rendite geschätzt/);
      expect(JSON.stringify(data)).toBe(before);
    });
}
