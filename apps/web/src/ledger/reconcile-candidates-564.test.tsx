// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReconcileFlow } from './reconcile-panel';
import type { AccountRow, Category, ReconciliationPreview } from './types';

const writes = vi.hoisted(() => ({
  remove: { isPending: false, mutate: vi.fn() },
  bulk: { isPending: false, mutate: vi.fn() },
  offerUndo: vi.fn(),
}));
vi.mock('./mutations', () => ({ useLedgerWrites: () => writes }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: React.ReactNode }) => (
    <a href="/konten/buchungen">{children}</a>
  ),
}));
let preview: ReconciliationPreview;
const sends: unknown[] = [];
let categories: Category[] = [];
beforeEach(() => {
  vi.setSystemTime(new Date('2026-09-30T10:00:00Z'));
  localStorage.clear();
  categories = [];
  writes.remove.mutate.mockReset();
  writes.bulk.mutate.mockReset();
  sends.length = 0;
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  preview = {
    accountId: 'a',
    date: '2026-09-30',
    statementBalanceCents: -1234,
    bookedBalanceCents: -2468,
    pendingCents: 1234,
    differenceCents: 1234,
    toReconcileCount: 2,
    duplicates: [
      {
        removeId: 'duplicate',
        keepId: 'original',
        date: '2026-09-10',
        payeeName: 'Synthetic duplicate',
        amountCents: -1234,
        explainsDifference: true,
      },
    ],
    pendingMatches: [{ bookingIds: ['pending'], sumCents: 1234 }],
    missing: null,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      let body: unknown = {};
      if (url.includes('/lookups')) body = { categories, groups: [], projects: [] };
      else if (url.endsWith('/reconciliation/preview')) body = { preview };
      else if (url.endsWith('/reconciliation')) {
        sends.push(JSON.parse(options!.body as string));
        body = {
          result: {
            groupId: 'synthetic-reconcile',
            adjustmentBookingId: null,
            differenceCents: 0,
            reconciledCount: 1,
          },
        };
      }
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const show = (
  bankCents = -1234,
  monthClose?: Parameters<typeof ReconcileFlow>[0]['monthClose'],
  overrides: Partial<AccountRow> = {},
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const account = {
    id: 'a',
    name: 'Synthetic account',
    currency: 'EUR',
    type: 'checking',
    onBudget: true,
    openingDate: '2026-01-01',
    bankBalance: { amountCents: bankCents, effectiveDate: '2026-09-30' },
    ...overrides,
  } as AccountRow;
  render(
    <QueryClientProvider client={client}>
      <ReconcileFlow
        account={account}
        {...(monthClose ? { monthClose } : {})}
        onDone={() => undefined}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  return client;
};
it('requires explicit review of every existing candidate before correction and locally undoes ignore without writes', async () => {
  show();
  const duplicate = await screen.findByTestId('candidate-duplicate-duplicate');
  const pending = screen.getByTestId('candidate-pending-pending');
  expect(screen.queryByRole('button', { name: 'Differenz ausgleichen' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Differenz ausgleichen/ })).toBeNull();
  fireEvent.click(within(duplicate).getByRole('button', { name: 'Ignorieren' }));
  expect(screen.queryByRole('button', { name: 'Differenz ausgleichen' })).toBeNull();
  fireEvent.click(within(pending).getByRole('button', { name: 'Ignorieren' }));
  expect(await screen.findByRole('button', { name: 'Differenz ausgleichen' })).toBeTruthy();
  expect(screen.getByText(/Eine echte Buchung/).textContent).toContain('+12,34 €');
  expect(sends).toEqual([]);
  expect(writes.remove.mutate).not.toHaveBeenCalled();
  fireEvent.click(within(duplicate).getByRole('button', { name: 'Ignorieren rückgängig' }));
  expect(screen.queryByRole('button', { name: 'Differenz ausgleichen' })).toBeNull();
  expect(sends).toEqual([]);
  fireEvent.click(within(duplicate).getByRole('button', { name: 'Ignorieren' }));
  expect(await screen.findByRole('button', { name: 'Differenz ausgleichen' })).toBeTruthy();
  preview = { ...preview, statementBalanceCents: -1235, differenceCents: 1233 };
  fireEvent.change(screen.getByLabelText('Saldo laut Bank', { exact: true }), {
    target: { value: '-12,35' },
  });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Ignorieren rückgängig' })).toBeNull(),
  );
  expect(await screen.findByTestId('candidate-duplicate-duplicate')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Differenz ausgleichen' })).toBeNull();
});
it('uses the existing duplicate action, refreshes to literal zero, and reconciles without adjust only on explicit click', async () => {
  preview.pendingMatches = [];
  const client = show();
  const duplicate = await screen.findByTestId('candidate-duplicate-duplicate');
  fireEvent.click(within(duplicate).getByRole('button', { name: 'Doppelte Buchung entfernen' }));
  expect(writes.remove.mutate.mock.calls[0]?.[0]).toEqual({ id: 'duplicate' });
  expect(sends).toEqual([]);
  preview = {
    ...preview,
    bookedBalanceCents: -1234,
    differenceCents: 0,
    toReconcileCount: 1,
    duplicates: [],
  };
  await client.invalidateQueries({ queryKey: ['ledger'] });
  const lock = await screen.findByRole('button', { name: 'Kontostand stimmt' });
  expect(screen.queryByRole('button', { name: /Differenz ausgleichen/ })).toBeNull();
  fireEvent.click(lock);
  await waitFor(() =>
    expect(sends).toEqual([{ date: '2026-09-30', statementBalanceCents: -1234 }]),
  );
});
it('shows a partial pending minus3000 against minus4000 and uses canonical status confirmation before offering only the remaining minus1000', async () => {
  preview = {
    ...preview,
    statementBalanceCents: -4000,
    bookedBalanceCents: 0,
    pendingCents: -3000,
    differenceCents: -4000,
    toReconcileCount: 0,
    duplicates: [],
    pendingMatches: [],
    pendingBookings: [
      { id: 'partial', date: '2026-09-10', payeeName: 'Synthetic partial', amountCents: -3000 },
    ],
    missing: { kind: 'expense', amountCents: 4000 },
  };
  const client = show(-4000);
  const row = await screen.findByTestId('candidate-pending-partial');
  expect(row.textContent).toContain('−30,00 €');
  expect(screen.queryByRole('button', { name: /Differenz ausgleichen/ })).toBeNull();
  expect(sends).toEqual([]);
  fireEvent.click(within(row).getByRole('button', { name: 'Bestätigen' }));
  expect(writes.bulk.mutate.mock.calls[0]?.[0]).toEqual({
    ids: ['partial'],
    set: { status: 'confirmed' },
  });
  expect(sends).toEqual([]);
  preview = {
    ...preview,
    bookedBalanceCents: -3000,
    pendingCents: 0,
    differenceCents: -1000,
    toReconcileCount: 1,
    pendingBookings: [],
    missing: { kind: 'expense', amountCents: 1000 },
  };
  await client.invalidateQueries({ queryKey: ['ledger'] });
  const correction = await screen.findByRole('button', { name: /Differenz ausgleichen/ });
  expect(correction.textContent).toBe('Differenz ausgleichen');
  expect(screen.getByText(/Eine echte Buchung/).textContent).toContain('−10,00 €');
  expect(screen.getByText(/Eine echte Buchung/).textContent).not.toContain('−40,00 €');
  expect(sends).toEqual([]);
});
it('keeps an existing month-close token stale after a separate candidate confirmation and requires reload instead of silently advancing it', async () => {
  preview = {
    ...preview,
    statementBalanceCents: -4000,
    bookedBalanceCents: 0,
    pendingCents: -3000,
    differenceCents: -4000,
    toReconcileCount: 0,
    duplicates: [],
    pendingMatches: [],
    pendingBookings: [{ id: 'partial', date: '2026-09-10', payeeName: null, amountCents: -3000 }],
    missing: { kind: 'expense', amountCents: 4000 },
  };
  const close = { asOf: '2026-09-30', confirm: vi.fn(), onReload: vi.fn(), onBusy: vi.fn() };
  const client = show(-4000, close);
  fireEvent.click(
    within(await screen.findByTestId('candidate-pending-partial')).getByRole('button', {
      name: 'Bestätigen',
    }),
  );
  expect(close.onBusy).toHaveBeenCalledWith(true);
  preview = {
    ...preview,
    bookedBalanceCents: -3000,
    pendingCents: 0,
    differenceCents: -1000,
    pendingBookings: [],
    missing: { kind: 'expense', amountCents: 1000 },
  };
  await act(async () => {
    const options = writes.bulk.mutate.mock.calls[0]![1];
    options.onSuccess({ changed: ['partial'], skipped: [], groupId: 'synthetic-status' });
    options.onSettled();
    await client.invalidateQueries({ queryKey: ['ledger'] });
  });
  expect(
    ((await screen.findByRole('button', { name: /Differenz ausgleichen/ })) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(close.confirm).not.toHaveBeenCalled();
  expect(close.onBusy).toHaveBeenLastCalledWith(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Prüfung schließen und Abschluss neu laden' }),
  );
  expect(close.onReload).toHaveBeenCalledTimes(1);
});

it.each([
  [{ onBudget: true }, 'Zu verteilen'],
  [{ onBudget: false }, 'Ohne Kategorie'],
  [{ type: 'credit_card' }, 'Ohne Kategorie'],
] as const)(
  'retains the canonical correction policy for %j and ignores remembered categories',
  async (overrides, label) => {
    preview = { ...preview, duplicates: [], pendingMatches: [], pendingBookings: [] };
    localStorage.setItem('budget-reconcile-category:a', 'food');
    show(-1234, undefined, overrides);
    const correction = await screen.findByRole('button', { name: 'Differenz ausgleichen' });
    expect((screen.getByLabelText('Kategorie für den Ausgleich') as HTMLInputElement).value).toBe(
      label,
    );
    expect(screen.getByText(/Eine echte Buchung/).textContent).toContain(label);
    expect(sends).toEqual([]);
    fireEvent.click(correction);
    await waitFor(() =>
      expect(sends).toEqual([{ date: '2026-09-30', statementBalanceCents: -1234, adjust: true }]),
    );
  },
);
