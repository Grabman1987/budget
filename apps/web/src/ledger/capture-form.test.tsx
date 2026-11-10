// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { CaptureForm } from './capture-form';
import * as ledgerApi from './api';
import type * as Http from '../api/http';
import type * as ReceiptModule from '../receipts/receipt-section';

// jsdom has no native media query implementation.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: flags.phone && query === '(max-width: 767px)',
    addEventListener() {},
    removeEventListener() {},
  }),
});
const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false, phone: false }));
vi.mock('../shell/redesign-flag', () => flags);

const create = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../api/http', async (original) => ({
  ...(await original<typeof Http>()),
  request: http.request,
}));
// The real section uploads to the inbox; here a button stands in for one acknowledged upload.
vi.mock('../receipts/receipt-section', async (original) => ({
  ...(await original<typeof ReceiptModule>()),
  ReceiptSection: ({
    onAttached,
  }: {
    onAttached?: (file: { id: string; name: string; sizeBytes: number }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onAttached?.({ id: 'receipt-1', name: 'beleg.pdf', sizeBytes: 2048 })}
    >
      Datei anhängen
    </button>
  ),
}));
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  flags.REDESIGN_ENABLED = false;
  flags.phone = false;
  create.mockReset();
  patch.mockReset();
  http.request.mockReset();
  http.request.mockResolvedValue({ groupId: 'synthetic-receipt' });
  patch.mockResolvedValue({ groupId: 'synthetic-patch' });
  create.mockResolvedValue({ bookings: [], groupId: 'synthetic-group' });
});

it('shifts mobile keypad digits into cents and retains paste, validation and save semantics', async () => {
  flags.REDESIGN_ENABLED = true;
  flags.phone = true;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
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
  await screen.findByRole('option', { name: 'Bargeld Muster' });
  const amount = screen.getByLabelText('Betrag', { exact: true }) as HTMLInputElement;
  const user = userEvent.setup();
  await user.click(amount);
  for (const [digit, expected] of [
    ['1', '0,01'],
    ['2', '0,12'],
    ['3', '1,23'],
    ['4', '12,34'],
  ]) {
    await user.keyboard(digit!);
    expect(amount.value).toBe(expected);
  }
  await user.keyboard('{Backspace}');
  expect(amount.value).toBe('1,23');
  // Operator taps reuse the shared parser, keep the caret and do not shift expression digits.
  for (const [operator, operand, expected] of [
    ['Plus', '2,77', '4,00'],
    ['Minus', '1', '3,00'],
    ['Mal', '2', '6,00'],
    ['Geteilt durch', '4', '1,50'],
  ]) {
    await user.click(screen.getByRole('button', { name: operator! }));
    expect(document.activeElement).toBe(amount);
    await user.keyboard(operand!);
    await user.tab();
    expect(amount.value).toBe(expected);
    await user.click(amount);
  }
  await user.click(screen.getByRole('button', { name: 'Geteilt durch' }));
  await user.keyboard('0');
  expect(amount.getAttribute('aria-invalid')).toBe('true');
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  expect(create).not.toHaveBeenCalled();
  await user.clear(amount);
  await user.paste('12,50+3');
  await user.keyboard(',25');
  await user.tab();
  expect(amount.value).toBe('15,75');
  // Native replacement may focus before selecting; focus must leave that operation alone.
  amount.setSelectionRange(0, 0);
  act(() => amount.focus());
  expect(amount.selectionStart).toBe(0);
  fireEvent.pointerUp(amount);
  expect(amount.selectionStart).toBe(5);
  await user.tab();
  // Replacing a selected amount after refocus must not append to the existing cents.
  amount.setSelectionRange(0, amount.value.length);
  act(() => amount.focus());
  expect(amount.selectionStart).toBe(0);
  expect(amount.selectionEnd).toBe(5);
  fireEvent.pointerUp(amount);
  expect(amount.selectionStart).toBe(0);
  expect(amount.selectionEnd).toBe(5);
  await user.paste('12,34');
  expect(amount.value).toBe('12,34');
  await user.clear(amount);
  expect(amount.getAttribute('aria-invalid')).toBe('false');
  expect(screen.getByText('Jede Zeile braucht einen Betrag.')).toBeTruthy();
  await user.click(amount);
  await user.keyboard('1234');
  await user.click(screen.getByRole('button', { name: 'Einnahme' }));
  await user.click(screen.getByRole('button', { name: 'Buchung speichern' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0]![0].input.amountCents).toBe(1234);
});

it('explains the disabled phone save on open and retains save-and-new', async () => {
  flags.REDESIGN_ENABLED = true;
  flags.phone = true;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
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
  await screen.findByRole('option', { name: 'Giro Muster' });
  const amount = screen.getByLabelText('Betrag', { exact: true });
  expect(amount.getAttribute('inputmode')).toBe('decimal');
  expect(screen.getByText('Jede Zeile braucht einen Betrag.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.queryByRole('button', { name: 'Fertig' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Abbrechen' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Schließen' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Markierung/ })).toBeNull();
  expect(screen.queryByLabelText('Markierung')).toBeNull();
  expect(screen.getByRole('button', { name: 'Speichern' }).closest('.bk-body')).toBeTruthy();
  expect(screen.getByText('Jede Zeile braucht einen Betrag.').className).toBe('bk-save-hint');
  expect(screen.getByRole('button', { name: 'Speichern' }).getAttribute('aria-describedby')).toBe(
    'booking-save-reason',
  );
  fireEvent.blur(amount);
  expect(screen.getByText('Jede Zeile braucht einen Betrag.')).toBeTruthy();
  fireEvent.change(amount, { target: { value: '12,34' } });
  expect(screen.getByText('Jede Zeile einer Ausgabe braucht eine Kategorie.').className).toBe(
    'bk-save-hint',
  );
  fireEvent.keyDown(amount, { key: 'Enter', ctrlKey: true });
  expect(screen.getByText('Jede Zeile einer Ausgabe braucht eine Kategorie.').className).toBe(
    'bk-save-reason',
  );
  expect(create).not.toHaveBeenCalled();
  fireEvent.change(amount, { target: { value: '12,34' } });
  expect(screen.queryByText('Jede Zeile braucht einen Betrag.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Einnahme' }));
  fireEvent.click(screen.getByRole('button', { name: 'Speichern und neu' }));
  await waitFor(() => expect((amount as HTMLInputElement).value).toBe(''));
  expect(create).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Jede Zeile braucht einen Betrag.')).toBeTruthy();
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

it('places status by account, repeat by date and sharing by category, and exposes the native calendar', async () => {
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
  expect(screen.queryByText('Jede Zeile braucht einen Betrag.')).toBeNull();
  expect((screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement).disabled).toBe(
    true,
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
  expect(categoryRow.contains(screen.getByRole('button', { name: 'Teilen' }))).toBe(true);
  expect(screen.queryByLabelText('Auslage für Kontakt')).toBeNull();
  const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
  expect(picker.tabIndex).toBe(0);
  expect(screen.getByLabelText('Datum im Kalender')).toBe(picker);
  expect(picker.getAttribute('aria-hidden')).not.toBe('true');
  expect(picker.title).toBe('Kalender öffnen');
  await userEvent.setup().click(screen.getByLabelText('Datum', { exact: true }));
  expect(document.activeElement).toBe(screen.getByLabelText('Datum', { exact: true }));
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
it.each([false, true])(
  'bank capture retains pending, repetition and source semantics with redesign %s (#841)',
  async (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
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
    expect(status.textContent).toBe('Vorgemerkt');
    expect(
      screen
        .getByRole('button', { name: 'Schließen' })
        .querySelector('svg')
        ?.getAttribute('stroke-width'),
    ).toBe('1.75');
    expect(document.querySelector('[data-redesign="booking-editor"]') !== null).toBe(enabled);
    expect(status.querySelector('.booking-status-pending') !== null).toBe(enabled);
    expect(status.getAttribute('title')).toBe('Vorgemerkt');
    expect(status.closest('.bk-amount-primary') !== null).toBe(enabled);
    expect(screen.queryByRole('heading', { name: 'Buchung erfassen' }) !== null).toBe(enabled);
    expect(screen.queryByRole('button', { name: 'Kontakt hinzufügen' }) !== null).toBe(enabled);
    if (enabled) {
      const addContact = screen.getByRole('button', { name: 'Kontakt hinzufügen' });
      expect(addContact.closest('.bk-col-memo')).toBeTruthy();
      await user.click(addContact);
      expect(screen.getAllByText(/^Rest:/)).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'Kontaktanteil 1.1 entfernen' }));
    }
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
  },
);

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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // "Mehr" only exists while there is a project to pick (the flag entry is retired).
  client.setQueryData(['lookups'], {
    categories: [],
    groups: [],
    contacts: [],
    incomeTypes: [],
    projects: [{ id: 'project-muster', name: 'Projekt Muster', archivedAt: null }],
  });
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
  const previousMemory = localStorage.getItem('budget-capture-memory');
  localStorage.setItem(
    'budget-capture-memory',
    JSON.stringify({ accounts: ['giro'], categories: [] }),
  );
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
            state={{ mode: 'create' }}
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
    if (previousMemory === null) localStorage.removeItem('budget-capture-memory');
    else localStorage.setItem('budget-capture-memory', previousMemory);
  }
});

it('ignores a delayed account suggestion after a manual account selection', async () => {
  const previousMemory = localStorage.getItem('budget-capture-memory');
  localStorage.setItem(
    'budget-capture-memory',
    JSON.stringify({ accounts: ['giro'], categories: [] }),
  );
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
            state={{ mode: 'create' }}
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
    if (previousMemory === null) localStorage.removeItem('budget-capture-memory');
    else localStorage.setItem('budget-capture-memory', previousMemory);
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
  fireEvent.click(screen.getByRole('button', { name: 'Teilen' }));
  await waitFor(() => expect(dirty.current).toBe(true));
});

function renderPayeeSuggestions(phone: boolean) {
  flags.REDESIGN_ENABLED = true;
  flags.phone = phone;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['lookups'], {
    categories: [
      { id: 'food', name: 'Essen Muster', kind: 'expense', sortOrder: 0 },
      { id: 'other', name: 'Freizeit Muster', kind: 'expense', sortOrder: 1 },
    ],
    groups: [],
    contacts: [],
    incomeTypes: [],
    projects: [],
  });
  client.setQueryData(['payees'], {
    payees: [
      { id: 'shop', name: 'Laden Beispiel', defaultCategoryId: null },
      { id: 'other-shop', name: 'Anderer Musterladen', defaultCategoryId: 'other' },
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
}
const payeeHistory: Awaited<ReturnType<typeof ledgerApi.fetchBookings>> = {
  items: [
    {
      id: 'history-synthetic',
      accountId: 'giro',
      accountName: 'Giro Muster',
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
      balanceAfterCents: -100,
      splits: [
        {
          id: 'history-split',
          categoryId: 'food',
          categoryName: 'Essen Muster',
          amountCents: -100,
          memo: null,
          contactId: null,
          incomeTypeId: null,
          transferId: null,
        },
      ],
    },
  ],
  total: 1,
  nextCursor: null,
  sumCents: -100,
};
it.each([false, true])(
  'suggests the latest payee category and preserves an explicit same-category choice (phone: %s)',
  async (phone) => {
    const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockResolvedValue(payeeHistory);
    try {
      renderPayeeSuggestions(phone);
      const user = userEvent.setup();
      const payee = screen.getByLabelText('Empfänger');
      const category = screen.getByRole('combobox', {
        name: 'Kategorie',
      }) as HTMLInputElement;
      await user.type(payee, 'Laden Bei');
      expect(category.value).toBe('');
      await user.click(screen.getByRole('option', { name: 'Laden Beispiel' }));
      await waitFor(() => expect(category.value).toBe('Essen Muster'));
      // Account context stays authoritative even though category history is now read.
      expect((screen.getByLabelText('Konto', { exact: true }) as HTMLSelectElement).value).toBe(
        'wallet',
      );
      await user.click(category);
      await user.click(screen.getByRole('option', { name: 'Essen Muster' }));
      await user.clear(payee);
      await user.type(payee, 'Anderer');
      await user.keyboard('{Enter}');
      expect(category.value).toBe('Essen Muster');
      await user.click(category);
      await user.click(screen.getByRole('option', { name: 'Freizeit Muster' }));
      expect(category.value).toBe('Freizeit Muster');
      expect(create).not.toHaveBeenCalled();
    } finally {
      lookup.mockRestore();
    }
  },
);
it.each(['manual category', 'different payee', 'kind'])(
  'ignores delayed category history after %s changes',
  async (change) => {
    let resolve!: (page: typeof payeeHistory) => void;
    const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    try {
      renderPayeeSuggestions(false);
      const user = userEvent.setup();
      const payee = screen.getByLabelText('Empfänger');
      const category = screen.getByRole('combobox', {
        name: 'Kategorie',
      }) as HTMLInputElement;
      await user.type(payee, 'Laden Bei{Enter}');
      if (change === 'manual category') {
        await user.click(category);
        await user.click(screen.getByRole('option', { name: 'Freizeit Muster' }));
      } else if (change === 'different payee') {
        await user.clear(payee);
        await user.type(payee, 'Anderer{Enter}');
      } else {
        await user.click(screen.getByRole('button', { name: 'Einnahme' }));
      }
      await act(async () => resolve(payeeHistory));
      expect(category.value).toBe(change === 'kind' ? 'Zu verteilen' : 'Freizeit Muster');
      expect(create).not.toHaveBeenCalled();
    } finally {
      lookup.mockRestore();
    }
  },
);

it('continues past ambiguous recent bookings to the latest usable category', async () => {
  const lookup = vi
    .spyOn(ledgerApi, 'fetchBookings')
    .mockResolvedValueOnce({
      ...payeeHistory,
      items: [{ ...payeeHistory.items[0]!, splits: [] }],
      nextCursor: 'older',
    })
    .mockResolvedValueOnce(payeeHistory);
  try {
    renderPayeeSuggestions(false);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Empfänger'), 'Laden Bei{Enter}');
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Kategorie' }) as HTMLInputElement).value).toBe(
        'Essen Muster',
      ),
    );
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup.mock.calls[1]?.[1]).toBe('older');
    expect(create).not.toHaveBeenCalled();
  } finally {
    lookup.mockRestore();
  }
});

function renderCreate(redesign = true) {
  flags.REDESIGN_ENABLED = redesign;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
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
}

it.each([false, true])(
  'has no flag picker, Markierung entry or empty "…" (redesign: %s)',
  async (on) => {
    renderCreate(on);
    await screen.findByRole('option', { name: 'Bargeld Muster' });
    expect(screen.queryByTitle('Markieren')).toBeNull();
    expect(screen.queryByLabelText('Markierung')).toBeNull();
    expect(document.querySelector('.kmore')).toBeNull();
  },
);

it('keeps the stored flag of an edited booking untouched on save', async () => {
  flags.REDESIGN_ENABLED = true;
  const done = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <CaptureForm
          state={{
            mode: 'edit',
            booking: {
              id: 'booking-flagged',
              accountId: 'wallet',
              accountName: 'Bargeld Muster',
              date: '2026-10-01',
              amountCents: -1000,
              payeeId: null,
              payeeName: null,
              memo: null,
              status: 'confirmed',
              flag: 'red',
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
                  id: 'split-flagged',
                  categoryId: 'category-existing',
                  categoryName: 'Kategorie Muster',
                  amountCents: -1000,
                  contactId: null,
                  incomeTypeId: null,
                  memo: null,
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
  await screen.findByRole('option', { name: 'Bargeld Muster' });
  fireEvent.change(screen.getByLabelText('Notiz'), { target: { value: 'Notiz neu' } });
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(patch.mock.calls[0]![0].patch).not.toHaveProperty('flag');
});

it('shows an attached receipt once, links it to the saved booking and clears it for save-and-new', async () => {
  create.mockResolvedValue({ bookings: [{ id: 'booking-new' }], groupId: 'g' });
  renderCreate();
  await screen.findByRole('option', { name: 'Bargeld Muster' });
  fireEvent.click(screen.getByRole('button', { name: 'Einnahme' }));
  fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
    target: { value: '12,34' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Datei anhängen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Datei anhängen' }));
  expect(screen.getAllByTestId('attached-receipt')).toHaveLength(1);
  expect(screen.getByText('beleg.pdf')).toBeTruthy();
  expect(http.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Speichern und neu' }));
  await waitFor(() => expect(screen.queryByTestId('attached-receipt')).toBeNull());
  expect(http.request).toHaveBeenCalledTimes(1);
  expect(http.request).toHaveBeenCalledWith('POST', '/api/receipts/receipt-1/links', {
    bookingId: 'booking-new',
  });
});

it('discards a removed attachment and links nothing; cancelling leaves the rest in Prüfen with a toast', async () => {
  const first = renderCreate();
  await screen.findByRole('option', { name: 'Bargeld Muster' });
  fireEvent.click(screen.getByRole('button', { name: 'Datei anhängen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Beleg beleg.pdf entfernen' }));
  await waitFor(() => expect(screen.queryByTestId('attached-receipt')).toBeNull());
  expect(http.request).toHaveBeenCalledWith('DELETE', '/api/receipts/receipt-1');
  expect(await screen.findByText('Beleg verworfen.')).toBeTruthy();
  first.unmount();
  const second = renderCreate();
  await screen.findByRole('option', { name: 'Bargeld Muster' });
  fireEvent.click(screen.getByRole('button', { name: 'Datei anhängen' }));
  second.unmount();
  expect(http.request).toHaveBeenCalledTimes(1);
});
