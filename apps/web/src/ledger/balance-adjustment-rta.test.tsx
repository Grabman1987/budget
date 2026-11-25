// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { CategoryCell } from './booking-cells';
import { CaptureForm } from './capture-form';
import type { ListedBooking } from './types';

const patch = vi.hoisted(() => vi.fn().mockResolvedValue({ groupId: 'synthetic' }));
vi.mock('./mutations', () => ({
  useLedgerWrites: () => ({ create: { mutateAsync: vi.fn() }, patch: { mutateAsync: patch } }),
}));
vi.mock('../receipts/receipt-section', () => ({ ReceiptSection: () => null }));
vi.mock('../budget/budget-api', () => ({
  budgetQuery: () => ({ queryKey: ['budget'], queryFn: async () => null }),
}));
vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
vi.mock('./queries', () => ({
  LEDGER_KEY: ['ledger'],
  accountsQuery: () => ({
    queryKey: ['accounts'],
    queryFn: async () => ({
      accounts: [
        { id: 'wallet', name: 'Bargeld Muster', type: 'cash', onBudget: true, closedAt: null },
      ],
    }),
  }),
  lookupsQuery: () => ({
    queryKey: ['lookups'],
    queryFn: async () => ({
      categories: [],
      groups: [],
      contacts: [],
      incomeTypes: [],
      projects: [],
    }),
  }),
  payeesQuery: () => ({ queryKey: ['payees'], queryFn: async () => ({ payees: [] }) }),
}));
vi.mock('../pwa/queue-store', () => ({
  readChoices: async () => undefined,
  saveChoices: async () => undefined,
}));
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});
afterEach(() => {
  cleanup();
  patch.mockClear();
});

const booking: ListedBooking = {
  id: 'synthetic-adjustment',
  accountId: 'wallet',
  accountName: 'Bargeld Muster',
  date: '2026-10-01',
  amountCents: -1200,
  payeeId: 'synthetic-payee',
  payeeName: 'Reconciliation Balance Adjustment',
  memo: null,
  status: 'confirmed',
  flag: null,
  transferId: null,
  transferAccountId: null,
  transferAccountName: null,
  projectId: null,
  currency: 'EUR',
  originalAmountCents: null,
  originalCurrency: null,
  balanceAfterCents: null,
  splits: [
    {
      id: 'synthetic-split',
      categoryId: null,
      categoryName: null,
      amountCents: -1200,
      memo: null,
      contactId: null,
      incomeTypeId: null,
      transferId: null,
    },
  ],
};
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

it('discards an unsent edit without accessing unavailable device storage', async () => {
  const discard = vi.fn();
  // This fixture deliberately has no IndexedDB or queue storage implementation.
  render(
    <QueryClientProvider client={client()}>
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'edit', booking }}
          onDone={vi.fn()}
          dirtyRef={{ current: false }}
          discard={{ asking: true, keep: vi.fn(), discard }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  // The footer also has a (close-now) Verwerfen; the confirmation lives in the alert dialog.
  fireEvent.click(
    within(screen.getByRole('alertdialog', { name: 'Eingaben verwerfen?' })).getByRole('button', {
      name: 'Verwerfen',
    }),
  );
  await waitFor(() => expect(discard).toHaveBeenCalledOnce());
  expect(patch).not.toHaveBeenCalled();
});

it.each(['reconciliation_adjustment', 'manual_adjustment'])(
  'labels negative explicit %s as Zu verteilen',
  (payeeSystemKind) => {
    render(
      <QueryClientProvider client={client()}>
        <CategoryCell booking={{ ...booking, payeeSystemKind }} classes={new Map()} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Zu verteilen')).toBeTruthy();
    expect(screen.queryByText('ohne Kategorie')).toBeNull();
  },
);
it('keeps an ordinary expense with the same payee text visibly uncategorized', () => {
  render(
    <QueryClientProvider client={client()}>
      <CategoryCell booking={booking} classes={new Map()} />
    </QueryClientProvider>,
  );
  expect(screen.getByText('ohne Kategorie')).toBeTruthy();
  expect(screen.queryByText('Zu verteilen')).toBeNull();
});
it.each([true, false])(
  'offers Zu verteilen only when editing an explicit correction (%s)',
  async (explicit) => {
    const done = vi.fn();
    render(
      <QueryClientProvider client={client()}>
        <ToastProvider>
          <CaptureForm
            state={{
              mode: 'edit',
              booking: {
                ...booking,
                payeeSystemKind: explicit ? 'reconciliation_adjustment' : null,
              },
            }}
            onDone={done}
            dirtyRef={{ current: false }}
            discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
            requestClose={vi.fn()}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const category = await screen.findByRole('combobox', { name: 'Kategorie' });
    expect((category as HTMLInputElement).value).toBe(explicit ? 'Zu verteilen' : '');
    fireEvent.focus(category);
    expect(screen.queryByRole('option', { name: 'Zu verteilen' }) !== null).toBe(explicit);
    fireEvent.change(screen.getByLabelText('Notiz'), { target: { value: 'Synthetische Notiz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(patch).toHaveBeenCalledWith({
      id: booking.id,
      patch: { memo: 'Synthetische Notiz' },
      capture: {
        input: expect.objectContaining({ type: 'booking', amountCents: booking.amountCents }),
        draft: expect.objectContaining({ memo: 'Synthetische Notiz' }),
      },
    });
  },
);
