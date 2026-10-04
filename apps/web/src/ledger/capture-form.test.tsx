// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { CaptureForm } from './capture-form';

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
