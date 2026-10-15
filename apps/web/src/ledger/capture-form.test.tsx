// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { CaptureForm } from './capture-form';
import * as ledgerApi from './api';

const create = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
vi.mock('../receipts/receipt-section', () => ({ ReceiptSection: () => null }));
vi.mock('./mutations', () => ({
  useLedgerWrites: () => ({ create: { mutateAsync: create }, patch: { mutateAsync: patch } }),
}));
vi.mock('../budget/budget-api', () => ({
  budgetQuery: () => ({ queryKey: ['budget'], queryFn: async () => null }),
}));
vi.mock('./queries', () => ({
  LEDGER_KEY: ['ledger'],
  accountsQuery: () => ({
    queryKey: ['accounts'],
    queryFn: async () => ({
      accounts: [
        { id: 'wallet', name: 'Bargeld Muster', type: 'cash', onBudget: true, closedAt: null },
        { id: 'giro', name: 'Giro Muster', type: 'checking', onBudget: true, closedAt: null },
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
  payeesQuery: () => ({
    queryKey: ['payees'],
    queryFn: async () => ({ payees: [{ id: 'shop', name: 'Laden Beispiel' }] }),
  }),
}));
vi.mock('../pwa/queue-store', () => ({
  readChoices: async () => undefined,
  saveChoices: async () => undefined,
}));
beforeEach(() => {
  create.mockReset();
  patch.mockReset();
  patch.mockResolvedValue({ groupId: 'synthetic-patch' });
  create.mockResolvedValue({ bookings: [], groupId: 'synthetic-group' });
});
it.each(['1.10.2026', '1.10.26', '01.10.', '1.10.'])(
  'saves the short German date %s as ISO through Ctrl+Enter',
  async (text) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T12:00:00+02:00'));
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <CaptureForm
              state={{ mode: 'create', accountId: 'wallet' }}
              onDone={vi.fn()}
              dirtyRef={{ current: false }}
              discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
              requestClose={vi.fn()}
            />
          </ToastProvider>
        </QueryClientProvider>,
      );
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Bargeld Muster' })).toBeTruthy(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Einnahme' }));
      fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
        target: { value: '12,34' },
      });
      const date = screen.getByLabelText('Datum', { exact: true });
      fireEvent.change(date, { target: { value: text } });
      fireEvent.keyDown(date, { key: 'Enter', ctrlKey: true });
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]![0].input).toMatchObject({
        date: '2026-10-01',
        amountCents: 1234,
      });
    } finally {
      vi.useRealTimers();
    }
  },
);

it('places status by account, repeat by date and sharing by category, and opens the native calendar', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'create' }}
          onDone={vi.fn()}
          dirtyRef={{ current: false }}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const status = screen.getByRole('button', { name: 'Vorgemerkt' });
  expect(status.closest('.bk-account-row')?.contains(screen.getByLabelText('Bezahlt von'))).toBe(
    true,
  );
  expect(
    screen
      .getByLabelText('Wiederholen')
      .closest('.bk-date-row')
      ?.contains(screen.getByLabelText('Datum', { exact: true })),
  ).toBe(true);
  const categoryRow = screen
    .getByLabelText('Kategorie', { exact: true })
    .closest('.bk-line-fields')!;
  expect(categoryRow.contains(screen.getByRole('button', { name: 'Teilen ▾' }))).toBe(true);
  expect(screen.queryByLabelText('Auslage für Kontakt')).toBeNull();
  const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
  expect(picker.tabIndex).toBe(-1);
  expect(screen.getByRole('button', { name: 'Kalender öffnen' })).toBeTruthy();
  const show = vi.fn();
  picker.showPicker = show;
  fireEvent.click(screen.getByLabelText('Datum', { exact: true }));
  expect(show).toHaveBeenCalledTimes(1);
  fireEvent.change(picker, { target: { value: '2026-10-02' } });
  expect((screen.getByLabelText('Datum', { exact: true }) as HTMLInputElement).value).toBe(
    '02.10.2026',
  );
});

it('Ctrl+Enter saves from an open category dropdown without taking its highlighted option', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'create', accountId: 'wallet' }}
          onDone={vi.fn()}
          dirtyRef={{ current: false }}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole('option', { name: 'Bargeld Muster' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Einnahme' }));
  fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
    target: { value: '12,34' },
  });
  const category = screen.getByLabelText('Kategorie', { exact: true });
  fireEvent.focus(category);
  fireEvent.change(category, { target: { value: 'Zu' } });
  fireEvent.keyDown(category, { key: 'Enter', ctrlKey: true });
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
});
it('bank capture starts pending, has no Budgetmonat, and saves repetition', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Retain this explicit bank fixture; the generic query mock returns a cash account.
  client.setQueryDefaults(['accounts'], { staleTime: Infinity });
  client.setQueryData(['accounts'], {
    accounts: [
      { id: 'wallet', name: 'Giro Muster', type: 'checking', onBudget: true, closedAt: null },
    ],
  });
  const done = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'create', accountId: 'wallet' }}
          onDone={done}
          dirtyRef={{ current: false }}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Vorgemerkt' }).getAttribute('aria-pressed')).toBe(
      'false',
    ),
  );
  const status = screen.getByRole('button', { name: 'Vorgemerkt' });
  expect(status.textContent).toBe('');
  expect(status.getAttribute('title')).toBe('Vorgemerkt');
  await user.click(status);
  expect(screen.getByRole('button', { name: 'Bestätigt' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  await user.click(status);
  expect(status.getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByLabelText('Budgetmonat')).toBeNull();
  expect(document.querySelector('.bk-head .kcleared')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Einnahme' }));
  expect(screen.queryByLabelText('Budgetmonat')).toBeNull();
  fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
    target: { value: '12,34' },
  });
  await user.click(screen.getByText('Mehr', { exact: true }));
  await user.selectOptions(screen.getByLabelText('Wiederholen'), 'weekly');
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0]![0].input).toMatchObject({
    amountCents: 1234,
    accountId: 'wallet',
    status: 'pending',
    incomeNextMonth: false,
    repeat: 'weekly',
  });
  expect(done).toHaveBeenCalledTimes(1);
});

it('cash capture is immediately confirmed without a pending toggle', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['accounts'], {
    accounts: [
      { id: 'wallet', name: 'Bargeld Muster', type: 'cash', onBudget: true, closedAt: null },
    ],
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'create', accountId: 'wallet' }}
          onDone={vi.fn()}
          dirtyRef={{ current: false }}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const status = await screen.findByRole('button', { name: 'Bestätigt' });
  expect((status as HTMLButtonElement).disabled).toBe(true);
  expect(status.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Einnahme' }));
  fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
    target: { value: '12,34' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0]![0].input).toMatchObject({
    accountId: 'wallet',
    amountCents: 1234,
    status: 'confirmed',
  });
});

it('shows note and category lines outside Mehr and accepts direct dates without calculator keys', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T12:00:00+02:00'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'create' }}
          onDone={vi.fn()}
          dirtyRef={{ current: false }}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  try {
    const user = userEvent.setup();
    const more = screen.getByText('Mehr', { exact: true }).closest('details')!;
    expect(more.open).toBe(false);
    expect(more.contains(screen.getByLabelText('Wiederholen'))).toBe(false);
    expect(more.contains(screen.getByLabelText('Notiz'))).toBe(false);
    expect(screen.getByLabelText('Notiz').tagName).toBe('TEXTAREA');
    expect(
      more.contains(screen.getByRole('button', { name: '+ Weitere Kategorie', hidden: true })),
    ).toBe(false);
    expect(container.querySelector('.amount-ops')).toBeNull();
    expect(screen.getByText(/Rechnen im Feld möglich: 12,50\+3/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '4.10.' } });
    fireEvent.blur(screen.getByLabelText('Datum'));
    expect((screen.getByLabelText('Datum') as HTMLInputElement).value).toBe('04.10.2026');
    expect(screen.queryByRole('button', { name: 'Gestern' })).toBeNull();
    await user.click(screen.getByText('Mehr', { exact: true }));
    await user.selectOptions(screen.getByLabelText('Wiederholen'), 'monthly');
    await user.type(screen.getByLabelText('Notiz'), 'Muster');
    expect(more.querySelector('summary')?.textContent).not.toContain('Notiz');
    await user.click(screen.getByText('Mehr', { exact: true }));
    await user.click(screen.getByRole('button', { name: '+ Weitere Kategorie' }));
    expect(more.contains(screen.getByRole('group', { name: 'Zeile 1' }))).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps a manual account choice when the same payee is left again', async () => {
  const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockResolvedValue({
    items: [
      {
        id: 'synthetic-booking',
        accountId: 'wallet',
        accountName: 'Bargeld Muster',
        date: '2026-10-01',
        amountCents: -100,
        payeeId: 'shop',
        payeeName: 'Laden Beispiel',
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
        balanceAfterCents: -100,
      },
    ],
    total: 1,
    nextCursor: null,
    sumCents: -100,
  });
  try {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CaptureForm
            state={{ mode: 'create', accountId: 'giro' }}
            onDone={vi.fn()}
            dirtyRef={{ current: false }}
            discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
            requestClose={vi.fn()}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Giro Muster' })).toBeTruthy());
    await user.type(screen.getByLabelText('Empfänger'), 'Laden Bei{Enter}');
    const account = screen.getByLabelText('Bezahlt von') as HTMLSelectElement;
    await waitFor(() => expect(account.value).toBe('wallet'));
    await user.selectOptions(account, 'giro');
    await user.click(screen.getByLabelText('Empfänger'));
    await user.click(screen.getByLabelText('Betrag', { exact: true }));
    expect(account.value).toBe('giro');
  } finally {
    lookup.mockRestore();
  }
});

it('ignores a delayed account suggestion after a manual account selection', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof ledgerApi.fetchBookings>>) => void;
  const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  try {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CaptureForm
            state={{ mode: 'create', accountId: 'giro' }}
            onDone={vi.fn()}
            dirtyRef={{ current: false }}
            discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
            requestClose={vi.fn()}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Giro Muster' })).toBeTruthy());
    await user.type(screen.getByLabelText('Empfänger'), 'Laden Bei{Enter}');
    const account = screen.getByLabelText('Bezahlt von') as HTMLSelectElement;
    await user.selectOptions(account, 'wallet');
    resolve({ items: [], total: 0, nextCursor: null, sumCents: 0 });
    await user.click(screen.getByLabelText('Betrag', { exact: true }));
    expect(account.value).toBe('wallet');
  } finally {
    lookup.mockRestore();
  }
});

it.each(['confirmed', 'reconciled'] as const)(
  'edits an unchanged payee without creating it again while the payee cache is stale (%s)',
  async (status) => {
    const createPayee = vi
      .spyOn(ledgerApi, 'createPayee')
      .mockRejectedValue(new Error('duplicate synthetic payee'));
    const done = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <CaptureForm
              state={{
                mode: 'edit',
                booking: {
                  id: 'booking-stale',
                  accountId: 'wallet',
                  accountName: 'Bargeld Muster',
                  date: '2026-10-01',
                  amountCents: -12000,
                  payeeId: 'payee-new',
                  payeeName: 'Empfänger Beispiel Neu',
                  memo: null,
                  status,
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
                      id: 'split-existing',
                      categoryId: 'category-existing',
                      categoryName: 'Kategorie Muster',
                      amountCents: -12000,
                      contactId: null,
                      incomeTypeId: null,
                      memo: 'Zeilennotiz Muster',
                      transferId: null,
                    },
                  ],
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
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Bargeld Muster' })).toBeTruthy(),
      );
      fireEvent.change(screen.getByLabelText('Notiz'), { target: { value: 'Notiz geändert' } });
      fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
      expect(createPayee).not.toHaveBeenCalled();
      expect(patch.mock.calls[0]![0]).toMatchObject({
        id: 'booking-stale',
        patch: { memo: 'Notiz geändert' },
      });
      expect(patch.mock.calls[0]![0].patch.splits).toBeUndefined();
    } finally {
      createPayee.mockRestore();
    }
  },
);

it('treats contact-sharing input as dirty before the gross amount is entered', async () => {
  const dirty = { current: false };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'create' }}
          onDone={vi.fn()}
          dirtyRef={dirty}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  expect(dirty.current).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Teilen ▾' }));
  await waitFor(() => expect(dirty.current).toBe(true));
});
