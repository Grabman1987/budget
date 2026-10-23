// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@budget/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureForm } from './capture-form';
import { emptyDraft } from './booking-model';
import type { BookingCreate } from './api';
import type { BookingPanelState } from './booking-panel';
import type { CaptureChoices, QueuedBooking } from '../pwa/queue-store';

const calls = vi.hoisted(() => ({
  create: vi.fn(),
  patch: vi.fn(),
  accounts: vi.fn(),
  editQueued: vi.fn(),
}));
vi.mock('../receipts/receipt-section', () => ({ ReceiptSection: () => null }));
vi.mock('./mutations', () => ({
  useLedgerWrites: () => ({
    create: { mutateAsync: calls.create },
    patch: { mutateAsync: calls.patch },
  }),
}));
vi.mock('../budget/budget-api', () => ({
  budgetQuery: () => ({ queryKey: ['budget585'], queryFn: async () => null }),
}));
vi.mock('./queries', () => ({
  LEDGER_KEY: ['ledger585'],
  accountsQuery: () => ({ queryKey: ['accounts585'], queryFn: calls.accounts }),
  lookupsQuery: () => ({
    queryKey: ['lookups585'],
    queryFn: async () => ({
      categories: [],
      groups: [],
      contacts: [],
      incomeTypes: [],
      projects: [],
    }),
  }),
  payeesQuery: () => ({ queryKey: ['payees585'], queryFn: async () => ({ payees: [] }) }),
}));
vi.mock('../pwa/queue-store', () => ({
  readChoices: async () => undefined,
  saveChoices: async () => undefined,
  editQueued: (...args: unknown[]) => calls.editQueued(...args),
}));
const accounts: CaptureChoices['accounts'] = [
  {
    id: 'cash585',
    name: 'Bargeld Muster',
    type: 'cash',
    onBudget: true,
    sortOrder: 0,
    closedAt: null,
  },
  {
    id: 'bank585',
    name: 'Giro Muster',
    type: 'checking',
    onBudget: true,
    sortOrder: 1,
    closedAt: null,
  },
  {
    id: 'save585',
    name: 'Sparen Muster',
    type: 'savings',
    onBudget: true,
    sortOrder: 2,
    closedAt: null,
  },
  {
    id: 'card585',
    name: 'Karte Muster',
    type: 'credit_card',
    onBudget: true,
    sortOrder: 3,
    closedAt: null,
  },
];
beforeEach(() => {
  localStorage.clear();
  calls.create.mockReset().mockResolvedValue({ bookings: [], groupId: 'synthetic585' });
  calls.patch.mockReset();
  calls.editQueued.mockReset().mockResolvedValue(undefined);
  calls.accounts.mockReset().mockResolvedValue({ accounts });
});
const day = '2026-10-20';
const transferState = (from = 'cash585', to = 'bank585'): NonNullable<BookingPanelState> => ({
  mode: 'create',
  accountId: from,
  prefill: { kind: 'transfer', toAccountId: to, amount: '123,45', date: day, status: 'confirmed' },
});
function setup(state = transferState(), queued?: QueuedBooking) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const done = vi.fn();
  const dirty = { current: false };
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CaptureForm
          state={state}
          onDone={done}
          dirtyRef={dirty}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
          {...(queued ? { queued } : {})}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), done, dirty };
}
const saveButton = () => screen.getByRole('button', { name: /^Speichern$/ });
const queuedTransfer = (
  status: 'pending' | 'confirmed',
  bankStatus?: 'pending' | 'confirmed',
  cashFirst = false,
): QueuedBooking => ({
  id: 'synthetic-queue585',
  createdAt: 1,
  uncertain: false,
  input: {
    type: 'transfer',
    fromAccountId: cashFirst ? 'cash585' : 'bank585',
    toAccountId: cashFirst ? 'bank585' : 'cash585',
    date: day,
    amountCents: 12345,
    categoryId: null,
    memo: null,
    status,
    ...(bankStatus === undefined ? {} : { bankStatus }),
  },
  draft: {
    ...emptyDraft(cashFirst ? 'cash585' : 'bank585', day),
    kind: 'transfer',
    toAccountId: cashFirst ? 'bank585' : 'cash585',
    amount: '123,45',
    status,
  },
});

describe('capture cash/bank leg intent #585', () => {
  it.each([
    ['cash585', 'bank585', 'Giro Muster'],
    ['bank585', 'cash585', 'Giro Muster'],
    ['cash585', 'save585', 'Sparen Muster'],
    ['save585', 'cash585', 'Sparen Muster'],
  ])(
    'shows read-only cash and enabled pending bank for %s→%s; shared confirmed is not bank intent',
    async (from, to, bankName) => {
      const { user } = setup(transferState(from, to));
      const bank = await screen.findByRole('button', { name: `${bankName}: Status Vorgemerkt` });
      expect(bank).toHaveProperty('disabled', false);
      expect(bank.getAttribute('aria-pressed')).toBe('false');
      const cash = screen.getByRole('textbox', { name: 'Bargeld Muster: Status' });
      expect(cash).toHaveProperty('readOnly', true);
      expect(cash).toHaveProperty('value', 'Bestätigt');
      expect(screen.getByText('Bargeld ist sofort bestätigt.')).toBeTruthy();
      await user.click(saveButton());
      await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
      expect(calls.create.mock.calls[0]![0].input).toMatchObject({
        type: 'transfer',
        fromAccountId: from,
        toAccountId: to,
        amountCents: 12345,
      });
      expect(calls.create.mock.calls[0]![0].input).not.toHaveProperty('bankStatus');
      expect(calls.patch).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    'sends an effective explicit bank confirmation in reverse=%s without a second PATCH',
    async (reverse) => {
      const { user, dirty } = setup(
        reverse ? transferState('bank585', 'cash585') : transferState(),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Giro Muster: Status Vorgemerkt' }),
      );
      expect(
        screen
          .getByRole('button', { name: 'Giro Muster: Status Bestätigt' })
          .getAttribute('aria-pressed'),
      ).toBe('true');
      await waitFor(() => expect(dirty.current).toBe(true));
      await user.click(saveButton());
      await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
      expect(calls.create.mock.calls[0]![0].input).toMatchObject({
        amountCents: 12345,
        bankStatus: 'confirmed',
      });
      expect(calls.patch).not.toHaveBeenCalled();
    },
  );
  it('preserves deliberate pending intent after toggling confirmation off', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Giro Muster: Status Vorgemerkt' }));
    await user.click(screen.getByRole('button', { name: 'Giro Muster: Status Bestätigt' }));
    await user.click(saveButton());
    await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
    expect(calls.create.mock.calls[0]![0].input).toMatchObject({
      amountCents: 12345,
      bankStatus: 'pending',
    });
  });
  it.each([false, true])(
    'clears a confirmation when bank identity changes, including switch-back, reverse=%s',
    async (reverse) => {
      const { user } = setup(reverse ? transferState('bank585', 'cash585') : transferState());
      await user.click(
        await screen.findByRole('button', { name: 'Giro Muster: Status Vorgemerkt' }),
      );
      const select = screen.getByRole('combobox', { name: reverse ? 'Von Konto' : 'Nach Konto' });
      await user.selectOptions(select, 'save585');
      expect(
        screen
          .getByRole('button', { name: 'Sparen Muster: Status Vorgemerkt' })
          .getAttribute('aria-pressed'),
      ).toBe('false');
      await user.selectOptions(select, 'bank585');
      expect(
        screen
          .getByRole('button', { name: 'Giro Muster: Status Vorgemerkt' })
          .getAttribute('aria-pressed'),
      ).toBe('false');
      await user.click(saveButton());
      await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
      expect(calls.create.mock.calls[0]![0].input).not.toHaveProperty('bankStatus');
    },
  );
  it.each([
    ['pending', 'pending', false],
    ['pending', 'confirmed', false],
    ['confirmed', 'pending', false],
    ['confirmed', 'confirmed', false],
    ['pending', 'pending', true],
    ['pending', 'confirmed', true],
    ['confirmed', 'pending', true],
    ['confirmed', 'confirmed', true],
  ] as const)(
    'restores queued shared=%s explicit bank=%s cashFirst=%s after the real accounts query resolves',
    async (status, bankStatus, cashFirst) => {
      let resolve!: (value: { accounts: CaptureChoices['accounts'] }) => void;
      calls.accounts.mockReturnValue(
        new Promise<{ accounts: CaptureChoices['accounts'] }>((done) => {
          resolve = done;
        }),
      );
      const queued = queuedTransfer(status, bankStatus, cashFirst);
      const { user, dirty } = setup(
        transferState(queued.draft.accountId, queued.draft.toAccountId),
        queued,
      );
      expect(screen.queryByRole('button', { name: /Giro Muster: Status/ })).toBeNull();
      await act(async () => {
        resolve({ accounts });
      });
      const bank = await screen.findByRole('button', {
        name: `Giro Muster: Status ${bankStatus === 'confirmed' ? 'Bestätigt' : 'Vorgemerkt'}`,
      });
      expect(bank).toHaveProperty('disabled', false);
      expect(dirty.current).toBe(false);
      await user.click(screen.getByRole('button', { name: 'Umbuchung' }));
      expect(
        screen.getByRole('button', {
          name: `Giro Muster: Status ${bankStatus === 'confirmed' ? 'Bestätigt' : 'Vorgemerkt'}`,
        }),
      ).toBeTruthy();
      await user.click(saveButton());
      await waitFor(() => expect(calls.editQueued).toHaveBeenCalledTimes(1));
      expect(calls.editQueued.mock.calls[0]![1]).toEqual(queued.input);
      expect(calls.create).not.toHaveBeenCalled();
      expect(calls.patch).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['pending', false],
    ['confirmed', false],
    ['pending', true],
    ['confirmed', true],
  ] as const)(
    'retains an absent queued bank intent despite shared=%s cashFirst=%s, without changing its payload bytes',
    async (status, cashFirst) => {
      const queued = queuedTransfer(status, undefined, cashFirst);
      const originalBytes = JSON.stringify(queued.input);
      const { user } = setup(
        transferState(queued.draft.accountId, queued.draft.toAccountId),
        queued,
      );
      expect(
        await screen.findByRole('button', { name: 'Giro Muster: Status Vorgemerkt' }),
      ).toHaveProperty('disabled', false);
      await user.click(saveButton());
      await waitFor(() => expect(calls.editQueued).toHaveBeenCalledTimes(1));
      const input: BookingCreate = calls.editQueued.mock.calls[0]![1];
      expect(input).not.toHaveProperty('bankStatus');
      expect(JSON.stringify(input)).toBe(originalBytes);
      expect(calls.create).not.toHaveBeenCalled();
    },
  );
  it('keeps ordinary cash readonly and ordinary bank manually confirmable without bank-specific intent', async () => {
    const { user } = setup({
      mode: 'create',
      accountId: 'cash585',
      prefill: { kind: 'income', amount: '123,45', date: day },
    });
    expect(await screen.findByRole('button', { name: 'Bestätigt' })).toHaveProperty(
      'disabled',
      true,
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Konto' }), 'bank585');
    await user.click(screen.getByRole('button', { name: 'Vorgemerkt' }));
    await user.click(saveButton());
    await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
    expect(calls.create.mock.calls[0]![0].input).toMatchObject({
      type: 'booking',
      accountId: 'bank585',
      amountCents: 12345,
      status: 'confirmed',
    });
    expect(calls.create.mock.calls[0]![0].input).not.toHaveProperty('bankStatus');
  });
  it.each([undefined, 'confirmed'] as const)(
    'retains queued metadata bankStatus=%s when the same bank ID is remotely retyped',
    async (bankStatus) => {
      const queued = queuedTransfer('pending', bankStatus, true);
      let resolve!: (value: { accounts: CaptureChoices['accounts'] }) => void;
      calls.accounts.mockReturnValue(
        new Promise<{ accounts: CaptureChoices['accounts'] }>((done) => {
          resolve = done;
        }),
      );
      const { user } = setup(transferState(), queued);
      await act(async () => {
        resolve({
          accounts: accounts.map((account) =>
            account.id === 'bank585' ? { ...account, type: 'credit_card' } : account,
          ),
        });
      });
      await within(screen.getByRole('combobox', { name: 'Nach Konto' })).findByRole('option', {
        name: 'Giro Muster',
      });
      await user.click(saveButton());
      await waitFor(() => expect(calls.editQueued).toHaveBeenCalledTimes(1));
      expect(calls.editQueued.mock.calls[0]![1]).toEqual(queued.input);
      expect(JSON.stringify(calls.editQueued.mock.calls[0]![1])).toBe(JSON.stringify(queued.input));
      expect(calls.create).not.toHaveBeenCalled();
      expect(calls.patch).not.toHaveBeenCalled();
    },
  );
  it('leaves the old cash/credit-card nonpair control unchanged', async () => {
    setup(transferState('cash585', 'card585'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Bestätigt' })).toHaveProperty('disabled', true),
    );
    expect(screen.queryByRole('textbox', { name: 'Bargeld Muster: Status' })).toBeNull();
  });
});
