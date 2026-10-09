// @vitest-environment jsdom
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OverspentChip } from './overspent-chip';

vi.mock('./app-link', () => ({
  AppLink: ({
    children,
    to,
    search,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    to: string;
    search?: unknown;
  }) => (
    <a href={to} data-search={JSON.stringify(search)} {...props}>
      {children}
    </a>
  ),
}));

const env = (id: string, available: number, free = Math.max(0, available)) => ({
  categoryId: id,
  carryCents: 0,
  assignedCents: 0,
  activityCents: 0,
  availableCents: available,
  freeCents: free,
  overspentCents: Math.max(0, -available),
  cashOverspentCents: Math.max(0, -available),
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents: 0,
  dueMonth: null,
  target: null,
});
const cat = (id: string, name: string, i: number) => ({
  id,
  name,
  icon: null,
  cls: 'need',
  kind: 'variable',
  stage: 2,
  groupId: 'g',
  cardAccountId: null,
  sortOrder: i,
  hiddenAt: null,
});
const view = (envelopes: ReturnType<typeof env>[], tba: number) => ({
  summary: { month: '2026-09', toBeAssignedCents: tba, envelopes },
  groups: [{ id: 'g' }],
  categories: envelopes.map((e, i) => cat(e.categoryId, `Env ${e.categoryId}`, i)),
});

let posts: unknown[];
function stub(body: unknown) {
  posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({ groupId: 'g1', coveredCount: 2, openCount: 0, missingCents: 0 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(path.startsWith('/api/budget/') ? body : {}), {
        status: 200,
      });
    }),
  );
}
function stubError() {
  posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('synthetic budget request failure');
    }),
  );
}
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <OverspentChip />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-17T10:00:00Z'));
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('is hidden without overspent envelopes', async () => {
  stub(view([env('a', 5_000)], 0));
  const { container } = mount();
  await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(container.querySelector('.overspent-chip')).toBeNull();
});

it('links the overspending status to this month’s triage without opening an overlay or writing', async () => {
  stub(view([env('a', -1_000), env('b', -2_000)], 0));
  mount();
  const link = await screen.findByRole('link', {
    name: '2 Envelopes überzogen, 30,00 € zu decken – Überziehungen prüfen',
  });
  expect(link.getAttribute('href')).toBe('/plan/monat');
  expect(link.getAttribute('data-search')).toBe(
    JSON.stringify({ monat: '2026-09', ansicht: 'triage' }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  await userEvent.click(link);
  expect(posts).toEqual([]);
});

it('keeps the count and plan link visible while masking every amount', async () => {
  stub(view([env('a', -1_000), env('c', 100_000)], 0));
  setAmountsHidden(true);
  mount();
  const link = await screen.findByRole('link', { name: /1 Envelope überzogen/ });
  expect(link.textContent).toContain('1');
  expect(link.textContent).not.toContain('10,00');
  expect(link.getAttribute('aria-label')).not.toContain('10,00');
  expect(link.getAttribute('href')).toBe('/plan/monat');
});

it('keeps the count and plan link when the summed cents exceed safe integer precision', async () => {
  stub(view([env('a', -Number.MAX_SAFE_INTEGER), env('b', -1)], 0));
  mount();
  const link = await screen.findByRole('link', { name: /2 Envelopes überzogen/ });
  expect(link.textContent).toContain('Betrag unbekannt');
  expect(link.textContent).not.toContain('90.071.992.547.409,92');
  expect(link.getAttribute('href')).toBe('/plan/monat');
  expect(link.getAttribute('data-search')).toBe(
    JSON.stringify({ monat: '2026-09', ansicht: 'triage' }),
  );
});

it('shows a neutral plan link when the budget status cannot be loaded', async () => {
  stubError();
  mount();
  const link = await screen.findByRole('link', {
    name: 'Budgetstatus nicht verfügbar – Plan prüfen',
  });
  expect(link.getAttribute('href')).toBe('/plan/monat');
  expect(link.getAttribute('data-search')).toBe(
    JSON.stringify({ monat: '2026-09', ansicht: 'triage' }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(posts).toEqual([]);
});

it('does not present cached overspending as current after a failed refetch', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  stub(view([env('a', -1_000)], 0));
  mount(client);
  await screen.findByRole('link', { name: /1 Envelope überzogen/ });
  stubError();
  await client.invalidateQueries();
  const link = await screen.findByRole('link', {
    name: 'Budgetstatus nicht verfügbar – Plan prüfen',
  });
  expect(link.getAttribute('href')).toBe('/plan/monat');
  expect(screen.queryByRole('link', { name: /Envelope überzogen/ })).toBeNull();
});
