// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { accounts, createTestDatabase, type SavingsExecutionProposal } from '@budget/db';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { HeutePage } from './heute-page';
import { HEUTE_KEY, type Heute } from './api';
import { budgetQuery } from '../budget/budget-api';
import { liquidityQuery } from '../reports/liquidity-api';
import { savingsProposalsQuery } from '../wealth/savings-api';
import { isMonth } from '../nav/month';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 360] }));
const DAY = '2026-09-17';
type Read = 'heute' | 'budget' | 'liquidity' | 'savings';
let opened: ReturnType<typeof createTestDatabase>;
let api: ReturnType<typeof createLedgerApi>;
let client: QueryClient;
let failed: Read | undefined;
let gate: { read: Read; promise: Promise<void>; release: () => void } | undefined;
let writes: string[];
let unexpected: string[];
let inFlight: Set<Promise<Response>>;
const proposal: SavingsExecutionProposal = {
  type: 'savings', id: 'synthetic-proposal', kind: 'revision', urgent: false,
  planId: 'synthetic-plan', month: '2026-09', securityId: 'synthetic-security',
  accountId: 'synthetic-depot', securityName: 'Synthetic instrument', accountName: 'Synthetic depot',
  sourceAccountName: 'Synthetic account', currency: 'EUR', date: DAY, amountCents: 12_345,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${DAY}T10:00:00Z`));
  localStorage.clear();
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  opened = createTestDatabase();
  accounts.create(opened.db, {
    id: '57400000-0000-4000-8000-000000000001', name: 'Synthetic account',
    type: 'checking', role: 'budget', onBudget: true, currency: 'EUR',
    openingDate: '2026-01-01', openingBalanceCents: 123_456,
  }, { actor: 'synthetic-574' });
  api = createLedgerApi({ db: opened.db, today: () => DAY, stepUp: async (_c, next) => next() });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  failed = undefined;
  gate = undefined;
  writes = [];
  unexpected = [];
  inFlight = new Set();
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    const response = (async () => {
    const url = new URL(input, 'http://localhost');
    if ((init?.method ?? 'GET') !== 'GET') {
      writes.push(`${init?.method} ${url.pathname}`);
      return Response.json({ error: 'unexpected_write' }, { status: 500 });
    }
    const read: Read | undefined = url.pathname === '/api/heute' ? 'heute'
      : url.pathname.startsWith('/api/budget/') ? 'budget'
      : url.pathname === '/api/liquidity' ? 'liquidity'
      : url.pathname === '/api/savings-plans/execution-proposals' ? 'savings' : undefined;
    if (gate && gate.read === read) await gate.promise;
    if (read && failed === read)
      return Response.json({ error: 'synthetic_unavailable' }, { status: 503 });
    if (read === 'savings') return Response.json({ proposals: [proposal] });
    if (url.pathname === '/api/auth/status')
      return Response.json({ authenticated: true, setupRequired: false, stepUpValidUntil: null, viaRecovery: false });
    if (!read && !['/api/expected', '/api/goals'].includes(url.pathname)) {
      unexpected.push(url.pathname);
      return Response.json({ error: 'unexpected_test_read' }, { status: 500 });
    }
    return api.request(url.pathname.replace(/^\/api/, '') + url.search, init);
    })();
    inFlight.add(response);
    void response.then(() => inFlight.delete(response), () => inFlight.delete(response));
    return response;
  });
});
afterEach(async () => {
  gate?.release();
  cleanup();
  await client.cancelQueries();
  // Query cancellation does not stop an already released synthetic API read.
  const completed = await Promise.allSettled([...inFlight]);
  client.clear();
  opened.close();
  act(() => setAmountsHidden(false));
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  expect(writes).toEqual([]);
  expect(unexpected).toEqual([]);
  expect(completed.filter((result) => result.status === 'rejected')).toEqual([]);
});
function mount(at = '/?monat=2026-09&period=month') {
  const root = createRootRoute({ validateSearch: (search: Record<string, unknown>) => ({
    ...(isMonth(search['monat']) ? { monat: search['monat'] } : {}),
    ...(search['period'] === 'month' || search['period'] === 'payday' ? { period: search['period'] } : {}),
  }) });
  const router = createRouter({ history: createMemoryHistory({ initialEntries: [at] }),
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/', component: HeutePage })]),
  });
  return render(<QueryClientProvider client={client}><ToastProvider><RouterProvider router={router} /></ToastProvider></QueryClientProvider>);
}
function hold(read: Read) {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  gate = { read, promise, release };
}
const card = () => screen.getByRole('region', { name: 'Kontoprognose · 35 Tage' });
const budgetTile = () => document.querySelector('[aria-labelledby="kennzahl-zu-verteilen-title"]') as HTMLElement;
const refresh = (read: Read) => client.invalidateQueries({ queryKey: read === 'heute' ? HEUTE_KEY
  : read === 'budget' ? budgetQuery('2026-09').queryKey
  : read === 'liquidity' ? liquidityQuery('35d', []).queryKey : savingsProposalsQuery().queryKey });
const ready = () => waitFor(() => expect(client.isFetching()).toBe(0));

it('reserves each aggregate section while pending and keeps independently loaded sections available', async () => {
  hold('heute');
  mount();
  expect(await screen.findByText('Zu verteilen')).toBeTruthy();
  await waitFor(() => expect(card().querySelector('.heute-forecast-low')).toBeTruthy());
  expect(within(budgetTile()).getByTestId('kennzahl-value')).toBeTruthy();
  expect(document.querySelector('.heute-pace[aria-busy="true"]')).toBeTruthy();
  expect(document.querySelector('.heute-wealth-line[aria-busy="true"]')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Letzte Buchungen' }).getAttribute('aria-busy')).toBe('true');
  expect(screen.getByText('1 Sparplanausführung prüfen')).toBeTruthy();
  expect(document.querySelector('[data-kennzahl="nettovermoegen"]')).toBeNull();
});

it('retains an honest empty goal slot after the real no-goal response settles', async () => {
  hold('heute');
  mount();
  await screen.findByText('Zu verteilen');
  const slot = document.querySelector('.heute-nearest-goal')!;
  expect(slot).not.toBeNull();
  expect(slot.getAttribute('aria-hidden')).toBe('true');
  act(() => gate!.release());
  await screen.findByTestId('heute-wealth-history');
  await ready();
  expect(document.querySelector('.heute-nearest-goal')).toBe(slot);
  expect(slot.getAttribute('aria-hidden')).toBe('true');
  expect(slot.querySelector('a')).toBeNull();
  expect(slot.textContent).toBe('');
});

it('keeps successful independent reads on initial aggregate failure without inventing current net worth', async () => {
  failed = 'heute';
  mount();
  await screen.findByRole('alert');
  await ready();
  expect(budgetTile()).not.toBeNull();
  expect(within(budgetTile()).getByTestId('kennzahl-value')).toBeTruthy();
  expect(card().querySelector('.heute-forecast-low')).toBeTruthy();
  expect(screen.getByText('1 Sparplanausführung prüfen')).toBeTruthy();
  expect(document.querySelector('[data-kennzahl="nettovermoegen"]')).toBeNull();
  expect(screen.queryByTestId('heute-wealth-history')).toBeNull();
  const lead = screen.getByRole('region', { name: 'Spielraum bis Gehalt' });
  expect(lead.textContent).toContain('Tagesbudget: Heute-Abruf nicht verfügbar.');
  expect(lead.textContent).not.toContain('wird geladen');
  failed = undefined;
  await userEvent.setup().click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  await waitFor(() => expect(document.querySelector('[data-kennzahl="nettovermoegen"]')?.textContent).toBe('1.234,56 €'));
});

it('withholds cached aggregate money after refetch failure while retaining independent open controls', async () => {
  mount();
  await screen.findByTestId('heute-wealth-history');
  await ready();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Herleitung Zu verteilen' }));
  const budgetControl = screen.getByRole('button', { name: 'Herleitung Zu verteilen' });
  const proposalDetails = screen.getByText('1 Sparplanausführung prüfen').closest('details')!;
  await userEvent.setup().click(within(proposalDetails).getByText('1 Sparplanausführung prüfen'));
  expect(proposalDetails.open).toBe(true);
  expect(proposalDetails.textContent).toContain('123,45');
  failed = 'heute';
  await act(async () => { await refresh('heute'); });
  await ready();
  expect(document.querySelector('[data-kennzahl="nettovermoegen"]')).toBeNull();
  expect(screen.queryByTestId('heute-wealth-history')).toBeNull();
  expect(budgetControl.isConnected).toBe(true);
  expect(budgetControl.getAttribute('aria-expanded')).toBe('true');
  expect(proposalDetails.isConnected && proposalDetails.open).toBe(true);
  expect(proposalDetails.textContent).toContain('Synthetic instrument');
  expect(card().querySelector('.heute-forecast-low')).toBeTruthy();
});

it('keeps a savings disclosure in its existing remaining-task owner when the aggregate fails', async () => {
  mount();
  await screen.findByTestId('heute-wealth-history');
  await ready();
  const query = client.getQueryCache().find({ queryKey: HEUTE_KEY })!;
  act(() => client.setQueryData<Heute>(query.queryKey, (data) => ({
    ...data!,
    attention: { ...data!.attention, monthCloseTasks: {
      tasks: ['2026-05', '2026-06', '2026-07', '2026-08'].map((month) => ({
        id: `close-changed:${month}`, kind: 'close-changed' as const, month,
        target: `/monatsabschluss/${month}`,
      })), unavailable: [],
    } },
  })));
  const proposalDetails = screen.getByText('1 Sparplanausführung prüfen').closest('details')!;
  const remaining = proposalDetails.closest('.attention-remaining') as HTMLDetailsElement;
  expect(remaining).not.toBeNull();
  await userEvent.setup().click(remaining.querySelector('summary')!);
  await userEvent.setup().click(within(proposalDetails).getByText('1 Sparplanausführung prüfen'));
  expect(proposalDetails.open && remaining.open).toBe(true);
  failed = 'heute';
  await act(async () => { await refresh('heute'); });
  await ready();
  expect(proposalDetails.isConnected && proposalDetails.open).toBe(true);
  expect(remaining.isConnected && remaining.open).toBe(true);
  expect(proposalDetails.textContent).toContain('123,45');
  expect(document.querySelector('[data-kennzahl="nettovermoegen"]')).toBeNull();
  expect(screen.queryByTestId('heute-wealth-history')).toBeNull();
});

it.each(['budget', 'liquidity', 'savings'] as const)('withholds %s own cached financial content during pending and error without hiding other reads', async (read) => {
  mount();
  await screen.findByTestId('heute-wealth-history');
  await ready();
  const summary = screen.getByText('1 Sparplanausführung prüfen');
  await userEvent.setup().click(summary);
  expect(summary.closest('details')?.textContent).toContain('123,45');
  const verifyUnavailable = () => {
    expect(document.querySelector('[data-kennzahl="nettovermoegen"]')?.textContent).toBe('1.234,56 €');
    if (read === 'budget') expect(budgetTile().outerHTML).not.toContain('1.234,56');
    else expect(within(budgetTile()).getByTestId('kennzahl-value')).toBeTruthy();
    if (read === 'liquidity') {
      expect(card().querySelector('.heute-forecast-low')).toBeNull();
      expect(within(card()).queryByTestId('liquidity-chart')).toBeNull();
    }
    else expect(card().querySelector('.heute-forecast-low')).toBeTruthy();
    if (read === 'savings') {
      const content = document.querySelector('.attention-proposals')?.textContent ?? '';
      expect(content).not.toContain('Synthetic instrument');
      expect(content).not.toContain('123,45');
    }
    else expect(screen.getByText('1 Sparplanausführung prüfen')).toBeTruthy();
  };
  hold(read);
  let pending!: Promise<void>;
  act(() => { pending = refresh(read); });
  await waitFor(verifyUnavailable);
  failed = read;
  act(() => gate!.release());
  await act(async () => { await pending; });
  await waitFor(verifyUnavailable);
  await screen.findAllByRole('alert');
});

it('labels current-only wealth, tasks and recent bookings in another selected month', async () => {
  mount('/?monat=2026-08&period=month');
  await screen.findByTestId('heute-wealth-history');
  await ready();
  for (const selector of ['.heute-answers', '.heute-wealth-line', '.heute-attention', '[aria-labelledby="heute-bookings-title"]'])
    expect(document.querySelector(selector)?.textContent).toContain('Stand heute · 17.09.2026');
  expect(card().textContent).toContain('Stand heute · 17.09.2026');
  expect(screen.getByRole('heading', { name: 'August 2026 · Pace' })).toBeTruthy();
});
