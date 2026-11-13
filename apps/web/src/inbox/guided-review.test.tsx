// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { InboxStored } from './api';
import { GuidedReview } from './guided-review';
import { candidateReadiness, loadProgress, nextOpenIndex } from './guided-review-model';

// #1054: guided Prüfen. Synthetic data only.
const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => nav.navigate,
  useSearch: () => ({ modus: 'gefuehrt' }),
  useLocation: () => ({ pathname: '/konten/pruefen', href: '/konten/pruefen' }),
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to, search }: { children: ReactNode; to: string; search?: object }) => (
    <a href={to + (search ? '?' + new URLSearchParams(search as never).toString() : '')}>
      {children}
    </a>
  ),
}));
vi.mock('../ledger/booking-panel', () => ({ BookingPanel: () => null }));
vi.mock('../assignment/review', () => ({ AssignmentLearnOffer: () => null }));
vi.mock('./bank-candidate', () => ({
  BankCandidate: ({ triggerLabel }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel}</button>
  ),
}));

const candidate = (id: string, date: string, payee: string, cents: number): InboxStored => ({
  type: 'stored',
  id,
  kind: 'import',
  title: 'Synthetic movement',
  detail: null,
  refType: 'bank-sync-candidate',
  refId: id,
  urgent: false,
  createdAt: date + 'T12:00:00Z',
  bankCandidate: {
    date,
    amountCents: cents,
    currency: 'EUR',
    memo: 'Synthetic memo',
    payeeName: payee,
    accountName: 'Girokonto A',
  },
});
const rule = {
  id: 'rule-1',
  name: 'Shop A zuordnen',
  revision: 'r1',
  automatic: true,
  actions: { categoryId: 'cat-1' },
};

let queue: InboxStored[];
let confirmStatus = 200;
let requests: { method: string; path: string; body: unknown }[];
let client: QueryClient;
let gate: Promise<void> | null = null;
const json = (body: unknown, status = 200) => Response.json(body, { status });
beforeEach(() => {
  window.sessionStorage.clear();
  queue = [
    candidate('c-2', '2026-09-02', 'Zweiter Shop', -2500),
    candidate('c-1', '2026-09-01', 'Shop A', -1201),
    candidate('c-3', '2026-09-03', 'Dritter Shop', -300),
  ].sort((a, b) => a.bankCandidate!.date.localeCompare(b.bankCandidate!.date));
  confirmStatus = 200;
  requests = [];
  gate = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    requests.push({
      method,
      path: input,
      body: init?.body ? JSON.parse(init.body as string) : null,
    });
    if (gate) await gate;
    if (input.startsWith('/api/inbox?'))
      return json({
        asOf: '2026-09-17',
        count: queue.length,
        entries: queue,
        readSourceSummaries: [],
        segment: 'umsaetze',
        segments: { umsaetze: queue.length, aufgaben: 2 },
        totalEntries: queue.length,
        countsByKind: {},
        countsByCause: {},
        limit: 100,
        offset: 0,
        next: null,
      });
    if (input.startsWith('/api/assignment-rules/candidates/c-2'))
      return json({ candidateRevision: 'x', existingTransfer: null, suggestions: [] });
    if (input.startsWith('/api/assignment-rules/candidates/'))
      return json({ candidateRevision: 'x', existingTransfer: null, suggestions: [rule] });
    if (input.endsWith('/matches')) return json({ merge: [], link: [], transfers: [] });
    if (input.endsWith('/confirm') && method === 'POST') {
      if (confirmStatus !== 200)
        return json({ error: 'conflict', detail: 'Vorschlag veraltet.' }, 409);
      queue = queue.filter((item) => item.id !== input.split('/').at(-2));
      return json({ groupId: 'g-1', bookingId: 'b-1' });
    }
    if (input.startsWith('/api/ledger-lookups') || input.includes('lookups'))
      return json({ categories: [{ id: 'cat-1', name: 'Einkauf A', sortOrder: 1 }], groups: [] });
    return json({});
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  nav.navigate.mockClear();
});
/** Enter is armed shortly after an item's checks resolved. */
const armed = () => new Promise((resolve) => setTimeout(resolve, 320));
const posts = () => requests.filter((r) => r.method === 'POST').map((r) => r.path);
const view = () =>
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <GuidedReview />
      </ToastProvider>
    </QueryClientProvider>,
  );

it('shows the oldest line first with the facts and never an empty state while loading', async () => {
  let release!: () => void;
  gate = new Promise((resolve) => (release = resolve));
  view();
  expect(screen.getByText(/Umsätze werden geladen/)).toBeTruthy();
  expect(screen.queryByText('Alle Umsätze geprüft')).toBeNull();
  release();
  expect(await screen.findByRole('heading', { name: 'Shop A' })).toBeTruthy();
  expect(screen.getByText('1 von 3', { exact: false })).toBeTruthy();
  expect(screen.getByText('−12,01 €')).toBeTruthy();
  expect(screen.getByText('Girokonto A')).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Einkauf A')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Bestätigen' }).hasAttribute('disabled')).toBe(false);
});

it('confirms with the rule, advances and counts it resolved', async () => {
  const user = userEvent.setup();
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toHaveProperty('disabled', false),
  );
  await user.click(screen.getByRole('button', { name: 'Bestätigen' }));
  expect(await screen.findByRole('heading', { name: 'Zweiter Shop' })).toBeTruthy();
  expect(requests.find((r) => r.method === 'POST')).toMatchObject({
    path: '/api/bank-sync/candidates/c-1/confirm',
    body: { categoryId: null, ruleId: 'rule-1', revision: 'r1', candidateRevision: 'x' },
  });
  expect(screen.getByText('2', { selector: 'strong' })).toBeTruthy();
  expect(screen.getByText(/1 erledigt/)).toBeTruthy();
});

it('names the reason for "Unbekannt" and holds back Bestätigen', async () => {
  const user = userEvent.setup();
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  await user.keyboard('j');
  await screen.findByRole('heading', { name: 'Zweiter Shop' });
  await waitFor(() => expect(screen.getByText('Unbekannt')).toBeTruthy());
  expect(screen.getByText(/Keine Regel passt/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Bestätigen' })).toHaveProperty('disabled', true);
});

it('keeps the line actionable and shows the error when confirming fails', async () => {
  confirmStatus = 409;
  const user = userEvent.setup();
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toHaveProperty('disabled', false),
  );
  await armed();
  await user.keyboard('{Enter}');
  const alert = await screen.findByText(/Der Umsatz bleibt offen/);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(screen.getByRole('heading', { name: 'Shop A' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Bestätigen' })).toHaveProperty('disabled', false);
});

it('defers with a reason, ends in a summary and links on', async () => {
  const user = userEvent.setup();
  queue = queue.slice(0, 1);
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  await user.click(screen.getByRole('button', { name: 'Später' }));
  await user.selectOptions(screen.getByLabelText('Grund für später'), 'Beleg fehlt');
  await user.click(screen.getByRole('button', { name: 'Zurückstellen' }));
  const summary = await screen.findByRole('heading', { name: 'Zusammenfassung' });
  const box = summary.parentElement!;
  expect(within(box).getByText(/Shop A · −12,01 € · Beleg fehlt/)).toBeTruthy();
  expect(within(box).getByText('Zurückgestellt').nextElementSibling?.textContent).toBe('1');
  expect(within(box).getByRole('link', { name: 'Zu den Aufgaben (2)' })).toBeTruthy();
  expect(within(box).getByRole('link', { name: 'Zu Heute' })).toBeTruthy();
  expect(JSON.parse(window.sessionStorage.getItem('budget.pruefen.gefuehrt')!).deferred).toEqual({
    'c-1': 'Beleg fehlt',
  });
});

it('navigates with arrows and leaves with Escape; resumes at the stored line', async () => {
  window.sessionStorage.setItem(
    'budget.pruefen.gefuehrt',
    JSON.stringify({ currentId: 'c-2', deferred: {}, resolved: 4 }),
  );
  const user = userEvent.setup();
  view();
  await screen.findByRole('heading', { name: 'Zweiter Shop' });
  expect(screen.getByText('6', { selector: 'strong' })).toBeTruthy();
  await user.keyboard('{ArrowLeft}');
  await screen.findByRole('heading', { name: 'Shop A' });
  await user.keyboard('{Escape}');
  expect(nav.navigate).toHaveBeenCalled();
});

it('announces progress in a polite live region', async () => {
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  const live = document.querySelector('.guided .sr-only[role="status"]')!;
  expect(live.getAttribute('aria-live')).toBe('polite');
  expect(live.textContent).toBe('Umsatz 1 von 3: Shop A, −12,01 €');
});

it('model: only a single usable rule without merge or transfer confirms directly', () => {
  const base = {
    reviewFailed: false,
    matchesFailed: false,
    categoryNames: new Map<string, string>(),
    serverLabel: null,
  };
  const review = { existingTransfer: null, suggestions: [rule] };
  const clean = { merge: [], link: [], transfers: [] };
  expect(candidateReadiness({ ...base, review, matches: clean }).canConfirm).toBe(true);
  expect(
    candidateReadiness({ ...base, review, matches: { ...clean, merge: [{}] } }).canConfirm,
  ).toBe(false);
  expect(
    candidateReadiness({
      ...base,
      review: { ...review, suggestions: [rule, { ...rule, id: 'r2' }] },
      matches: clean,
    }).canConfirm,
  ).toBe(false);
  expect(candidateReadiness({ ...base, matches: clean }).loading).toBe(true);
  expect(nextOpenIndex(['a', 'b', 'c'], { b: 'x', c: 'y' }, 1)).toBe(0);
  expect(nextOpenIndex(['a'], { a: 'x' }, 0)).toBe(-1);
  window.sessionStorage.setItem('budget.pruefen.gefuehrt', '{broken');
  expect(loadProgress()).toEqual({ currentId: null, deferred: {}, resolved: 0 });
});

it('a held Enter confirms exactly one item and repeats never reach the next one', async () => {
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toHaveProperty('disabled', false),
  );
  await armed();
  fireEvent.keyDown(document.body, { key: 'Enter' });
  for (let i = 0; i < 4; i++) fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
  await screen.findByRole('heading', { name: 'Zweiter Shop' });
  await armed();
  fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
  expect(posts()).toEqual(['/api/bank-sync/candidates/c-1/confirm']);
});

it('two rapid Enter presses send one request, and the next item needs a settled fresh press', async () => {
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toHaveProperty('disabled', false),
  );
  await armed();
  fireEvent.keyDown(document.body, { key: 'Enter' });
  fireEvent.keyDown(document.body, { key: 'Enter' });
  await screen.findByRole('heading', { name: 'Zweiter Shop' });
  // A press right after the advance (before the item settled) is ignored.
  fireEvent.keyDown(document.body, { key: 'Enter' });
  expect(posts()).toEqual(['/api/bank-sync/candidates/c-1/confirm']);
});

it('Esc that closes a dialog does not leave guided mode', async () => {
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  // Like the panel: the dialog handles Esc itself and is gone by the time it bubbles up.
  dialog.addEventListener('keydown', () => dialog.remove());
  document.body.append(dialog);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(nav.navigate).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(nav.navigate).toHaveBeenCalledTimes(1);
});

it('Esc with the defer panel open only cancels it and returns focus to Später', async () => {
  const user = userEvent.setup();
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  await user.click(screen.getByRole('button', { name: 'Später' }));
  expect(screen.getByLabelText('Grund für später')).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(nav.navigate).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Grund für später')).toBeNull();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Später' })),
  );
});

it('drops a stale stored session instead of adding its count', async () => {
  window.sessionStorage.setItem(
    'budget.pruefen.gefuehrt',
    JSON.stringify({ currentId: 'gone', deferred: { gone: 'x' }, resolved: 7 }),
  );
  view();
  await screen.findByRole('heading', { name: 'Shop A' });
  await waitFor(() => expect(screen.getByText(/0 erledigt/)).toBeTruthy());
  expect(screen.getByText('1 von 3', { exact: false })).toBeTruthy();
});
