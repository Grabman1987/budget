// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { CaptureForm } from './capture-form';
import * as ledgerApi from './api';
import type { BookingPanelState } from './booking-panel';
import type { BookingPage } from './types';

const writes = vi.hoisted(() => ({ create: vi.fn(), patch: vi.fn() }));
vi.mock('../receipts/receipt-section', () => ({ ReceiptSection: () => null }));
vi.mock('./mutations', () => ({
  useLedgerWrites: () => ({
    create: { mutateAsync: writes.create },
    patch: { mutateAsync: writes.patch },
  }),
}));
vi.mock('../budget/budget-api', () => ({
  budgetQuery: () => ({ queryKey: ['budget724'], queryFn: async () => null }),
}));
vi.mock('./queries', () => ({
  LEDGER_KEY: ['ledger724'],
  accountsQuery: () => ({
    queryKey: ['accounts724'],
    queryFn: async () => ({
      accounts: [
        { id: 'context', name: 'Giro Kontext', type: 'checking', onBudget: true, closedAt: null },
        { id: 'history', name: 'Giro Verlauf', type: 'checking', onBudget: true, closedAt: null },
        { id: 'manual', name: 'Giro Auswahl', type: 'checking', onBudget: true, closedAt: null },
      ],
    }),
  }),
  lookupsQuery: () => ({
    queryKey: ['lookups724'],
    queryFn: async () => ({
      categories: [],
      groups: [],
      contacts: [],
      incomeTypes: [],
      projects: [],
    }),
  }),
  payeesQuery: () => ({
    queryKey: ['payees724'],
    queryFn: async () => ({
      payees: [{ id: 'known724', name: 'Muster Zahler', defaultCategoryId: null }],
    }),
  }),
}));
vi.mock('../pwa/queue-store', () => ({
  readChoices: async () => undefined,
  saveChoices: async () => undefined,
}));

const history: BookingPage = {
  items: [
    {
      id: 'previous724',
      accountId: 'history',
      accountName: 'Giro Verlauf',
      date: '2026-10-01',
      amountCents: 100,
      payeeId: 'known724',
      payeeName: 'Muster Zahler',
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
      splits: [],
      balanceAfterCents: 100,
    },
  ],
  total: 1,
  nextCursor: null,
  sumCents: 100,
};
const clients: QueryClient[] = [];
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    'budget-capture-memory',
    JSON.stringify({ accounts: ['manual'], categories: [] }),
  );
  writes.create.mockReset().mockResolvedValue({ bookings: [], groupId: 'synthetic724' });
  writes.patch.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});
async function setup(state: NonNullable<BookingPanelState>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const dirty = { current: false };
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CaptureForm
          state={state}
          onDone={vi.fn()}
          dirtyRef={dirty}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('option', { name: 'Giro Auswahl' });
  return { user: userEvent.setup(), dirty };
}
async function chooseKnown(user: ReturnType<typeof userEvent.setup>) {
  const payee = screen.getByLabelText('Empfänger', { exact: true });
  await user.type(payee, 'Muster');
  await user.click(await screen.findByRole('option', { name: 'Muster Zahler' }));
}
const account = () => screen.getByLabelText('Bezahlt von', { exact: true }) as HTMLSelectElement;

it.each([
  { mode: 'create' as const, accountId: 'context' },
  { mode: 'create' as const, prefill: { accountId: 'context' } },
])('retains explicit account context through known-payee history: %j', async (state) => {
  vi.spyOn(ledgerApi, 'fetchBookings').mockResolvedValue(history);
  const { user } = await setup(state);
  expect(account().value).toBe('context');
  await chooseKnown(user);
  await act(async () => {
    await Promise.resolve();
  });
  expect(account().value).toBe('context');
  await user.click(screen.getByRole('button', { name: 'Einnahme' }));
  await user.type(screen.getByLabelText('Betrag', { exact: true }), '123,45');
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(writes.create).toHaveBeenCalledTimes(1));
  expect(writes.create.mock.calls[0]![0].input).toMatchObject({
    accountId: 'context',
    amountCents: 12345,
  });
  expect(writes.patch).not.toHaveBeenCalled();
});

it('retains the viewed account instead of applying delayed payee history', async () => {
  let resolve!: (page: BookingPage) => void;
  const reply = new Promise<BookingPage>((done) => {
    resolve = done;
  });
  vi.spyOn(ledgerApi, 'fetchBookings').mockReturnValue(reply);
  const { user } = await setup({ mode: 'create', accountId: 'context' });
  await chooseKnown(user);
  expect(account().value).toBe('context');
  await act(async () => {
    resolve(history);
    await reply;
  });
  expect(account().value).toBe('context');
});

it.each([true, false])(
  'a manual account choice wins over a delayed payee lookup (context=%s)',
  async (hasContext) => {
    let resolve!: (page: BookingPage) => void;
    const reply = new Promise<BookingPage>((done) => {
      resolve = done;
    });
    vi.spyOn(ledgerApi, 'fetchBookings').mockReturnValue(reply);
    const { user } = await setup({
      mode: 'create',
      ...(hasContext ? { accountId: 'context' } : {}),
    });
    await chooseKnown(user);
    await user.selectOptions(account(), 'manual');
    await act(async () => {
      resolve(history);
      await reply;
    });
    expect(account().value).toBe('manual');
    expect(writes.create).not.toHaveBeenCalled();
  },
);

it('retains remembered and known-payee defaults outside an account', async () => {
  vi.spyOn(ledgerApi, 'fetchBookings').mockResolvedValue(history);
  const { user } = await setup({ mode: 'create' });
  expect(account().value).toBe('manual');
  await chooseKnown(user);
  await waitFor(() => expect(account().value).toBe('history'));
  expect(writes.create).not.toHaveBeenCalled();
});

it('offers a separator-capable date keyboard and preserves German date persistence', async () => {
  const { user, dirty } = await setup({ mode: 'create', accountId: 'context' });
  const date = screen.getByRole('textbox', { name: 'Datum' });
  expect(date.getAttribute('inputmode')).not.toBe('numeric');
  expect(date.getAttribute('inputmode')).not.toBe('decimal');
  await user.clear(date);
  await user.type(date, '29.02.2028');
  fireEvent.blur(date);
  expect((date as HTMLInputElement).value).toBe('29.02.2028');
  await user.click(screen.getByRole('button', { name: 'Einnahme' }));
  await user.type(screen.getByLabelText('Betrag', { exact: true }), '12,34');
  expect(dirty.current).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(writes.create).toHaveBeenCalledTimes(1));
  expect(writes.create.mock.calls[0]![0].input).toMatchObject({
    date: '2028-02-29',
    accountId: 'context',
    amountCents: 1234,
  });
});

it('rejects an impossible German date without submitting a booking', async () => {
  const { user } = await setup({ mode: 'create', accountId: 'context' });
  const date = screen.getByRole('textbox', { name: 'Datum' });
  await user.clear(date);
  await user.type(date, '29.02.2027');
  await user.click(screen.getByRole('button', { name: 'Einnahme' }));
  await user.type(screen.getByLabelText('Betrag', { exact: true }), '12,34');
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  expect(date.getAttribute('aria-invalid')).toBe('true');
  expect(writes.create).not.toHaveBeenCalled();
});

it('keeps a focusable native calendar without showPicker and updates the dirty draft', async () => {
  const { user, dirty } = await setup({ mode: 'create', accountId: 'context' });
  await user.type(screen.getByLabelText('Betrag', { exact: true }), '12,34');
  expect(dirty.current).toBe(true);
  const picker = screen.getByLabelText('Datum im Kalender') as HTMLInputElement;
  Object.defineProperty(picker, 'showPicker', { configurable: true, value: undefined });
  expect(picker.type).toBe('date');
  expect(picker.getAttribute('aria-hidden')).not.toBe('true');
  expect(picker.tabIndex).toBeGreaterThanOrEqual(0);
  await user.click(picker);
  expect(document.activeElement).toBe(picker);
  fireEvent.change(picker, { target: { value: '2026-11-03' } });
  expect((screen.getByLabelText('Datum', { exact: true }) as HTMLInputElement).value).toBe(
    '03.11.2026',
  );
  expect(dirty.current).toBe(true);
  expect(writes.create).not.toHaveBeenCalled();
});
