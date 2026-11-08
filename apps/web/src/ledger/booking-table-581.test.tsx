// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { BookingTable } from './booking-table';
import { BookingLegend } from './booking-legend';
import { accountsQuery, lookupsQuery } from './queries';
import type { ListedBooking } from './types';
import type { UpcomingModel } from './upcoming-register';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
vi.mock('../shell/redesign-flag', () => flags);

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

it.each([false, true])(
  'keeps native cents and explicit editing in the reference columns with redesign %s',
  (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
    const { container } = setup([booking, { ...booking, id: 'income', amountCents: 1234 }]);
    expect(
      [...container.querySelectorAll('thead th')].map((node) => node.textContent?.trim()),
    ).toEqual(
      enabled
        ? [
            'Markierung',
            'Datum',
            'Empfänger',
            'Kategorie',
            'Notiz',
            'Ausgang',
            'Eingang',
            'Saldo',
            'Status',
          ]
        : ['Markierung', 'Datum', 'Empfänger', 'Notiz', 'Kategorie', 'Betrag', 'Saldo', 'Status'],
    );
    if (enabled) {
      expect(container.querySelector('.kmonth')?.textContent).toBe('Oktober 2026');
      expect(
        container.querySelector('[data-booking="sample"] .kx-outgoing')?.textContent,
      ).toContain('−12,34 €');
      expect(container.querySelector('[data-booking="sample"] .kx-incoming')?.textContent).toBe('');
      expect(
        container.querySelector('[data-booking="income"] .kx-incoming')?.textContent,
      ).toContain('+12,34 €');
    }
    flags.REDESIGN_ENABLED = false;
  },
);

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

it.each([false, true])(
  'marks incomplete expense splits only ON (%s) and retains classified/transfer/contact/income splits',
  (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
    const assigned = {
      ...booking.splits[0]!,
      id: 'assigned',
      categoryId: 'category',
      categoryName: 'Synthetic category',
      amountCents: -1000,
    };
    const remainder = { ...booking.splits[0]!, id: 'remainder', amountCents: -234 };
    try {
      const { container } = setup([
        { ...booking, id: 'partial', status: 'reconciled', splits: [assigned, remainder] },
        {
          ...booking,
          id: 'classified',
          splits: [assigned, { ...remainder, categoryId: 'category' }],
        },
        {
          ...booking,
          id: 'transfer-split',
          splits: [assigned, { ...remainder, transferId: 'transfer' }],
        },
        {
          ...booking,
          id: 'contact-split',
          splits: [assigned, { ...remainder, contactId: 'contact' }],
        },
        {
          ...booking,
          id: 'income-split',
          amountCents: 1234,
          splits: [
            { ...assigned, amountCents: 1000 },
            { ...remainder, amountCents: 234 },
          ],
        },
      ]);
      expect(Boolean(container.querySelector('[data-booking="partial"] .kcat.is-none'))).toBe(
        enabled,
      );
      for (const id of ['classified', 'transfer-split', 'contact-split', 'income-split'])
        expect(container.querySelector(`[data-booking="${id}"] .kcat.is-none`)).toBeNull();
    } finally {
      flags.REDESIGN_ENABLED = false;
    }
  },
);

it.each(['account', 'all'] as const)(
  'groups the redesign phone %s list by supplied dates without changing rows',
  (variant) => {
    flags.REDESIGN_ENABLED = true;
    try {
      const items = [
        booking,
        { ...booking, id: 'same-day' },
        { ...booking, id: 'previous-day', date: '2026-10-01' },
      ];
      const { container, onOpen } = setup(items, variant);
      const days = [...container.querySelectorAll('.kregister-day')];
      expect(days.map((day) => day.getAttribute('data-day'))).toEqual(['2026-10-02', '2026-10-01']);
      expect(
        days.map((day) => day.parentElement?.querySelectorAll('[data-booking]').length),
      ).toEqual([2, 1]);
      expect(
        [...container.querySelectorAll('[data-booking]')].map((row) =>
          row.getAttribute('data-booking'),
        ),
      ).toEqual(items.map((item) => item.id));
      expect(container.querySelectorAll('.kx-outgoing')).toHaveLength(3);
      for (const amount of container.querySelectorAll('.kx-outgoing'))
        expect(amount.textContent).toContain('−12,34 €');
      fireEvent.click(container.querySelector('.kaccount-mobile-meta')!);
      expect(onOpen).toHaveBeenCalledWith(booking);
    } finally {
      flags.REDESIGN_ENABLED = false;
    }
  },
);

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

it.each([false, true])(
  'adds checked-row presentation only ON (%s) without changing lock or amounts',
  (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
    try {
      const { container } = setup([
        { ...booking, status: 'reconciled' },
        { ...booking, id: 'confirmed' },
        { ...booking, id: 'income', amountCents: 1234 },
        { ...booking, id: 'transfer', transferId: 'synthetic-transfer' },
      ]);
      const checked = container.querySelector('[data-booking="sample"]')!;
      expect(checked.classList.contains('is-reconciled')).toBe(enabled);
      expect(checked.textContent).toContain('−12,34 €');
      expect(checked.querySelector('.kcat.is-none')?.textContent).toContain('ohne Kategorie');
      expect(within(checked as HTMLElement).getByRole('img', { name: 'geprüft' })).toBeTruthy();
      expect(
        container.querySelector('[data-booking="confirmed"]')!.classList.contains('is-reconciled'),
      ).toBe(false);
      expect(container.querySelector('[data-booking="income"] .kcat.is-none')).toBeNull();
      expect(container.querySelector('[data-booking="transfer"] .kcat.is-none')).toBeNull();
    } finally {
      flags.REDESIGN_ENABLED = false;
    }
  },
);

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

it.each([false, true])(
  'deliberate editing keeps focus and unchanged category blur read-only with redesign %s (#840)',
  (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
    patch.mutate.mockClear();
    patch.mutateAsync.mockClear();
    const { container, onOpen } = setup([booking], 'all');
    expect(container.querySelector('.kbooking-edit-mark') !== null).toBe(enabled);
    const category = screen.getByRole('button', { name: /^Kategorie ändern/ });
    category.focus();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(patch.mutate).not.toHaveBeenCalled();
    fireEvent.click(category);
    const select = screen.getByRole('combobox', { name: /^Kategorie für/ });
    fireEvent.focus(select);
    fireEvent.blur(select);
    expect(patch.mutate).not.toHaveBeenCalled();
    expect(patch.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /bearbeiten ·/ }));
    expect(onOpen).toHaveBeenCalledWith(booking);
    flags.REDESIGN_ENABLED = false;
  },
);

it('dismisses the compact register context with Escape or an outside press and restores focus', () => {
  flags.REDESIGN_ENABLED = true;
  const { container } = render(<BookingLegend compact context={<p>Heute · Saldo 12,34 €</p>} />);
  const menu = container.querySelector('details')!;
  const summary = container.querySelector('summary')!;
  fireEvent.click(summary);
  expect(menu.open).toBe(true);
  // A touch-opened disclosure can leave focus on the page body.
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(menu.open).toBe(false);
  expect(document.activeElement).toBe(summary);
  fireEvent.click(summary);
  fireEvent.pointerDown(document.body);
  expect(menu.open).toBe(false);
  flags.REDESIGN_ENABLED = false;
});
