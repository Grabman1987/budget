// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PlanAutomatic } from './plan-automatic';
import { EnvelopeBody } from './envelope-panel';
import { PlanInspector } from './plan-inspector';
import type { PlanRow } from './plan-model';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#detail">{children}</a>,
}));
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});
const row = (over: Partial<PlanRow> = {}): PlanRow => ({
  id: 'a',
  categoryId: 'a',
  name: 'Synthetic category',
  icon: null,
  cls: 'need',
  kind: 'variable',
  stage: 2,
  groupId: 'g',
  cardAccountId: null,
  carryCents: 0,
  assignedCents: 400,
  activityCents: 0,
  availableCents: 400,
  overspentCents: 0,
  cashOverspentCents: 0,
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents: 0,
  dueMonth: null,
  target: null,
  quickAssign: {
    lastMonthCents: 1000,
    averageCents: 300,
    ghostCents: 0,
    ghostSource: 'median',
    historyMonths: [],
  },
  ...over,
});
function setup(ui: ReactNode, changedCount = 1) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(
        JSON.stringify({
          groupId: path === '/api/undo' ? 'undone' : 'one-group',
          changedCount,
          missingCents: 0,
          openCount: 0,
          coveredCents: 200,
        }),
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}
it('renders the five signed previews, disables zero and sends only supplied selection IDs through the existing call/Undo', async () => {
  const selected = row();
  const calls = setup(<PlanAutomatic month="2026-10" rows={[selected]} tba={200} />);
  expect(screen.getAllByRole('button')).toHaveLength(5);
  expect(screen.getByRole('button', { name: 'Wie letzter Monat +2,00 €' }).textContent).toContain(
    '+2,00 €',
  );
  expect(screen.getByText(/fehlen für 1 Kategorie/).textContent).toContain('4,00 €');
  expect(screen.getByRole('button', { name: 'Leere füllen 0,00 €' }).hasAttribute('disabled')).toBe(
    true,
  );
  expect(screen.getByRole('button', { name: 'Auf 0 zurücksetzen −4,00 €' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Wie letzter Monat +2,00 €' }));
  await waitFor(() =>
    expect(calls).toContainEqual({
      path: '/api/budget/2026-10/quick-assign',
      body: { mode: 'last-month', categoryIds: ['a'] },
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
  await waitFor(() =>
    expect(calls).toContainEqual({ path: '/api/undo', body: { groupId: 'one-group' } }),
  );
  act(() => setAmountsHidden(true));
  expect(screen.getByRole('button', { name: /^Auf 0 zurücksetzen/ }).textContent).not.toContain(
    '4,00',
  );
});
it('offsetting reset stays enabled at net zero, sends both assignments and offers one Undo', async () => {
  const positive = row({ assignedCents: 500 });
  const negative = row({ id: 'negative', categoryId: 'negative', assignedCents: -500 });
  const calls = setup(<PlanAutomatic month="2026-10" rows={[positive, negative]} tba={0} />, 2);
  const reset = screen.getByRole('button', { name: 'Auf 0 zurücksetzen 0,00 €' });
  expect(reset.hasAttribute('disabled')).toBe(false);
  fireEvent.click(reset);
  await waitFor(() =>
    expect(calls).toContainEqual({
      path: '/api/budget/2026-10/quick-assign',
      body: { mode: 'reset', categoryIds: ['a', 'negative'] },
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
  await waitFor(() =>
    expect(calls).toContainEqual({ path: '/api/undo', body: { groupId: 'one-group' } }),
  );
});
it('a single suggested cover uses only 200 free cents, preserves the 300-cent shortfall and one Undo', async () => {
  const target = row({
    id: 'target',
    categoryId: 'target',
    assignedCents: 0,
    availableCents: -500,
    activityCents: -500,
    overspentCents: 500,
    cashOverspentCents: 500,
  });
  const source = row({
    id: 'source',
    categoryId: 'source',
    name: 'Synthetic source',
    availableCents: 9500,
    committedCents: 9300,
    freeCents: 200,
  });
  const calls = setup(
    <EnvelopeBody
      month="2026-10"
      row={target}
      rows={[target, source]}
      tba={0}
      onDone={() => {}}
      compact
    />,
  );
  expect(screen.getByText('Aus Synthetic source')).toBeTruthy();
  expect(screen.getAllByText(/3,00 € bleiben offen/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Mit 2,00 € decken' }));
  await waitFor(() =>
    expect(calls).toEqual([
      { path: '/api/budget/2026-10/cover', body: { categoryId: 'target', fromId: 'source' } },
    ]),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
  await waitFor(() =>
    expect(calls).toContainEqual({ path: '/api/undo', body: { groupId: 'one-group' } }),
  );
});
it('reset includes a classed legacy row without history, excluding classless advance rows from the API scope', async () => {
  const legacy = row({ assignedCents: 1200 });
  delete legacy.quickAssign;
  const advance = row({
    id: 'advance',
    categoryId: 'advance',
    kind: 'advance',
    cls: null,
    assignedCents: 500,
  });
  const calls = setup(<PlanAutomatic month="2026-10" rows={[legacy, advance]} tba={0} />);
  fireEvent.click(screen.getByRole('button', { name: 'Auf 0 zurücksetzen −12,00 €' }));
  await waitFor(() =>
    expect(calls).toContainEqual({
      path: '/api/budget/2026-10/quick-assign',
      body: { mode: 'reset', categoryIds: ['a'] },
    }),
  );
});
it.each([false, true])(
  'below 1180 focuses the actual heading and respects reduced-motion=%s',
  (reduced) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches:
        query === '(max-width: 1179px)' ||
        (reduced && query === '(prefers-reduced-motion: reduce)'),
    }));
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const selected = row();
      setup(
        <PlanInspector
          month="2026-10"
          rows={[selected]}
          visibleRows={[selected]}
          selected={[selected]}
          tba={200}
          category={undefined}
          onCategory={() => {}}
          onHide={() => {}}
          onClear={() => {}}
          overview={null}
          split={null}
          income={null}
          money={null}
          rail={null}
        />,
      );
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Synthetic category' }),
      );
      expect(scroll).toHaveBeenCalledWith({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  },
);
