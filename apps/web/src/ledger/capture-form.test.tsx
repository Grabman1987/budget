// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { CaptureForm } from './capture-form';
import * as ledgerApi from './api';
import type * as Http from '../api/http';
import * as ledgerHttp from '../api/http';
import type * as ReceiptModule from '../receipts/receipt-section';
import type { ListedBooking } from './types';
import type { BookingDraft } from './booking-model';

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
const lateScope = vi.hoisted(() => ({ value: 0 }));
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
    onBusyChange,
    scope = 0,
  }: {
    onAttached?: (file: { id: string; name: string; sizeBytes: number }, scope: number) => void;
    onBusyChange?: (busy: boolean) => void;
    scope?: number;
  }) => (
    <>
      <button
        type="button"
        onClick={() => onAttached?.({ id: 'receipt-1', name: 'beleg.pdf', sizeBytes: 2048 }, scope)}
      >
        Datei anhängen
      </button>
      <button
        type="button"
        onClick={() => {
          lateScope.value = scope;
          onBusyChange?.(true);
        }}
      >
        Upload starten
      </button>
      <button type="button" onClick={() => onBusyChange?.(false)}>
        Upload beenden
      </button>
      <button
        type="button"
        onClick={() =>
          onAttached?.({ id: 'receipt-late', name: 'spaet.pdf', sizeBytes: 1024 }, lateScope.value)
        }
      >
        Spätes Ergebnis
      </button>
    </>
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

it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
] as const)(
  'uses explicit confirmation for a reconciled edit (phone: %s, opening release: %s)',
  async (phone, initialUnlockReconciled) => {
    flags.REDESIGN_ENABLED = true;
    flags.phone = phone;
    const booking: ListedBooking = {
      id: 'synthetic-checked',
      accountId: 'giro',
      accountName: 'Giro Muster',
      date: '2026-10-01',
      amountCents: -1000,
      status: 'reconciled',
      payeeId: null,
      payeeName: null,
      memo: null,
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
          amountCents: -1000,
          contactId: null,
          incomeTypeId: null,
          memo: null,
          transferId: null,
        },
      ],
    };
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <CaptureForm
            state={{ mode: 'edit', booking }}
            initialUnlockReconciled={initialUnlockReconciled}
            onDone={vi.fn()}
            dirtyRef={{ current: false }}
            requestClose={vi.fn()}
            discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole('option', { name: 'Giro Muster' });
    const user = userEvent.setup();
    const release = screen.getByLabelText('Trotzdem ändern') as HTMLInputElement;
    expect(release.checked).toBe(initialUnlockReconciled);
    expect(patch).not.toHaveBeenCalled();
    if (!initialUnlockReconciled) {
      fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
        target: { value: '15,00' },
      });
      if (phone) {
        const save = screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement;
        expect(save.disabled).toBe(true);
        expect(save.getAttribute('aria-describedby')).toBe('booking-save-reason');
        expect(document.getElementById('booking-save-reason')?.textContent).toContain('geprüft');
      }
      await user.click(release);
      expect(release.checked).toBe(false);
      const body = document.querySelector<HTMLElement>('.bk-body')!;
      expect(body.inert).toBe(true);
      expect(screen.getByRole('alertdialog').textContent).toContain('geprüften Kontostand');
      expect(document.activeElement).toBe(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Abbrechen' }),
      );
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(body.inert).toBe(false);
      expect(document.activeElement).toBe(release);
      expect(release.checked).toBe(false);
      expect(patch).not.toHaveBeenCalled();
      await user.click(release);
      await user.tab();
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Bearbeitung freigeben' }),
      );
      await user.keyboard('{Enter}');
      expect(release.checked).toBe(true);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(patch).not.toHaveBeenCalled();
    }
    fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
      target: { value: '15,00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]![0]).toMatchObject({
      id: booking.id,
      patch: { amountCents: -1500, unlockReconciled: true },
    });
  },
);

it('asks once for an Auslage allocated by a repayment, then retries with the confirmed flag (#1108)', async () => {
  flags.REDESIGN_ENABLED = true;
  const booking = {
    id: 'synthetic-linked',
    accountId: 'giro',
    accountName: 'Giro Muster',
    date: '2026-10-01',
    amountCents: -1000,
    status: 'confirmed',
    payeeId: null,
    payeeName: null,
    memo: null,
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
        id: 'synthetic-linked-split',
        categoryId: null,
        categoryName: null,
        amountCents: -1000,
        contactId: null,
        incomeTypeId: null,
        memo: null,
        transferId: null,
      },
    ],
  } as ListedBooking;
  patch.mockRejectedValueOnce(
    new ledgerHttp.ApiError(422, 'contact_linked', 'Synthetic', [], [], undefined, ['2026-10-02']),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'edit', booking }}
          onDone={vi.fn()}
          dirtyRef={{ current: false }}
          requestClose={vi.fn()}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('option', { name: 'Giro Muster' });
  fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
    target: { value: '4,00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog.textContent).toContain('02.10.2026');
  expect(dialog.textContent).toContain('Guthaben');
  expect(patch).toHaveBeenCalledTimes(1);
  expect(patch.mock.calls[0]![0].patch.unlockContactLinked).toBeUndefined();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Bearbeitung bestätigen' }));
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
  expect(patch.mock.calls[1]![0].patch).toMatchObject({
    amountCents: -400,
    unlockContactLinked: true,
  });
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
  expect(screen.queryByText('Jede Zeile braucht einen Betrag.')).toBeNull();
  await user.click(amount);
  await user.keyboard('1234');
  await user.click(screen.getByRole('button', { name: 'Einnahme' }));
  await user.click(screen.getByRole('button', { name: 'Buchung speichern' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0]![0].input.amountCents).toBe(1234);
});

it('shows phone validation only after a save attempt and resets it after save-and-new', async () => {
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
  expect(screen.queryByText('Jede Zeile braucht einen Betrag.')).toBeNull();
  expect((screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.queryByRole('button', { name: 'Fertig' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Abbrechen' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Schließen' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Markierung/ })).toBeNull();
  expect(screen.queryByLabelText('Markierung')).toBeNull();
  // The phone actions are pinned below the scrolling body (#1146), not part of it.
  expect(
    screen.getByRole('button', { name: 'Speichern' }).closest('.bk-form-actions'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Speichern' }).closest('.bk-body')).toBeNull();
  expect(screen.getByRole('button', { name: 'Speichern' }).getAttribute('aria-describedby')).toBe(
    null,
  );
  fireEvent.blur(amount);
  expect(screen.queryByText('Jede Zeile braucht einen Betrag.')).toBeNull();
  fireEvent.change(amount, { target: { value: '12,34' } });
  expect(screen.queryByText('Jede Zeile einer Ausgabe braucht eine Kategorie.')).toBeNull();
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
  expect(screen.queryByText('Jede Zeile braucht einen Betrag.')).toBeNull();
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

it('Ctrl+Enter blocks an unmatched income category until its full label is selected', async () => {
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
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Einnahme' }));
  await user.type(screen.getByLabelText('Betrag', { exact: true }), '12,34');
  const category = screen.getByLabelText<HTMLInputElement>('Kategorie', { exact: true });
  await user.click(category);
  await user.paste('Zu');
  expect(document.activeElement).toBe(category);
  await user.keyboard('{Control>}{Enter}{/Control}');
  expect(create).not.toHaveBeenCalled();
  expect(category.value).toBe('Zu');
  expect(category.getAttribute('aria-invalid')).toBe('true');
  await user.clear(category);
  await user.type(category, 'Zu verteilen');
  await user.keyboard('{Control>}{Enter}{/Control}');
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(category.value).toBe('Zu verteilen');
  expect(create.mock.lastCall?.[0].input).toMatchObject({
    amountCents: 1234,
    splits: [{ categoryId: null, amountCents: 1234 }],
  });
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

function renderPayeeSuggestions(
  phone: boolean,
  accountContext = true,
  prefill?: Partial<BookingDraft>,
) {
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
          state={{
            mode: 'create',
            ...(accountContext ? { accountId: 'wallet' } : {}),
            ...(prefill ? { prefill } : {}),
          }}
          onDone={vi.fn()}
          dirtyRef={{ current: false }}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return client;
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
  'keeps typed, clicked and keyboard category labels equal to saved categories after save-and-new (phone: %s)',
  async (phone) => {
    renderPayeeSuggestions(phone);
    const user = userEvent.setup();
    const category = () => screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' });
    const amount = () => screen.getByLabelText('Betrag', { exact: true });
    expect(screen.queryByText('Jede Zeile einer Ausgabe braucht eine Kategorie.')).toBeNull();
    await user.type(amount(), '10,00');
    expect(screen.queryByText('Jede Zeile einer Ausgabe braucht eine Kategorie.')).toBeNull();
    for (const method of ['typed', 'clicked', 'keyboard']) {
      await user.click(category());
      await user.clear(category());
      await user.type(category(), 'Freizeit Muster');
      if (method === 'clicked')
        await user.click(screen.getByRole('option', { name: 'Freizeit Muster' }));
      else if (method === 'keyboard') await user.keyboard('{Enter}');
      else await user.tab();
      expect(category().value).toBe('Freizeit Muster');
      await user.clear(amount());
      await user.type(amount(), '10,00');
      await user.click(screen.getByRole('button', { name: 'Speichern und neu' }));
      await waitFor(() =>
        expect(create).toHaveBeenCalledTimes(['typed', 'clicked', 'keyboard'].indexOf(method) + 1),
      );
      expect(create.mock.lastCall?.[0].input.splits[0].categoryId).toBe('other');
    }
    await user.click(category());
    await user.clear(category());
    await user.click(amount());
    expect(category().value).toBe('');
    await user.type(category(), 'Unbekannte Kategorie');
    await user.click(amount());
    expect(category().value).toBe('Unbekannte Kategorie');
    expect(category().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Bitte eine Kategorie aus der Liste wählen.')).toBeTruthy();
    fireEvent.keyDown(category(), { key: 'Enter', ctrlKey: true });
    expect(create).toHaveBeenCalledTimes(3);
  },
);

it('clears carried defaults for a new payee after save-and-new and preserves new manual choices', async () => {
  const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockResolvedValue(payeeHistory);
  try {
    renderPayeeSuggestions(false, false);
    const user = userEvent.setup();
    const payee = screen.getByLabelText('Empfänger');
    const category = () => screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' });
    const account = screen.getByLabelText('Konto', { exact: true }) as HTMLSelectElement;
    await user.type(payee, 'Laden Bei{Enter}');
    await waitFor(() => expect(category().value).toBe('Essen Muster'));
    expect(account.value).toBe('giro');
    await user.type(screen.getByLabelText('Betrag', { exact: true }), '10,00');
    await user.click(screen.getByRole('button', { name: 'Speichern und neu' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await user.clear(payee);
    await user.type(payee, 'Neuer Musterladen');
    await user.tab();
    await waitFor(() => expect(category().value).toBe(''));
    expect(account.value).toBe('');
    await user.selectOptions(account, 'wallet');
    await user.click(category());
    await user.click(screen.getByRole('option', { name: 'Freizeit Muster' }));
    await user.clear(payee);
    await user.type(payee, 'Laden Bei{Enter}');
    await user.tab();
    expect(account.value).toBe('wallet');
    expect(category().value).toBe('Freizeit Muster');
  } finally {
    lookup.mockRestore();
  }
});
it('clears automatic values together while history is pending and when the payee is removed', async () => {
  let resolve!: (page: typeof payeeHistory) => void;
  const lookup = vi
    .spyOn(ledgerApi, 'fetchBookings')
    .mockResolvedValueOnce(payeeHistory)
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
  try {
    renderPayeeSuggestions(false, false);
    const user = userEvent.setup();
    const payee = screen.getByLabelText('Empfänger');
    const account = screen.getByLabelText('Konto', { exact: true }) as HTMLSelectElement;
    await user.type(payee, 'Laden Bei{Enter}');
    await waitFor(() => expect(account.value).toBe('giro'));
    await user.clear(payee);
    await user.type(payee, 'Anderer{Enter}');
    expect(account.value).toBe('');
    expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' }).value).toBe('');
    await user.type(screen.getByLabelText('Betrag', { exact: true }), '10,00');
    fireEvent.keyDown(payee, { key: 'Enter', ctrlKey: true });
    expect(create).not.toHaveBeenCalled();
    await act(async () => resolve(payeeHistory));
    expect(account.value).toBe('giro');
    await user.clear(payee);
    await user.tab();
    expect(account.value).toBe('');
    expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' }).value).toBe('');
  } finally {
    lookup.mockRestore();
  }
});
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
it.each(['manual category', 'typed category', 'different payee', 'kind'])(
  'ignores delayed category history after %s changes',
  async (change) => {
    let resolve!: (page: typeof payeeHistory) => void;
    const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockImplementation((filter) =>
      filter.payeeId === 'other-shop'
        ? Promise.resolve({
            ...payeeHistory,
            items: [
              {
                ...payeeHistory.items[0]!,
                splits: [{ ...payeeHistory.items[0]!.splits[0]!, categoryId: 'other' }],
              },
            ],
          })
        : new Promise((done) => {
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
      } else if (change === 'typed category') {
        await user.type(category, 'Freizeit Muster');
      } else if (change === 'different payee') {
        await user.clear(payee);
        await user.type(payee, 'Anderer{Enter}');
      } else {
        await user.click(screen.getByRole('button', { name: 'Einnahme' }));
      }
      await act(async () => resolve(payeeHistory));
      expect(category.value).toBe(change === 'kind' ? 'Zu verteilen' : 'Freizeit Muster');
      expect(create).not.toHaveBeenCalled();
      if (change === 'typed category') {
        await user.tab();
        await user.type(screen.getByLabelText('Betrag', { exact: true }), '7,03');
        await user.click(screen.getByRole('button', { name: 'Speichern' }));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
        expect(create.mock.lastCall?.[0].input.splits).toEqual([
          { categoryId: 'other', amountCents: -703 },
        ]);
      }
    } finally {
      lookup.mockRestore();
    }
  },
);

it('leaves the category empty when the latest booking is a split instead of reusing older history', async () => {
  const lookup = vi
    .spyOn(ledgerApi, 'fetchBookings')
    .mockResolvedValueOnce({
      ...payeeHistory,
      items: [
        {
          ...payeeHistory.items[0]!,
          splits: [payeeHistory.items[0]!.splits[0]!, payeeHistory.items[0]!.splits[0]!],
        },
      ],
      nextCursor: 'older',
    })
    .mockResolvedValueOnce(payeeHistory);
  try {
    renderPayeeSuggestions(false);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Empfänger'), 'Laden Bei{Enter}');
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Kategorie' }) as HTMLInputElement).value).toBe(
        '',
      ),
    );
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0]?.[2]).toBe(1);
    expect(create).not.toHaveBeenCalled();
  } finally {
    lookup.mockRestore();
  }
});

it('does not use a stored payee default when the payee has no booking history', async () => {
  const lookup = vi
    .spyOn(ledgerApi, 'fetchBookings')
    .mockResolvedValue({ ...payeeHistory, items: [], total: 0, sumCents: 0 });
  try {
    renderPayeeSuggestions(false, false);
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Bargeld Muster' });
    await user.type(screen.getByLabelText('Empfänger'), 'Anderer{Enter}');
    await waitFor(() => expect(lookup).toHaveBeenCalled());
    expect((screen.getByRole('combobox', { name: 'Kategorie' }) as HTMLInputElement).value).toBe(
      '',
    );
    expect((screen.getByLabelText('Konto', { exact: true }) as HTMLSelectElement).value).toBe('');
  } finally {
    lookup.mockRestore();
  }
});

it('keeps automatic values when the unchanged payee is left again', async () => {
  const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockResolvedValue(payeeHistory);
  try {
    renderPayeeSuggestions(false, false);
    const user = userEvent.setup();
    const payee = screen.getByLabelText('Empfänger');
    const category = screen.getByRole('combobox', { name: 'Kategorie' }) as HTMLInputElement;
    await user.type(payee, 'Laden Bei{Enter}');
    await waitFor(() => expect(category.value).toBe('Essen Muster'));
    await user.click(payee);
    await user.tab();
    expect(category.value).toBe('Essen Muster');
    expect((screen.getByLabelText('Konto', { exact: true }) as HTMLSelectElement).value).toBe(
      'giro',
    );
    expect(lookup).toHaveBeenCalledTimes(1);
  } finally {
    lookup.mockRestore();
  }
});

it('retries an explicit payee choice after the payee cache catches up', async () => {
  const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockResolvedValue(payeeHistory);
  try {
    const client = renderPayeeSuggestions(false, false);
    act(() => client.setQueryData(['payees'], { payees: [] }));
    const user = userEvent.setup();
    const payee = screen.getByLabelText('Empfänger');
    await user.type(payee, 'Laden Beispiel');
    await user.tab();
    expect(lookup).not.toHaveBeenCalled();
    act(() =>
      client.setQueryData(['payees'], {
        payees: [{ id: 'shop', name: 'Laden Beispiel', defaultCategoryId: null }],
      }),
    );
    await user.click(payee);
    await user.click(await screen.findByRole('option', { name: 'Laden Beispiel' }));
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Kategorie' }) as HTMLInputElement).value).toBe(
        'Essen Muster',
      ),
    );
    expect(lookup).toHaveBeenCalledTimes(1);
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

it('holds Save back while an upload runs and ignores a result from the previous draft', async () => {
  create.mockResolvedValue({ bookings: [{ id: 'booking-new' }], groupId: 'g' });
  renderCreate();
  await screen.findByRole('option', { name: 'Bargeld Muster' });
  fireEvent.click(screen.getByRole('button', { name: 'Einnahme' }));
  fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
    target: { value: '12,34' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Upload starten' }));
  const saveNew = screen.getByRole('button', { name: 'Speichern und neu' }) as HTMLButtonElement;
  const save = screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement;
  expect(saveNew.disabled).toBe(true);
  expect(save.disabled).toBe(true);
  expect(save.getAttribute('aria-describedby')).toBe('booking-upload-reason');
  fireEvent.keyDown(screen.getByLabelText('Betrag', { exact: true }), {
    key: 'Enter',
    ctrlKey: true,
  });
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Upload beenden' }));
  await waitFor(() => expect(saveNew.disabled).toBe(false));
  fireEvent.click(saveNew);
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  // The upload of the previous draft reports late: it must not become a chip of the next one.
  fireEvent.click(await screen.findByRole('button', { name: 'Spätes Ergebnis' }));
  expect(screen.queryByTestId('attached-receipt')).toBeNull();
  expect(http.request).not.toHaveBeenCalled();
});

it.each([false, true])(
  'starts empty and applies the next payee history while respecting register context (context: %s)',
  async (context) => {
    const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockResolvedValue(payeeHistory);
    try {
      renderPayeeSuggestions(false, context);
      const user = userEvent.setup();
      const account = screen.getByLabelText('Konto', { exact: true }) as HTMLSelectElement;
      await screen.findByRole('option', { name: 'Bargeld Muster' });
      await user.selectOptions(account, 'wallet');
      await user.click(screen.getByRole('combobox', { name: 'Kategorie' }));
      await user.click(screen.getByRole('option', { name: 'Freizeit Muster' }));
      await user.type(screen.getByLabelText('Betrag', { exact: true }), '10,00');
      await user.click(screen.getByRole('button', { name: 'Speichern und neu' }));
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(account.value).toBe(context ? 'wallet' : '');
      expect(screen.getByLabelText<HTMLInputElement>('Empfänger').value).toBe('');
      expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' }).value).toBe('');
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByLabelText('Betrag', { exact: true })),
      );
      await user.type(screen.getByLabelText('Empfänger'), 'Laden Bei');
      await user.click(await screen.findByRole('option', { name: 'Laden Beispiel' }));
      await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(account.value).toBe(context ? 'wallet' : 'giro'));
      expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' }).value).toBe(
        'Essen Muster',
      );
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally {
      lookup.mockRestore();
    }
  },
);

it.each(['blur', 'save'])(
  'blocks saving and retains unmatched text after a picked category on %s',
  async (commit) => {
    renderPayeeSuggestions(false);
    const user = userEvent.setup();
    const category = screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' });
    await user.type(screen.getByLabelText('Betrag', { exact: true }), '10,00');
    await user.click(category);
    await user.click(screen.getByRole('option', { name: 'Essen Muster' }));
    await user.click(category);
    await user.clear(category);
    await user.paste('Unbekannter Suchtext');
    if (commit === 'blur') await user.click(screen.getByLabelText('Betrag', { exact: true }));
    else await user.keyboard('{Control>}{Enter}{/Control}');
    expect(category.value).toBe('Unbekannter Suchtext');
    expect(category.getAttribute('aria-invalid')).toBe('true');
    if (commit === 'blur') await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(create).not.toHaveBeenCalled();
  },
);

it('takes over a unique case-insensitive category label on keyboard save without blur', async () => {
  renderPayeeSuggestions(false);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Betrag', { exact: true }), '10,00');
  const category = screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' });
  await user.click(category);
  await user.paste('freizeit muster');
  await user.keyboard('{Control>}{Enter}{/Control}');
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(category.value).toBe('Freizeit Muster');
  expect(create.mock.lastCall?.[0].input.splits[0].categoryId).toBe('other');
});

it('ignores both defaults from a history response belonging to the saved form', async () => {
  let resolve!: (page: typeof payeeHistory) => void;
  const lookup = vi.spyOn(ledgerApi, 'fetchBookings').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  try {
    renderPayeeSuggestions(false, false);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Empfänger'), 'Laden Bei{Enter}');
    const account = screen.getByLabelText<HTMLSelectElement>('Konto', { exact: true });
    const category = screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' });
    await user.selectOptions(account, 'wallet');
    await user.click(category);
    await user.click(screen.getByRole('option', { name: 'Freizeit Muster' }));
    await user.type(screen.getByLabelText('Betrag', { exact: true }), '10,00');
    await user.click(screen.getByRole('button', { name: 'Speichern und neu' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.lastCall?.[0].input).toMatchObject({
      accountId: 'wallet',
      amountCents: -1000,
      splits: [{ categoryId: 'other', amountCents: -1000 }],
    });
    await act(async () => resolve(payeeHistory));
    expect(account.value).toBe('');
    expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' }).value).toBe('');
    expect(create).toHaveBeenCalledTimes(1);
  } finally {
    lookup.mockRestore();
  }
});

it.each(['expense', 'income', 'transfer', 'split'] as const)(
  'clears booking details immediately after save-and-new for %s, including a queued save',
  async (mode) => {
    // A queued create returns no server result, but receives exactly the same displayed draft.
    create.mockResolvedValue(undefined);
    renderPayeeSuggestions(false, true, {
      kind: mode === 'split' ? 'expense' : mode,
      date: '2026-10-09',
      amount: '10,01',
      payee: 'Laden Beispiel',
      categoryId: mode === 'transfer' ? '' : 'food',
      projectId: 'synthetic-project',
      incomeTypeId: mode === 'income' ? 'synthetic-income' : '',
      memo: 'Synthetic note',
      flag: 'blue',
      toAccountId: mode === 'transfer' ? 'giro' : '',
      splitOn: mode === 'split',
      splits:
        mode === 'split'
          ? [
              {
                key: 'a',
                type: 'category',
                categoryId: 'food',
                amount: '6,67',
                memo: '',
                toAccountId: '',
                contactId: null,
                incomeTypeId: null,
              },
              {
                key: 'b',
                type: 'category',
                categoryId: 'other',
                amount: '3,34',
                memo: '',
                toAccountId: '',
                contactId: null,
                incomeTypeId: null,
              },
            ]
          : [],
    });
    await screen.findByRole('option', { name: 'Bargeld Muster' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Speichern und neu' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const first = create.mock.lastCall?.[0];
    expect(first.draft).toMatchObject({
      date: '2026-10-09',
      amount: '10,01',
      projectId: 'synthetic-project',
    });
    expect(first.input).toMatchObject(
      mode === 'transfer'
        ? { type: 'transfer', fromAccountId: 'wallet', toAccountId: 'giro', amountCents: 1001 }
        : { type: 'booking', accountId: 'wallet', amountCents: mode === 'income' ? 1001 : -1001 },
    );
    if (mode === 'split')
      expect(first.input.splits).toEqual([
        { categoryId: 'food', amountCents: -667 },
        { categoryId: 'other', amountCents: -334 },
      ]);
    expect(screen.getByLabelText<HTMLInputElement>('Betrag', { exact: true }).value).toBe('');
    if (mode === 'transfer') {
      expect(screen.getByLabelText<HTMLSelectElement>('Nach Konto').value).toBe('');
      await user.selectOptions(screen.getByLabelText('Nach Konto'), 'giro');
    } else {
      expect(
        screen.getByLabelText<HTMLInputElement>(mode === 'income' ? 'Von (Zahler)' : 'Empfänger')
          .value,
      ).toBe('');
      expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Kategorie' }).value).toBe(
        mode === 'income' ? 'Zu verteilen' : '',
      );
      if (mode !== 'income') {
        await user.click(screen.getByRole('combobox', { name: 'Kategorie' }));
        await user.click(screen.getByRole('option', { name: 'Freizeit Muster' }));
      }
    }
    await user.type(screen.getByLabelText('Betrag', { exact: true }), '2,03');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.lastCall?.[0].draft).toMatchObject({
      accountId: 'wallet',
      date: '2026-10-09',
      amount: '2,03',
      payee: '',
      categoryId: mode === 'expense' || mode === 'split' ? 'other' : '',
      projectId: '',
      incomeTypeId: '',
      memo: '',
      flag: '',
      contactId: '',
      splitOn: false,
      splits: [],
    });
    expect(create.mock.lastCall?.[0].input).toMatchObject(
      mode === 'transfer'
        ? { type: 'transfer', amountCents: 203 }
        : { type: 'booking', amountCents: mode === 'income' ? 203 : -203, payeeId: null },
    );
  },
);
