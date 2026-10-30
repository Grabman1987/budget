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
import { createTestDatabase } from '@budget/db';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { HeutePage } from './heute-page';
import { DimensionPage } from './dimension-page';
import { heuteQuery, type Heute } from './api';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 360] }));
const day = '2026-09-17';
const search = { monat: '2026-09', period: 'month' as const };
let opened: ReturnType<typeof createTestDatabase>;
let client: QueryClient;
let data: Heute;
let writes: string[];
let inFlight: Set<Promise<Response>>;
let held: { promise: Promise<void>; release: () => void } | undefined;
const scroll = vi.fn();
const originalScroll = HTMLElement.prototype.scrollIntoView;

beforeEach(async () => {
  flags.REDESIGN_ENABLED = true;
  localStorage.clear();
  vi.stubGlobal('scrollTo', () => {});
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-17T08:30:00+02:00'));
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLElement.prototype.scrollIntoView = scroll;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 720,
    bottom: 300,
    width: 720,
    height: 300,
    toJSON() {
      return {};
    },
  });
  opened = createTestDatabase();
  opened.sqlite
    .exec(`INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents) VALUES
    ('budget','Synthetic budget','checking','budget',1,'2026-01-01',100000),
    ('positive','Selected positive','brokerage','investment',0,'2026-01-01',20000),
    ('negative','Selected negative','brokerage','investment',0,'2026-01-01',-3000),
    ('credit','Debt credit','checking','debt',0,'2026-01-01',500),
    ('loan','Synthetic loan','loan','debt',0,'2026-01-01',-7000);`);
  const api = createLedgerApi({
    db: opened.db,
    today: () => day,
    stepUp: async (_c, next) => next(),
  });
  data = (await (await api.request('/heute?period=month&month=2026-09')).json()) as Heute;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(heuteQuery('2026-09', 'month').queryKey, data);
  writes = [];
  held = undefined;
  inFlight = new Set();
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    if ((init?.method ?? 'GET') !== 'GET') writes.push(`${init?.method} ${url.pathname}`);
    const response = (async () => {
      if (url.pathname === '/api/heute' && held) await held.promise;
      return api.request(url.pathname.replace(/^\/api/, '') + url.search, init);
    })();
    inFlight.add(response);
    void response.then(
      () => inFlight.delete(response),
      () => inFlight.delete(response),
    );
    return response;
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
  scroll.mockClear();
  expect(writes).toEqual([]);
  expect(completed.filter((result) => result.status === 'rejected')).toEqual([]);
});

function mount(at = '/?monat=2026-09&period=month') {
  const root = createRootRoute({
    component: Outlet,
    validateSearch: (value: Record<string, unknown>) => ({
      monat: value['monat'],
      period: value['period'],
    }),
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [at] }),
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: HeutePage }),
      createRoute({
        getParentRoute: () => root,
        path: '/heute/details/$kind',
        component: DimensionPage,
      }),
    ]),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
const detail = '/heute/details/invested?monat=2026-09&period=month';

it('ON keeps selected signed Investiert separate from the positive Anlagen/net-debt chain', async () => {
  mount();
  const basis = await screen.findByRole('region', { name: 'Investiert · Anlagebasis' });
  expect(basis.textContent).toContain('170,00');
  const chain = await screen.findByTestId('heute-networth-chart');
  expect((await within(chain).findByRole('button', { name: /Anlagen/ })).textContent).toContain(
    '200',
  );
  expect(chain.textContent).toContain('Schulden (netto)');
  const source = within(basis).getByRole('link', { name: 'Quelle der Anlagebasis' });
  expect(source.getAttribute('href')).toBe(`${detail}#anlagebasis`);
  fireEvent.click(screen.getByRole('button', { name: 'Herleitung Nettovermögen' }));
  const note = document.getElementById('kennzahl-nettovermoegen-note')!;
  expect(note.textContent).toContain('Verbindlichkeiten 100,00');
  expect(note.textContent).toContain('Vermögen 1.205,00');
});

it('OFF retains its positive-asset Investiert label and does not add a selected-basis surface', async () => {
  flags.REDESIGN_ENABLED = false;
  mount(detail);
  expect(await screen.findByRole('heading', { name: 'Investiert', exact: true })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Investiert · Anlagebasis' })).toBeNull();
});

it('cold hash navigation waits for the source section and focuses its real heading', async () => {
  let release!: () => void;
  held = {
    promise: new Promise<void>((done) => {
      release = done;
    }),
    release: () => release(),
  };
  client.removeQueries({ queryKey: heuteQuery('2026-09', 'month').queryKey });
  mount(`${detail}#anlagebasis`);
  const heading = await screen.findByRole('heading', { name: 'Investiert · Anlagebasis' });
  expect(
    screen.getByRole('region', { name: 'Investiert · Anlagebasis' }).getAttribute('aria-busy'),
  ).toBe('true');
  expect(document.activeElement).not.toBe(heading);
  await act(async () => {
    held!.release();
  });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(heading.getAttribute('tabindex')).toBe('-1');
  expect(scroll).toHaveBeenCalled();
  const source = screen.getByRole('region', { name: 'Investiert · Anlagebasis' });
  expect(source.textContent).toContain('Beitrag zur Anlagebasis');
  expect(source.textContent).toContain('−30,00');
  expect(source.textContent).toContain('200,00');
  expect(
    within(source).getByRole('link', { name: 'Selected negative' }).getAttribute('href'),
  ).toContain('monat=2026-09&period=month');
});

it('same-page hash and Back/revisit focus once per navigation, not an ordinary data refresh', async () => {
  const router = mount(detail);
  await screen.findByRole('heading', { name: 'Anlagen', exact: true });
  await act(async () => {
    await router.navigate({
      to: '/heute/details/$kind',
      params: { kind: 'invested' },
      search,
      hash: 'anlagebasis',
    });
  });
  const heading = screen.getByRole('heading', { name: 'Investiert · Anlagebasis' });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  const sourceLink = screen.getByRole('link', { name: 'Freiheit vergleichen' });
  sourceLink.focus();
  const basis = data.investmentBasis;
  if (!basis || 'unavailable' in basis) throw new Error('Synthetic selected basis missing');
  await act(async () => {
    client.setQueryData(heuteQuery('2026-09', 'month').queryKey, {
      ...data,
      investmentBasis: {
        ...basis,
        accounts: basis.accounts.map((account, index) =>
          index ? account : { ...account, name: 'Refreshed source' },
        ),
      },
    });
  });
  await screen.findByRole('link', { name: 'Refreshed source' });
  expect(document.activeElement).toBe(sourceLink);
  await act(async () => {
    await router.navigate({ to: '/', search });
  });
  await act(async () => {
    router.history.back();
  });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Investiert · Anlagebasis' }),
    ),
  );
  expect(router.state.location.search).toMatchObject(search);
});

it('keeps a healthy selected basis visible when unrelated net-worth valuation is unavailable', async () => {
  client.setQueryData(heuteQuery('2026-09', 'month').queryKey, {
    ...data,
    netWorth: {
      unavailable: { reason: 'missing_fx', asOf: day, message: 'Unrelated USD valuation missing.' },
    },
  });
  mount(`${detail}#anlagebasis`);
  const basis = await screen.findByRole('region', { name: 'Investiert · Anlagebasis' });
  expect(basis.textContent).toContain('170,00');
  expect(screen.getByText(/Bewertung nicht verfügbar/)).toBeTruthy();
});

it.each([
  [0, '0,00'],
  [-3_000, '−30,00'],
  [null, 'Nicht verfügbar'],
] as const)(
  'preserves %s selected basis without recomputing it from the chain',
  async (value, text) => {
    client.setQueryData(heuteQuery('2026-09', 'month').queryKey, {
      ...data,
      investmentBasis: { asOf: day, investedCents: value, accounts: [] },
    });
    mount();
    const basis = await screen.findByRole('region', { name: 'Investiert · Anlagebasis' });
    expect(basis.textContent).toContain(text);
  },
);

it('ON labels a positive net credit as Guthaben auf Schuldkonten (netto)', async () => {
  opened.sqlite.exec("UPDATE account SET opening_balance_cents=0 WHERE id IN ('negative','loan')");
  const response = await fetch('/api/heute?period=month&month=2026-09');
  const refreshed = (await response.json()) as Heute;
  expect(refreshed.netWorth).toMatchObject({
    debtCents: 500,
    totalCents: 120_500,
    liabilitiesCents: 0,
  });
  client.setQueryData(heuteQuery('2026-09', 'month').queryKey, refreshed);
  mount('/heute/details/debt?monat=2026-09&period=month');
  const heading = await screen.findByRole('heading', {
    name: 'Guthaben auf Schuldkonten (netto)',
    exact: true,
  });
  expect(
    within(heading.closest('section')!).getByText('Guthaben auf Schuldkonten (netto)', {
      selector: 'strong',
    }),
  ).toBeTruthy();
});

it('shows known source gaps and an older missing basis as unavailable, never the positive-asset total', async () => {
  client.setQueryData(heuteQuery('2026-09', 'month').queryKey, {
    ...data,
    investmentBasis: {
      asOf: day,
      investedCents: null,
      accounts: [
        {
          id: 'fx',
          name: 'Selected missing source',
          valueCents: null,
          missingPrice: true,
          missingFxCurrencies: ['USD'],
        },
      ],
    },
  });
  mount(`${detail}#anlagebasis`);
  const basis = await screen.findByRole('region', { name: 'Investiert · Anlagebasis' });
  expect(basis.textContent).toContain('Nicht verfügbar');
  expect(basis.textContent).toContain('USD');
  expect(basis.textContent).toContain('Kurs fehlt');
  const older = { ...data };
  delete older.investmentBasis;
  await act(async () => {
    client.setQueryData(heuteQuery('2026-09', 'month').queryKey, older);
  });
  await waitFor(() =>
    expect(basis.textContent).toContain('Anlagebasis ist in diesem Stand nicht verfügbar'),
  );
});
