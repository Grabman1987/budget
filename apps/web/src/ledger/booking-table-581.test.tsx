// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { BookingTable } from './booking-table';
import { accountsQuery, lookupsQuery } from './queries';
import type { ListedBooking } from './types';
import type { UpcomingModel } from './upcoming-register';

const patch = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }));
vi.mock('./mutations', () => ({ useLedgerWrites: () => ({ patch }) }));

const booking: ListedBooking = {
  id: 'sample',
  accountId: 'account',
  accountName: 'Giro Muster',
  date: '2026-10-02',
  amountCents: -1234,
  payeeId: null,
  payeeName: 'Laden Muster',
  memo: 'Synthetic note',
  status: 'confirmed',
  flag: null,
  transferId: null,
  transferAccountId: null,
  transferAccountName: null,
  projectId: null,
  currency: 'EUR',
  originalAmountCents: null,
  originalCurrency: null,
  balanceAfterCents: 98766,
  splits: [
    {
      id: 'split',
      categoryId: null,
      categoryName: null,
      amountCents: -1234,
      memo: null,
      contactId: null,
      incomeTypeId: null,
      transferId: null,
    },
  ],
};

function setup(
  items: ListedBooking[] = [booking],
  variant: 'account' | 'all' = 'account',
  upcoming?: UpcomingModel,
) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  client.setQueryData(lookupsQuery().queryKey, {
    groups: [],
    categories: [],
    projects: [],
    incomeTypes: [],
    contacts: [],
    institutions: [],
  });
  client.setQueryData(accountsQuery().queryKey, {
    asOf: '2026-10-18',
    accounts: [],
    netWorthEurCents: 0,
    missingFxCurrencies: [],
    missingPriceSecurityIds: [],
  });
  const onOpen = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <BookingTable
        items={items}
        caption="Test register"
        variant={variant}
        onOpen={onOpen}
        {...(upcoming ? { upcoming } : {})}
      />
    </QueryClientProvider>,
  );
  return { ...view, onOpen };
}

it('uses the supplied closing day balance, one phone metadata line, and a final status column', () => {
  const { container } = setup([booking, { ...booking, id: 'earlier', balanceAfterCents: 100000 }]);
  const group = container.querySelector('.kaccount-day')!;
  expect(group.textContent).toContain('Saldo 987,66');
  expect(container.querySelectorAll('.kaccount-day')).toHaveLength(1);
  expect(container.querySelector('.kaccount-mobile-meta')!.textContent).toContain(
    '02.10. · ohne Kategorie',
  );
  expect(container.querySelector('thead th:last-child')!.textContent).toBe('Status');
  expect(container.querySelector('colgroup')!.children).toHaveLength(8);
  expect(container.querySelector('[data-booking] td:last-child')!.className).toContain('kx-status');
});

it('opens the existing dialog from the two-line phone content', () => {
  const { container, onOpen } = setup();
  fireEvent.click(container.querySelector('.kaccount-mobile-meta')!);
  expect(onOpen).toHaveBeenCalledWith(booking);
});

it('includes visible fallback, date, category and amount in control names without exposing hidden money', () => {
  const { container } = setup([{ ...booking, payeeName: null, memo: null }]);
  const row = within(container.querySelector('[data-booking]') as HTMLElement);
  expect(
    row.getByRole('button', { name: 'Buchung am 02.10. bearbeiten · Ohne Empfänger' }),
  ).toBeTruthy();
  expect(row.getByRole('button', { name: 'Datum ändern: Buchung · 02.10.' })).toBeTruthy();
  expect(
    row.getByRole('button', { name: 'Kategorie ändern: Buchung am 02.10. · ohne Kategorie' }),
  ).toBeTruthy();
  expect(row.getByRole('button', { name: 'Betrag ändern: Buchung · −12,34 €' })).toBeTruthy();
  try {
    act(() => setAmountsHidden(true));
    expect(row.getByRole('button', { name: 'Betrag ändern: Buchung · ••• €' })).toBeTruthy();
    expect(container.textContent).not.toContain('12,34');
  } finally {
    act(() => setAmountsHidden(false));
  }
});

it('keeps reconciled category and status read-only and delegates the amount to dialog unlock', () => {
  const locked = { ...booking, status: 'reconciled' as const };
  const { container, onOpen } = setup([locked]);
  const row = within(container.querySelector('[data-booking]') as HTMLElement);
  expect(row.queryByRole('button', { name: /^Kategorie ändern/ })).toBeNull();
  expect(row.getByRole('img', { name: 'geprüft' })).toBeTruthy();
  fireEvent.click(row.getByRole('button', { name: /^Betrag ändern/ }));
  expect(onOpen).toHaveBeenCalledWith(locked);
  expect(screen.queryByLabelText('Betrag bearbeiten')).toBeNull();
});

it('does not add account day balances or phone metadata to Alle Buchungen', () => {
  const { container } = setup([booking], 'all');
  expect(container.querySelector('.ktx-all')).toBeTruthy();
  expect(container.querySelector('.kaccount-day')).toBeNull();
  expect(container.querySelector('.kaccount-mobile-meta')).toBeNull();
  expect(container.querySelector('colgroup')).toBeNull();
});

it('keeps a missing day balance unavailable and negative cents signed', () => {
  const { container } = setup([
    { ...booking, balanceAfterCents: null },
    { ...booking, id: 'older', date: '2026-10-01', balanceAfterCents: -1 },
  ]);
  expect(container.querySelector('[data-day="2026-10-02"]')!.textContent).toContain('Saldo –');
  expect(container.querySelector('[data-day="2026-10-01"]')!.textContent).toContain('Saldo −0,01');
});

it.each([
  ['account', '–'],
  ['all', 'Saldo offen'],
] as const)(
  'uses the unavailable balance marker for %s without inventing a zero',
  (variant, expected) => {
    const { container } = setup([], variant, {
      today: '2026-10-01',
      open: true,
      toggle: vi.fn(),
      bookings: [booking],
      schedules: [],
      balances: new Map([['sample', null]]),
      count: 1,
      balanceLabel: '1.000,00 €',
    });
    expect(container.querySelector('.is-upcoming .kx-run')!.textContent).toBe(expected);
  },
);

it('retains the projected unavailable marker without showing an unscoped historical balance', () => {
  const { container } = setup([{ ...booking, id: 'history' }], 'all', {
    today: '2026-10-01',
    open: true,
    toggle: vi.fn(),
    bookings: [booking],
    schedules: [],
    balances: new Map([['sample', null]]),
    count: 1,
    balanceLabel: '1.000,00 €',
  });
  expect(container.querySelector('.is-upcoming .kx-run')!.textContent).toBe('Saldo offen');
  expect(container.querySelector('[data-booking="history"] .kx-run')!.textContent).toBe('');
});
