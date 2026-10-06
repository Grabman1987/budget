// @vitest-environment jsdom
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OverspentChip } from './overspent-chip';

vi.mock('./app-link', () => ({
  AppLink: ({ children, to, search }: { children: ReactNode; to: string; search?: unknown }) => (
    <a href={`#${to}`} data-search={JSON.stringify(search)}>
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
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

it('shows count and amount, and "Alle decken" when enough money exists', async () => {
  stub(view([env('a', -10_000), env('b', -5_000), env('c', 100_000)], 0));
  mount();
  const chip = await screen.findByRole('button', {
    name: '2 Envelopes überzogen, 150,00 € zu decken – Überziehungen prüfen',
  });
  expect(chip.getAttribute('aria-expanded')).toBe('false');
  await userEvent.click(chip);
  expect(chip.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText(/Env a · 100,00 €/)).toBeTruthy();
  expect(screen.queryByText(/Es fehlen/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Alle decken' }));
  await waitFor(() => expect(posts).toEqual([{ coverAll: true }]));
  await userEvent.keyboard('{Escape}');
  expect(chip.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(chip);
});

it('names the missing amount and links to the detail when money is short', async () => {
  stub(view([env('a', -131_515), env('c', 1_000)], 0));
  mount();
  await userEvent.click(await screen.findByRole('button', { name: /1 Envelope überzogen/ }));
  expect(screen.getByText(/Es fehlen 1\.305,15 €/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Alle decken' })).toBeNull();
  const link = screen.getByRole('link', { name: 'Im Detail lösen' });
  expect(link.getAttribute('data-search')).toBe(
    JSON.stringify({ monat: '2026-09', ansicht: 'triage' }),
  );
});

it('masks amounts in privacy mode', async () => {
  stub(view([env('a', -10_000), env('c', 100_000)], 0));
  setAmountsHidden(true);
  mount();
  const chip = await screen.findByRole('button', { name: /1 Envelope überzogen/ });
  expect(chip.getAttribute('aria-label')).not.toContain('100,00');
  expect(chip.textContent).not.toContain('100,00');
});
