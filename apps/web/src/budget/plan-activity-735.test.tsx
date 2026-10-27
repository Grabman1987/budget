// @vitest-environment jsdom
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouter,
} from '@tanstack/react-router';
import { PlanMonthPage } from './plan-page';
import { LEDGER_KEY } from '../ledger/queries';
import type { BudgetMonthView } from './budget-api';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActivityContributions } from './activity-contributions';
import { EnvelopeBody } from './envelope-panel';
import type { PlanRow } from './plan-model';
import type { BudgetActivityPage } from './budget-api';

vi.mock('../ledger/booking-panel', () => ({
  BookingPanel: ({
    state,
    onClose,
  }: {
    state: { booking: { id: string; date: string; amountCents: number } } | null;
    onClose: () => void;
  }) =>
    state ? (
      <div role="dialog">
        {state.booking.id} · {state.booking.date} · {state.booking.amountCents}
        <button onClick={onClose}>Close origin</button>
      </div>
    ) : null,
}));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
let sourceGate: Promise<void> | undefined;
let sourceAmount: number;
const histories: ReturnType<typeof createBrowserHistory>[] = [];
const row: PlanRow = {
  id: 'food',
  categoryId: 'food',
  name: 'Synthetic food',
  icon: null,
  cls: 'need',
  kind: 'variable',
  stage: 2,
  groupId: 'group',
  cardAccountId: null,
  carryCents: 0,
  assignedCents: 500,
  activityCents: -100,
  availableCents: 400,
  overspentCents: 0,
  cashOverspentCents: 0,
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents: 0,
  dueMonth: null,
  target: null,
};
let calls: Array<{ method: string; path: string; body: unknown }>;
beforeEach(() => {
  calls = [];
  sourceGate = undefined;
  sourceAmount = -1234;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      calls.push({
        method: init?.method ?? 'GET',
        path: url.pathname,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url.pathname.startsWith('/api/bookings/')) await sourceGate;
      return new Response(
        JSON.stringify(
          url.pathname.startsWith('/api/bookings/')
            ? { booking: { id: 'future-booking', date: '2026-10-31', amountCents: sourceAmount } }
            : { groupId: 'synthetic-audit' },
        ),
        { status: 200 },
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});
function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>
        <ToastProvider>{element}</ToastProvider>
      </QueryClientProvider>,
    ),
    client,
  };
}
it('keeps assignment and move drafts mounted across compact disclosure toggles, preserving the exact audited assignment and Undo', async () => {
  const user = userEvent.setup();
  mount(
    <EnvelopeBody month="2026-10" row={row} rows={[row]} tba={10_000} onDone={() => {}} compact />,
  );
  const assigned = screen.getByLabelText('Zugewiesen') as HTMLInputElement;
  await user.clear(assigned);
  await user.type(assigned, '9,99');
  const details = document.querySelector('details')!;
  expect(details.open).toBe(false);
  await user.click(within(details).getByText('Geld verschieben', { selector: 'summary' }));
  const move = screen.getByLabelText('Betrag') as HTMLInputElement;
  await user.type(move, '1,23');
  await user.click(within(details).getByText('Geld verschieben', { selector: 'summary' }));
  expect(details.open).toBe(false);
  await user.click(within(details).getByText('Geld verschieben', { selector: 'summary' }));
  expect(move.value).toBe('1,23');
  expect(assigned.value).toBe('9,99');
  expect(calls).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
  await screen.findByRole('button', { name: 'Rückgängig' });
  expect(calls).toEqual([
    {
      method: 'PUT',
      path: '/api/budget/2026-10/assigned',
      body: { items: [{ categoryId: 'food', assignedCents: 999 }] },
    },
  ]);
  await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
  await waitFor(() =>
    expect(calls[1]).toEqual({
      method: 'POST',
      path: '/api/undo',
      body: { groupId: 'synthetic-audit' },
    }),
  );
});
it('starts overspending cover open and retains its strict invalid-move error', async () => {
  const user = userEvent.setup();
  mount(
    <EnvelopeBody
      month="2026-10"
      row={{ ...row, availableCents: -100, overspentCents: 100, cashOverspentCents: 100 }}
      rows={[row]}
      tba={10_000}
      onDone={() => {}}
      compact
    />,
  );
  expect(document.querySelector('details')!.open).toBe(true);
  await user.type(screen.getByLabelText('Betrag'), '0');
  await user.click(screen.getByRole('button', { name: 'Verschieben' }));
  expect(screen.getByText('Bitte einen Betrag über 0 eintragen.')).toBeTruthy();
  expect(document.querySelector('details')!.open).toBe(true);
  expect(calls).toEqual([]);
});
const item: BudgetActivityPage['activityBreakdown']['items'][number] = {
  source: {
    payeeName: 'Synthetic shop',
    memo: null,
    accountName: 'Synthetic account',
    bookingAmountCents: -10_001,
  },
  key: 'future',
  month: '2026-10',
  categoryId: 'food',
  kind: 'booking',
  contributionCents: -10_001,
  bookingId: 'future-booking',
  splitId: 'split-food',
  accountId: 'account',
  date: '2026-10-31',
  status: 'pending',
  sourceCategoryId: 'food',
  sourceAmountCents: -10_001,
  cardBalanceCoveredCents: 0,
  relatedCategories: [],
};
it('opens the future origin only on request, labels real terms and masks money without changing data', async () => {
  const user = userEvent.setup();
  mount(
    <ActivityContributions
      month="2026-10"
      categories={[]}
      pages={[
        {
          activityBreakdown: {
            items: [item],
            totalCents: -10_001,
            count: 1,
            pageCents: -10_001,
            nextCursor: null,
          },
        },
      ]}
      error={null}
      hasMore={false}
      loadingMore={false}
      onMore={() => {}}
      onReload={() => {}}
    />,
  );
  expect(screen.getAllByText('−100,01 €', { selector: 'strong' })).toHaveLength(2);
  expect(calls).toEqual([]);
  await user.click(screen.getByRole('button', { name: /Ursprungsbuchung öffnen/ }));
  await screen.findByRole('dialog');
  expect(calls).toEqual([{ method: 'GET', path: '/api/bookings/future-booking', body: null }]);
  act(() => setAmountsHidden(true));
  await waitFor(() => expect(screen.queryByText('−100,01 €')).toBeNull());
  expect(item.contributionCents).toBe(-10_001);
});
it('labels a monthly card adjustment without pretending it is a booking, and preserves explicit paging/reload controls', async () => {
  const user = userEvent.setup();
  const more = vi.fn();
  const reload = vi.fn();
  mount(
    <ActivityContributions
      month="2026-10"
      categories={[{ id: 'food', name: 'Synthetic food' }]}
      pages={[
        {
          activityBreakdown: {
            items: [
              {
                ...item,
                key: 'derived',
                kind: 'unfunded-card',
                bookingId: null,
                splitId: null,
                date: null,
                status: null,
                source: null,
                sourceAmountCents: null,
                contributionCents: -4_000,
                relatedCategories: [{ categoryId: 'food', cents: -4_000 }],
              },
            ],
            totalCents: 4_000,
            count: 3,
            pageCents: -4_000,
            nextCursor: 'opaque',
          },
        },
      ]}
      error={new Error('changed')}
      hasMore
      loadingMore={false}
      onMore={more}
      onReload={reload}
    />,
  );
  expect(screen.getByText('Ungedeckte Kartenausgaben · 2026-10')).toBeTruthy();
  expect(screen.getByText('Synthetic food: −40,00 €')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Ursprungsbuchung/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Weitere Beiträge laden' }));
  expect(more).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: /Erneut/ }));
  expect(reload).toHaveBeenCalledOnce();
  expect(calls).toEqual([]);
});

const onePage = {
  activityBreakdown: {
    items: [item],
    totalCents: -10_001,
    count: 1,
    pageCents: -10_001,
    nextCursor: null,
  },
};
it('735 regression: every reopened origin waits for a fresh ledger read after edit or Undo invalidation', async () => {
  const user = userEvent.setup();
  const { client } = mount(
    <ActivityContributions
      month="2026-10"
      categories={[]}
      pages={[onePage]}
      error={null}
      hasMore={false}
      loadingMore={false}
      onMore={() => {}}
      onReload={() => {}}
    />,
  );
  await user.click(screen.getByRole('button', { name: /Ursprungsbuchung öffnen/ }));
  expect((await screen.findByRole('dialog')).textContent).toContain('-1234');
  await user.click(screen.getByRole('button', { name: 'Close origin' }));
  sourceAmount = -5678;
  let release!: () => void;
  sourceGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await act(() => client.invalidateQueries({ queryKey: LEDGER_KEY }));
  await user.click(screen.getByRole('button', { name: /Ursprungsbuchung öffnen/ }));
  try {
    expect(screen.queryByRole('dialog')).toBeNull();
  } finally {
    release();
  }
  await act(async () => {
    await sourceGate;
  });
  expect((await screen.findByRole('dialog')).textContent).toContain('-5678');
  expect(calls.map((call) => call.method)).toEqual(['GET', 'GET']);
});
it('735 regression: an empty memo and no payee still give the origin a visible nonempty label', () => {
  mount(
    <ActivityContributions
      month="2026-10"
      categories={[]}
      pages={[
        {
          activityBreakdown: {
            ...onePage.activityBreakdown,
            items: [{ ...item, source: { ...item.source!, payeeName: null, memo: '' } }],
          },
        },
      ]}
      error={null}
      hasMore={false}
      loadingMore={false}
      onMore={() => {}}
      onReload={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: /Ursprungsbuchung öffnen/ }).textContent).toBe(
    'Buchung ohne Zahlungspartner',
  );
  expect(calls).toEqual([]);
});
it('735 regression: real router Back preserves two selected rows, unrelated collapsed group and source month', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  window.scrollTo = vi.fn();
  const categories = ['food', 'second', 'unrelated', 'fourth'].map((id, index) => ({
    id,
    name: ['Synthetic food', 'Synthetic second', 'Unrelated', 'Fourth'][index]!,
    groupId: index < 2 ? 'group' : 'other',
    class: 'need' as const,
    kind: 'variable' as const,
    stage: 2,
    icon: null,
    cardAccountId: null,
    rolloverOverspending: false,
    hiddenAt: null,
    splitCount: 0,
    sortOrder: index,
  }));
  const groups = [
    { id: 'group', name: 'Primary', sortOrder: 0 },
    { id: 'other', name: 'Other', sortOrder: 1 },
  ];
  const data: BudgetMonthView = {
    categories,
    groups,
    summary: {
      month: '2026-10',
      carryInCents: 0,
      incomeCents: 10000,
      uncoveredCents: 0,
      heldCents: 0,
      assignedCents: 2000,
      activityCents: -400,
      availableCents: 1600,
      toBeAssignedCents: 8000,
      creditOverspentCents: 0,
      cashOverspentCents: 0,
      cards: [],
      envelopes: categories.map((c) => ({ ...row, categoryId: c.id })),
    },
  };
  // The overview now reads next month's targets; keep this unrelated route/selection fixture valid.
  const nextData: BudgetMonthView = {
    groups: [],
    categories: [],
    summary: {
      ...data.summary,
      month: '2026-11',
      carryInCents: 8000,
      incomeCents: 0,
      assignedCents: 0,
      activityCents: 0,
      availableCents: 0,
      envelopes: [],
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      calls.push({ method: init?.method ?? 'GET', path: url.pathname, body: null });
      if ((init?.method ?? 'GET') === 'GET' && url.pathname === '/api/expected/income')
        return Response.json({
          receivedCents: 2500,
          expectedCents: 10000,
          byPayment: [],
          byIncomeType: [],
        });
      const body =
        url.pathname === '/api/budget/2026-10'
          ? data
          : url.pathname === '/api/budget/2026-11'
            ? nextData
            : url.pathname === '/api/categories'
              ? { groups, categories, targets: [] }
              : url.pathname === '/api/accounts'
                ? { accounts: [] }
                : url.pathname === '/api/expected'
                  ? { payments: [] }
                  : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  window.history.replaceState({}, '', '/plan/monat?monat=2026-10');
  const history = createBrowserHistory();
  histories.push(history);
  const root = createRootRoute();
  function Detail() {
    const router = useRouter();
    return (
      <>
        <h2>Read activity</h2>
        <button onClick={() => router.history.back()}>Back to plan</button>
      </>
    );
  }
  const plan = createRoute({
    getParentRoute: () => root,
    path: '/plan/monat',
    component: PlanMonthPage,
    validateSearch: (search) => ({
      monat: typeof search.monat === 'string' ? search.monat : '2026-10',
    }),
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/plan/monat/envelope/$id',
    component: Detail,
  });
  const router = createRouter({ routeTree: root.addChildren([plan, detail]), history });
  mount(<RouterProvider router={router} />);
  await screen.findByRole('checkbox', { name: 'Synthetic food auswählen' });
  await user.click(screen.getByRole('checkbox', { name: 'Synthetic food auswählen' }));
  await user.click(screen.getByRole('checkbox', { name: 'Synthetic second auswählen' }));
  await user.click(screen.getByRole('button', { name: 'Gruppe Other' }));
  expect(
    (screen.getByRole('checkbox', { name: 'Synthetic food auswählen' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (screen.getByRole('checkbox', { name: 'Synthetic second auswählen' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  await user.click(screen.getByRole('link', { name: /Aktivität Synthetic food/ }));
  await screen.findByRole('heading', { name: 'Read activity' });
  await user.click(screen.getByRole('button', { name: 'Back to plan' }));
  await screen.findByRole('checkbox', { name: 'Synthetic food auswählen' });
  expect(
    (screen.getByRole('checkbox', { name: 'Synthetic food auswählen' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (screen.getByRole('checkbox', { name: 'Synthetic second auswählen' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(screen.getByRole('button', { name: 'Gruppe Other' }).getAttribute('aria-expanded')).toBe(
    'false',
  );
  expect(router.state.location.href).toBe('/plan/monat?monat=2026-10');
  expect(calls.every((call) => call.method === 'GET')).toBe(true);
});
