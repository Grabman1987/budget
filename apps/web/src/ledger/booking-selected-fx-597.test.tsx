// @vitest-environment jsdom
import { cashValuation } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BookingTable } from './booking-table';
import { lookupsQuery } from './queries';
import type { ListedBooking } from './types';

vi.mock('./mutations', () => ({
  useLedgerWrites: () => ({ patch: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } }),
}));

it('keeps selected foreign amounts wrapped with literal dated EUR values and privacy', () => {
  const booking: ListedBooking = {
    id: 'synthetic-selected-usd',
    accountId: 'synthetic-usd',
    accountName: 'Synthetic USD',
    date: '2026-10-02',
    amountCents: 201,
    payeeId: null,
    payeeName: null,
    memo: 'Synthetic FX',
    status: 'confirmed',
    flag: null,
    transferId: null,
    transferAccountId: null,
    transferAccountName: null,
    projectId: null,
    currency: 'USD',
    originalAmountCents: null,
    originalCurrency: null,
    balanceAfterCents: null,
    amountValuation: cashValuation(201, 'USD', '2026-10-02', {
      date: '2026-10-02',
      rateMicro: 750000,
      source: 'ecb',
    }),
    splits: [
      {
        id: 'synthetic-split',
        categoryId: null,
        categoryName: null,
        amountCents: 201,
        memo: null,
        contactId: null,
        incomeTypeId: null,
        transferId: null,
      },
    ],
  };
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  client.setQueryData(lookupsQuery().queryKey, {
    groups: [],
    categories: [],
    projects: [],
    incomeTypes: [],
    contacts: [],
    institutions: [],
  });
  const { container } = render(
    <QueryClientProvider client={client}>
      <BookingTable
        items={[booking]}
        caption="Synthetic selected FX"
        variant="all"
        onOpen={vi.fn()}
        selection={{
          mode: true,
          selected: new Set([booking.id]),
          toggle: vi.fn(),
          toggleAll: vi.fn(),
        }}
      />
    </QueryClientProvider>,
  );
  const amount = container.querySelector('[data-booking] .kx-amount .kfx-money');
  expect(amount).not.toBeNull();
  expect(amount!.textContent?.replaceAll('\u00a0', ' ')).toBe(
    '+USD 2,01 · +1,51 € · EZB: 1 USD = 0,75 EUR · 02.10.2026',
  );
  expect(container.querySelector('.kx-amount button')).toBeNull();
  try {
    act(() => setAmountsHidden(true));
    expect(amount!.textContent).toContain('••• USD · ••• €');
    expect(amount!.textContent).not.toContain('2,01');
    expect(amount!.textContent).not.toContain('1,51');
  } finally {
    act(() => setAmountsHidden(false));
  }
});
