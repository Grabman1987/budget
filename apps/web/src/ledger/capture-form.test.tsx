// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { CaptureForm } from './capture-form';
import * as ledgerApi from './api';

const create = vi.hoisted(() => vi.fn());
vi.mock('./mutations', () => ({ useLedgerWrites: () => ({ create: { mutateAsync: create } }) }));
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
  create.mockResolvedValue({ bookings: [], groupId: 'synthetic-group' });
});
it('cash defaults to confirmed, has no Budgetmonat or header status icon, and saves repetition', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['accounts'], {
    accounts: [
      { id: 'wallet', name: 'Bargeld Muster', type: 'cash', onBudget: true, closedAt: null },
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
    expect(screen.getByRole('button', { name: 'bestätigt' }).getAttribute('aria-pressed')).toBe(
      'true',
    ),
  );
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
    status: 'confirmed',
    incomeNextMonth: false,
    repeat: 'weekly',
  });
  expect(done).toHaveBeenCalledTimes(1);
});

it('keeps optional fields in Mehr with a summary and offers relative dates without calculator keys', async () => {
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
    expect(more.contains(screen.getByLabelText('Wiederholen'))).toBe(true);
    expect(more.contains(screen.getByLabelText('Notiz'))).toBe(true);
    expect(more.contains(screen.getByRole('button', { name: 'Aufteilen', hidden: true }))).toBe(
      true,
    );
    expect(container.querySelector('.amount-ops')).toBeNull();
    expect(screen.getByText(/Rechnen im Feld möglich: 12,50\+3/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Gestern' }));
    expect((screen.getByLabelText('Datum') as HTMLInputElement).value).toBe('04.10.2026');
    await user.click(screen.getByRole('button', { name: 'Heute' }));
    expect((screen.getByLabelText('Datum') as HTMLInputElement).value).toBe('05.10.2026');
    await user.click(screen.getByRole('button', { name: 'Datum…' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Datum'));
    await user.click(screen.getByText('Mehr', { exact: true }));
    await user.selectOptions(screen.getByLabelText('Wiederholen'), 'monthly');
    await user.type(screen.getByLabelText('Notiz'), 'Muster');
    expect(more.querySelector('summary')?.textContent).toContain('Wiederholt monatlich · Notiz');
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
