// @vitest-environment jsdom
import { setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActivityContributions } from './activity-contributions';
import type { BudgetActivityPage } from './budget-api';

// This component test proves the existing editor handoff, not the editor's save/Undo implementation.
vi.mock('../ledger/booking-panel', () => ({
  BookingPanel: ({
    state,
    onClose,
  }: {
    state: { mode: string; booking: { id: string } } | null;
    onClose: () => void;
  }) =>
    state ? (
      <div role="dialog" aria-label="Existing booking editor">
        {state.mode}: {state.booking.id}
        <button onClick={onClose}>Close origin</button>
      </div>
    ) : null,
}));

type Item = BudgetActivityPage['activityBreakdown']['items'][number];
type Page = Pick<BudgetActivityPage, 'activityBreakdown'>;
const split: Item = {
  key: 'split-one',
  month: '2026-10',
  categoryId: 'category',
  kind: 'booking',
  contributionCents: -4_000,
  bookingId: 'shared-origin',
  splitId: 'one',
  accountId: 'cash',
  date: '2026-10-05',
  status: 'pending',
  sourceCategoryId: 'category',
  sourceAmountCents: -4_000,
  cardBalanceCoveredCents: 0,
  relatedCategories: [],
  source: {
    payeeName: 'Synthetic shop',
    memo: 'Synthetic short note',
    accountName: 'Synthetic account',
    bookingAmountCents: -20_000,
  },
};
const page = (items: Item[], totalCents = -15_000, count = 4): Page => ({
  activityBreakdown: { items, totalCents, count, pageCents: -7_000, nextCursor: 'next' },
});
const calls: string[] = [];
let failSource: boolean;
let holdSource: Promise<void> | undefined;
const clients: QueryClient[] = [];
beforeEach(() => {
  calls.length = 0;
  failSource = false;
  holdSource = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${path}`);
      if (
        method !== 'GET' ||
        !['/api/bookings/shared-origin', '/api/bookings/other-origin'].includes(path)
      )
        throw new Error(`Unexpected request: ${method} ${path}`);
      await holdSource;
      if (failSource)
        return new Response(JSON.stringify({ error: 'Synthetic read failure' }), { status: 503 });
      return new Response(JSON.stringify({ booking: { id: path.split('/').at(-1) } }), {
        status: 200,
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});
function mount(
  pages: Page[],
  options: { hasMore?: boolean; loadingMore?: boolean; error?: Error } = {},
) {
  const more = vi.fn();
  const reload = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ActivityContributions
        month="2026-10"
        pages={pages}
        categories={[{ id: 'category', name: 'Synthetic category' }]}
        error={options.error ?? null}
        hasMore={options.hasMore ?? false}
        loadingMore={options.loadingMore ?? false}
        onMore={more}
        onReload={reload}
      />
    </QueryClientProvider>,
  );
  return { more, reload };
}

it('uses semantic column headers and retains two distinct contributions of the same origin across pages', () => {
  const second: Item = {
    ...split,
    key: 'split-two',
    splitId: 'two',
    status: 'reconciled',
    contributionCents: -3_000,
    sourceAmountCents: -3_000,
  };
  mount([page([split]), page([second])], { hasMore: true });
  const table = screen.getByRole('table', { name: 'Kategoriebeiträge · 2026-10' });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((node) => node.textContent),
  ).toEqual(['Datum', 'Buchung / Empfänger', 'Konto', 'Status', 'Anteil dieser Kategorie']);
  for (const header of within(table).getAllByRole('columnheader'))
    expect(header.getAttribute('scope')).toBe('col');
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => within(row).getAllByRole('cell').at(-1)?.textContent)).toEqual([
    '−40,00 €',
    '−30,00 €',
  ]);
  expect(within(table).getAllByText('Buchung gesamt: −200,00 €')).toHaveLength(2);
  expect(screen.getByText(/Aktivität gesamt:/).textContent).toBe(
    'Aktivität gesamt: −150,00 € · 4 Einträge',
  );
  expect(within(rows[0]!).getByText('Synthetic short note').textContent).toBe(
    'Synthetic short note',
  );
  expect(within(rows[0]!).getAllByRole('cell')[0]?.textContent).toBe('05.10.2026');
  expect(within(rows[0]!).getAllByRole('cell')[3]?.textContent).toBe('Vorgemerkt');
  expect(within(rows[1]!).getAllByRole('cell')[3]?.textContent).toBe('Abgeglichen');
  expect(calls).toEqual([]);
});

it('keeps card reserve inputs and derived monthly corrections explicit without inventing a booking opener', () => {
  const reserve: Item = {
    ...split,
    key: 'reserve',
    kind: 'card-reserve',
    status: 'confirmed',
    contributionCents: 3_000,
    sourceAmountCents: -5_000,
    cardBalanceCoveredCents: 2_000,
  };
  const derived: Item = {
    ...split,
    key: 'derived',
    kind: 'unfunded-card',
    bookingId: null,
    splitId: null,
    source: null,
    date: null,
    status: null,
    sourceAmountCents: null,
    contributionCents: -1_000,
    relatedCategories: [{ categoryId: 'category', cents: -1_000 }],
  };
  mount([page([reserve, derived], 2_000, 2)]);
  const rows = screen.getAllByRole('row').slice(1);
  expect(within(rows[0]!).getByText('Kartenzahlungsreserve')).toBeTruthy();
  expect(
    within(rows[0]!).getByText(
      'Ursprünglicher Buchungsanteil: −50,00 € · davon aus positivem Kartenguthaben: 20,00 €',
    ),
  ).toBeTruthy();
  expect(within(rows[0]!).getAllByRole('cell').at(-1)?.textContent).toBe('+30,00 €');
  expect(within(rows[1]!).getByText('Ungedeckte Kartenausgaben · 2026-10')).toBeTruthy();
  expect(within(rows[1]!).getByText(/Keine zusätzliche Buchung/)).toBeTruthy();
  expect(within(rows[1]!).getByText('Synthetic category: −10,00 €')).toBeTruthy();
  expect(within(rows[1]!).getAllByRole('cell')[3]?.textContent).toBe('Abgeleitet');
  expect(within(rows[1]!).getAllByRole('cell').at(-1)?.textContent).toBe('−10,00 €');
  expect(within(rows[1]!).queryByRole('button')).toBeNull();
  expect(calls).toEqual([]);
});

it('masks contributions, repeated source totals and card-cover detail without mutating the data', async () => {
  const reserve: Item = {
    ...split,
    kind: 'card-reserve',
    contributionCents: 3_000,
    sourceAmountCents: -5_000,
    cardBalanceCoveredCents: 2_000,
  };
  const data = [page([reserve], 3_000, 1)];
  const before = JSON.stringify(data);
  mount(data);
  act(() => setAmountsHidden(true));
  const table = screen.getByRole('table');
  await waitFor(() => expect(table.textContent).toContain('•••'));
  for (const amount of ['30,00', '50,00', '200,00', '20,00'])
    expect(table.textContent).not.toContain(amount);
  expect(within(table).getByRole('button').getAttribute('aria-label')).not.toContain('30,00');
  expect(screen.getByText(/Aktivität gesamt:/).textContent).toContain('•••');
  expect(JSON.stringify(data)).toBe(before);
  act(() => setAmountsHidden(false));
  await waitFor(() => expect(table.textContent).toContain('+30,00 €'));
});

it('opens each displayed origin by keyboard through only its exact GET and the unchanged editor handoff', async () => {
  const user = userEvent.setup();
  mount([
    page([
      split,
      { ...split, key: 'same-origin-second-split', splitId: 'two' },
      {
        ...split,
        key: 'other',
        bookingId: 'other-origin',
        source: { ...split.source!, payeeName: 'Second synthetic shop' },
      },
    ]),
  ]);
  const buttons = screen.getAllByRole('button', { name: /Ursprungsbuchung öffnen/ });
  buttons[1]!.focus();
  await user.keyboard('{Enter}');
  expect((await screen.findByRole('dialog')).textContent).toContain('edit: shared-origin');
  await user.click(screen.getByRole('button', { name: 'Close origin' }));
  await user.click(buttons[2]!);
  expect((await screen.findByRole('dialog')).textContent).toContain('edit: other-origin');
  await user.click(screen.getByRole('button', { name: 'Close origin' }));
  await user.click(buttons[0]!);
  expect((await screen.findByRole('dialog')).textContent).toContain('edit: shared-origin');
  expect(calls).toEqual([
    'GET /api/bookings/shared-origin',
    'GET /api/bookings/other-origin',
    'GET /api/bookings/shared-origin',
  ]);
});

it('preserves source loading, read-error and explicit retry without writing', async () => {
  const user = userEvent.setup();
  let release!: () => void;
  holdSource = new Promise<void>((resolve) => {
    release = resolve;
  });
  failSource = true;
  mount([page([split])]);
  await user.click(screen.getByRole('button', { name: /Ursprungsbuchung öffnen/ }));
  try {
    expect(screen.getByRole('status').textContent).toContain('Ursprungsbuchung');
    expect(screen.queryByRole('dialog')).toBeNull();
  } finally {
    release();
  }
  await screen.findByRole('alert');
  failSource = false;
  holdSource = undefined;
  await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  expect((await screen.findByRole('dialog')).textContent).toContain('shared-origin');
  expect(calls).toEqual(['GET /api/bookings/shared-origin', 'GET /api/bookings/shared-origin']);
});

it('keeps paging and reload explicit and preserves empty activity', async () => {
  const user = userEvent.setup();
  const { more, reload } = mount([page([], 0, 0)], {
    hasMore: true,
    error: new Error('Synthetic pagination failure'),
  });
  expect(screen.getByRole('status').textContent).toBe('Keine Aktivität in diesem Monat.');
  await user.click(screen.getByRole('button', { name: 'Weitere Beiträge laden' }));
  await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  expect(more).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
  expect(calls).toEqual([]);
});
