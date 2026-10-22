// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { inboxPagesQuery, type InboxStored } from './api';
import { InboxPage, InboxWorkflow } from './inbox-page';
import { validateInboxSearch } from './navigation';

vi.mock('../pages/area-head', () => ({ AreaHead: () => <h1>Prüfen</h1> }));
vi.mock('../receipts/receipt-section', () => ({ ReceiptSection: () => <p>Belegbereich</p> }));

const a = '72400000-0000-4000-8000-000000000001';
const b = '72400000-0000-4000-8000-000000000002';
const clients: QueryClient[] = [];
const forbiddenWrites: string[] = [];
beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
  expect(forbiddenWrites.splice(0)).toEqual([]);
});

function candidate(id: string, memo: string): InboxStored {
  return {
    type: 'stored',
    id,
    kind: 'import',
    title: 'Bankumsatz prüfen',
    detail: null,
    refType: 'bank-sync-candidate',
    refId: id,
    urgent: false,
    createdAt: '2026-10-20T08:00:00Z',
    bankCandidate: {
      date: '2026-10-19',
      amountCents: -1201,
      currency: 'EUR',
      memo,
      payeeName: null,
      accountName: 'Gleiches Konto',
    },
  };
}
function page(entries: InboxStored[], next: number | null = null, total = entries.length) {
  return {
    asOf: '2026-10-20',
    count: total,
    totalEntries: total,
    entries,
    readSourceSummaries: [],
    countsByKind: { import: total },
    countsByCause: {},
    limit: 100,
    offset: 0,
    next,
  };
}
function fetchFixture(reply: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: URL[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) forbiddenWrites.push(method);
    const url = new URL(String(input), 'http://localhost');
    calls.push(url);
    return reply(url, init);
  });
  return calls;
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function mount(path: string, global = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const root = createRootRoute({ validateSearch: validateInboxSearch, component: Outlet });
  const account = createRoute({
    getParentRoute: () => root,
    path: '/konten/$id',
    component: () => {
      const { id } = account.useParams();
      return (
        <>
          <Link
            to="/konten/$id"
            params={{ id: b }}
            search={((previous: Record<string, unknown>) => previous) as never}
          >
            Anderes Konto öffnen
          </Link>
          <InboxWorkflow key={id} bankAccountId={id} />
        </>
      );
    },
  });
  const inbox = createRoute({
    getParentRoute: () => root,
    path: '/konten/pruefen',
    component: InboxPage,
  });
  const router = createRouter({
    routeTree: root.addChildren(global ? [inbox] : [account]),
    history: createMemoryHistory({ initialEntries: [path] }),
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

it('requests each actual account ID despite equal names and ignores global source/period/task filters without changing the URL', async () => {
  const calls = fetchFixture((url) =>
    json(
      page([
        candidate(
          url.searchParams.get('bankAccountId')!,
          url.searchParams.get('bankAccountId') === a ? 'Umsatz A' : 'Umsatz B',
        ),
      ]),
    ),
  );
  const search =
    '?bankSource=72400000-0000-4000-8000-000000000099&aufgaben=historical&teil=aufgaben&gruppe=foreign';
  const { router } = mount(`/konten/${a}${search}`);
  await screen.findByText(/Umsatz A · −12,01\s€/);
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByText('Belegbereich')).toBeNull();
  expect(screen.queryByLabelText('Zeitraum der Aufgaben')).toBeNull();
  expect(router.state.location.search).toMatchObject({
    bankSource: '72400000-0000-4000-8000-000000000099',
    aufgaben: 'historical',
    teil: 'aufgaben',
    gruppe: 'foreign',
  });
  await userEvent.click(screen.getByRole('link', { name: 'Anderes Konto öffnen' }));
  await screen.findByText(/Umsatz B · −12,01\s€/);
  expect(router.state.location.pathname).toBe(`/konten/${b}`);
  expect(router.state.location.search).toMatchObject({
    bankSource: '72400000-0000-4000-8000-000000000099',
    aufgaben: 'historical',
    teil: 'aufgaben',
    gruppe: 'foreign',
  });
  expect(screen.queryByText(/Umsatz A · −12,01\s€/)).toBeNull();
  const queues = calls.filter((url) => url.pathname === '/api/inbox');
  expect(queues.map((url) => url.searchParams.get('bankAccountId'))).toEqual([a, b]);
  for (const url of queues) {
    expect(url.searchParams.get('segment')).toBe('umsaetze');
    expect(url.searchParams.has('bankSource')).toBe(false);
    expect(url.searchParams.has('period')).toBe(false);
  }
});

it('keeps the first page on a next-page failure and retries the same server offset without duplicating rows', async () => {
  let fail = true;
  const calls = fetchFixture((url) => {
    if (url.searchParams.get('offset') === '100') {
      if (fail) return json({ error: 'synthetic failure' }, 503);
      return json(page([candidate('second', 'Zweiter Umsatz')], null, 2));
    }
    return json(page([candidate('first', 'Erster Umsatz')], 100, 2));
  });
  mount(`/konten/${a}`);
  await screen.findByText(/Erster Umsatz · −12,01\s€/);
  await userEvent.click(screen.getByRole('button', { name: /Weitere anzeigen/ }));
  await screen.findByRole('alert');
  expect(screen.getByText(/Erster Umsatz · −12,01\s€/)).toBeTruthy();
  fail = false;
  await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  await screen.findByText(/Zweiter Umsatz · −12,01\s€/);
  expect(screen.getAllByTestId('inbox-row')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /Weitere anzeigen/ })).toBeNull();
  expect(calls.map((url) => url.searchParams.get('offset'))).toEqual(['0', '100', '100']);
});

it('hides stale account work on a fatal refresh error and offers retry and a truthful empty state', async () => {
  let failed = false;
  let empty = false;
  fetchFixture(() =>
    failed
      ? json({ error: 'synthetic failure' }, 503)
      : json(page(empty ? [] : [candidate('first', 'Vorheriger Umsatz')])),
  );
  const { client } = mount(`/konten/${a}`);
  await screen.findByText(/Vorheriger Umsatz · −12,01\s€/);
  failed = true;
  await act(() =>
    client.invalidateQueries({
      queryKey: inboxPagesQuery('all', undefined, 'newest', undefined, 'umsaetze', undefined, a)
        .queryKey,
    }),
  );
  await screen.findByRole('alert');
  expect(screen.queryByText(/Vorheriger Umsatz · −12,01\s€/)).toBeNull();
  failed = false;
  empty = true;
  await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Bankumsätze prüfen' })).toBeNull(),
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('renders actual bank-candidate work before the account-reminder section without any display write', async () => {
  const calls = fetchFixture((url) =>
    url.pathname === '/api/bank-sync'
      ? json({ configured: false, connections: [], accounts: [] })
      : url.pathname === '/api/accounts/reminders'
        ? json({
            reminders: [
              {
                accountId: a,
                accountName: 'Gleiches Konto',
                days: 30,
                dueOn: null,
                action: 'balance',
              },
            ],
          })
        : json({
            ...page([candidate('first', 'Ungeprüfter Bankumsatz')]),
            segment: 'umsaetze',
            segments: { umsaetze: 1, aufgaben: 0 },
          }),
  );
  mount('/konten/pruefen?von=%2F', true);
  const work = await screen.findByText(/Ungeprüfter Bankumsatz · −12,01\s€/);
  const bankStatus = await screen.findByRole('region', { name: 'Bankstatus' });
  expect(bankStatus).toHaveTextContent('Bank: nicht verbunden');
  expect(
    within(bankStatus).getByRole('link', { name: 'Einrichten' }).getAttribute('href'),
  ).toBe('/einstellungen/datenquellen');
  const reminder = await screen.findByRole('heading', { name: 'Konten prüfen' });
  expect(work.compareDocumentPosition(reminder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await waitFor(() =>
    expect(calls.some((url) => url.pathname === '/api/accounts/reminders')).toBe(true),
  );
  expect(
    calls.every((url) =>
      ['/api/inbox', '/api/accounts/reminders', '/api/bank-sync'].includes(url.pathname),
    ),
  ).toBe(true);
});

it('shows the latest successful retrieval time for an active bank connection', async () => {
  fetchFixture((url) =>
    url.pathname === '/api/bank-sync'
      ? json({
          configured: true,
          connections: [
            { status: 'active', lastSuccessAt: '2026-10-22T04:12:00.000Z' },
            { status: 'active', lastSuccessAt: '2026-10-21T16:30:00.000Z' },
          ],
          accounts: [],
        })
      : url.pathname === '/api/accounts/reminders'
        ? json({ reminders: [] })
        : json({
            ...page([]),
            segment: 'umsaetze',
            segments: { umsaetze: 0, aufgaben: 0 },
          }),
  );
  mount('/konten/pruefen', true);
  const bankStatus = await screen.findByRole('region', { name: 'Bankstatus' });
  expect(bankStatus).toHaveTextContent('Bank: verbunden · zuletzt 06:12');
  expect(within(bankStatus).queryByRole('link', { name: 'Einrichten' })).toBeNull();
  expect(screen.getAllByRole('region', { name: 'Bankstatus' })).toHaveLength(1);
});

it('retains the real learning offer after confirming the last candidate and refetching an empty account queue', async () => {
  const id = '72400000-0000-4000-8000-000000000003';
  const bookingId = '72400000-0000-4000-8000-000000000004';
  const revision = 'a'.repeat(64);
  let confirmed = false;
  const posts: { path: string; body: unknown }[] = [];
  fetchFixture((url, init) => {
    if ((init?.method ?? 'GET') === 'POST') {
      posts.push({ path: url.pathname, body: JSON.parse(String(init?.body)) });
      expect(url.pathname).toBe(`/api/bank-sync/candidates/${id}/confirm`);
      confirmed = true;
      return json({ groupId: 'synthetic-724-confirm', bookingId });
    }
    if (url.pathname === '/api/inbox')
      return json(page(confirmed ? [] : [candidate(id, 'Letzter Umsatz')]));
    if (url.pathname === '/api/lookups')
      return json({
        categories: [{ id: 'category-724', name: 'Kategorie A', kind: 'variable' }],
        incomeTypes: [],
      });
    if (url.pathname === '/api/payees') return json({ payees: [] });
    if (url.pathname === `/api/bank-sync/candidates/${id}/matches`)
      return json({ merge: [], link: [], transfers: [] });
    if (url.pathname === `/api/assignment-rules/candidates/${id}`)
      return json({
        suggestions: [],
        cleanup: { cleaned: 'Shop A', payeeId: null },
        candidateRevision: revision,
      });
    throw new Error(`Unexpected synthetic read: ${url.pathname}`);
  });
  const { client } = mount(`/konten/${a}`);
  await screen.findByText(/Letzter Umsatz · −12,01\s€/);
  await userEvent.click(screen.getByText('Vorschläge beim Öffnen prüfen', { exact: true }));
  await screen.findByRole('option', { name: 'Kategorie A' });
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Kategorie' }),
    'category-724',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Als Buchung bestätigen' }).getAttribute('disabled'),
    ).toBeNull(),
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Als Buchung bestätigen' }));
  const key = inboxPagesQuery(
    'all',
    undefined,
    'newest',
    undefined,
    'umsaetze',
    undefined,
    a,
  ).queryKey;
  await waitFor(() =>
    expect(client.getQueryData<{ pages: ReturnType<typeof page>[] }>(key)?.pages[0]?.count).toBe(0),
  );
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Regel daraus erstellen' })).toBeTruthy();
    expect(screen.queryByText(/Letzter Umsatz · −12,01\s€/)).toBeNull();
    expect(screen.getByRole('region', { name: 'Bankumsätze prüfen' })).toBeTruthy();
  });
  expect(posts).toEqual([
    {
      path: `/api/bank-sync/candidates/${id}/confirm`,
      body: {
        categoryId: 'category-724',
        candidateRevision: revision,
        actions: { categoryId: 'category-724', payeeId: null },
      },
    },
  ]);
  expect(forbiddenWrites.splice(0)).toEqual(['POST']);
});
