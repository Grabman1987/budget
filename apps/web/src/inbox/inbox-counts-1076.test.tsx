// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LEDGER_KEY } from '../ledger/queries';
import { useInboxCount } from '../shell/inbox';
import { INBOX_KEY, inboxCountQuery, type InboxStored } from './api';
import { InboxPage } from './inbox-page';
import { validateInboxSearch } from './navigation';

vi.mock('../pages/area-head', () => ({ AreaHead: () => <h1>Prüfen</h1> }));
vi.mock('../receipts/receipt-section', () => ({ ReceiptSection: () => <p>Belegbereich</p> }));

const clients: QueryClient[] = [];
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
});

function candidate(id: string): InboxStored {
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
      memo: `Umsatz ${id}`,
      payeeName: null,
      accountName: 'Testkonto',
      suggestion: { label: 'Kategorie prüfen · Zu verteilen', needsReview: true },
    },
  };
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** Server state: `umsaetze` open bank candidates plus `aufgaben` open tasks; one definition for both reads. */
function server(
  state: { umsaetze: number; aufgaben: number },
  gate: { wait: Promise<void> | null },
) {
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/inbox/count')
      return json({ asOf: '2026-10-20', count: state.umsaetze + state.aufgaben });
    if (url.pathname === '/api/inbox') {
      const snapshot = { ...state };
      await gate.wait;
      const entries = Array.from({ length: snapshot.umsaetze }, (_, i) => candidate(`c${i}`));
      return json({
        asOf: '2026-10-20',
        count: snapshot.umsaetze + snapshot.aufgaben,
        accountReminders: [],
        unlinkedReceiptCount: snapshot.aufgaben,
        totalEntries: entries.length,
        entries,
        readSourceSummaries: [],
        countsByKind: { import: entries.length },
        countsByCause: {},
        limit: 100,
        offset: 0,
        next: null,
        segment: 'umsaetze',
        segments: { umsaetze: snapshot.umsaetze, aufgaben: snapshot.aufgaben },
        taskSources: { accounts: 0, receipts: snapshot.aufgaben, plan: 0, payslips: 0, other: 0 },
      });
    }
    if (url.pathname === '/api/bank-sync') return json({ configured: false, connections: [] });
    return json({});
  });
}

function Header() {
  const inbox = useInboxCount();
  return (
    <output data-testid="header-count">{inbox.count === undefined ? '…' : inbox.count}</output>
  );
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const root = createRootRoute({ validateSearch: validateInboxSearch, component: Outlet });
  const inbox = createRoute({
    getParentRoute: () => root,
    path: '/konten/pruefen',
    component: () => (
      <>
        <Header />
        <InboxPage />
      </>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([inbox]),
    history: createMemoryHistory({ initialEntries: ['/konten/pruefen'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return client;
}

const tabTotal = () => {
  const group = document.querySelector('.inbox-segments');
  if (!group) return undefined;
  const numbers = [...group.querySelectorAll('button')].map((b) =>
    Number(/(\d+)/.exec(b.textContent ?? '')?.[1]),
  );
  return numbers.reduce((a, b) => a + b, 0);
};
const headerCount = () => {
  const text = document.querySelector('[data-testid="header-count"]')?.textContent ?? '';
  return /^\d+$/.test(text) ? Number(text) : undefined;
};

it('never shows a header total that differs from the sum of the tab counts while the list reloads after a write', async () => {
  const state = { umsaetze: 2, aufgaben: 1 };
  const gate: { wait: Promise<void> | null } = { wait: null };
  server(state, gate);
  const client = mount();
  await waitFor(() => expect(tabTotal()).toBe(3));
  expect(screen.getByText(/Kryptobewegungen zur Prüfung werden getrennt/)).toBeTruthy();
  await waitFor(() => expect(headerCount()).toBe(3));

  const seen: string[] = [];
  const check = () => {
    const header = headerCount();
    const tabs = tabTotal();
    if (header !== undefined && tabs !== undefined && header !== tabs)
      seen.push(`header ${header} vs tabs ${tabs}`);
  };
  const observer = new MutationObserver(check);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });

  // One candidate is resolved: the cheap count answers at once, the list stays delayed.
  let release!: () => void;
  gate.wait = new Promise<void>((resolve) => (release = resolve));
  state.umsaetze = 1;
  await act(async () => {
    await client.invalidateQueries({ queryKey: LEDGER_KEY, refetchType: 'none' });
    void client.invalidateQueries({ queryKey: LEDGER_KEY });
    await client.fetchQuery({ ...inboxCountQuery(), staleTime: 0 });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  check();
  expect(client.getQueryData(inboxCountQuery().queryKey)).toMatchObject({ count: 2 });
  // The header must not announce the new total while the tabs still show the old one.
  expect(headerCount()).not.toBe(2);
  expect(tabTotal()).toBe(3);
  await act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  await waitFor(() => expect(tabTotal()).toBe(2));
  await waitFor(() => expect(headerCount()).toBe(2));
  observer.disconnect();
  expect(seen).toEqual([]);
  expect(client.getQueryData([...INBOX_KEY, 'count'])).toMatchObject({ count: 2 });
});
