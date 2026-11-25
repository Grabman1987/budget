// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BankBookingRow } from './bank-booking-row';
import type { InboxBooking } from './api';

vi.mock('../budget/use-category-writes', () => ({
  useBudgetWrite: () => (run: () => Promise<unknown>) => run(),
}));
const base: InboxBooking = {
  type: 'booking',
  id: 'booking:b1',
  bookingId: 'b1',
  kind: 'uncategorized',
  urgent: false,
  date: '2026-10-15',
  accountName: 'Konto Beispiel',
  payeeName: null,
  memo: 'SHOP BEISPIEL PAYMENTS EUROPE',
  amountCents: -1500,
  currency: 'EUR',
  status: 'pending',
  source: 'bank',
  missingSplits: 1,
  suggestion: {
    payeeId: 'p1',
    payeeName: 'Shop Beispiel',
    categoryId: 'c1',
    categoryName: 'Haushalt',
    basis: 'häufigste Kategorie (3 von 4 Buchungen, 12 Monate)',
    singleSplit: true,
  },
};
let client: QueryClient;
let matchBody: object;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  matchBody = { merge: [], transfers: [], suggestions: [] };
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify(matchBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

function renderRow(item: InboxBooking) {
  const onConfirmInline = vi.fn();
  const onEdit = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <table>
          <tbody>
            <BankBookingRow
              item={item}
              selected={false}
              onSelect={undefined}
              onPrepared={() => undefined}
              onEdit={onEdit}
              onConfirmed={() => undefined}
              onConfirmInline={onConfirmInline}
              busy={false}
            />
          </tbody>
        </table>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onConfirmInline, onEdit };
}

it('shows the suggested payee and category in one pill that confirms with one patch', () => {
  const { onConfirmInline } = renderRow(base);
  expect(screen.getByRole('button', { name: 'Empfänger ändern: Shop Beispiel' })).toBeTruthy();
  expect(screen.getByText('SHOP BEISPIEL PAYMENTS EUROPE')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Bestätigen' })).toBeNull();
  expect(document.querySelector('.bank-v1-category')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Vorschlag bestätigen: Shop Beispiel · Haushalt' }),
  );
  expect(onConfirmInline).toHaveBeenCalledWith('b1', {
    status: 'confirmed',
    acceptInReview: true,
    payeeId: 'p1',
    splits: [{ amountCents: -1500, categoryId: 'c1' }],
  });
});

it('offers "Kategorie wählen" instead of a confirm pill while no category is known', () => {
  const { onConfirmInline } = renderRow({
    ...base,
    suggestion: { ...base.suggestion!, categoryId: null, categoryName: null, basis: null },
  });
  expect(screen.queryByRole('button', { name: /^Vorschlag bestätigen/ })).toBeNull();
  const open = screen.getByRole('button', { name: 'Kategorie wählen' });
  expect(open.getAttribute('title')).toBe('Kategorie wählen, um zu bestätigen.');
  fireEvent.click(open);
  expect(onConfirmInline).not.toHaveBeenCalled();
});

it('disables the pill for a booking with several splits', () => {
  renderRow({ ...base, suggestion: { ...base.suggestion!, singleSplit: false } });
  const pill = screen.getByRole('button', { name: /^Vorschlag bestätigen/ }) as HTMLButtonElement;
  expect(pill.disabled).toBe(true);
  expect(pill.title).toBe('Mehrere Teilbuchungen. Bitte im Formular bearbeiten.');
});

it('hands the row choice to the full form via Bearbeiten', () => {
  const { onEdit } = renderRow(base);
  fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
  expect(onEdit).toHaveBeenCalledWith('b1', {
    payeeId: 'p1',
    payeeName: 'Shop Beispiel',
    categoryId: 'c1',
    categoryName: 'Haushalt',
  });
});

it('shows a single action directly and the menu only with 2+ actions', async () => {
  renderRow(base);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeTruthy());
  expect(screen.queryByLabelText('Weitere Aktionen')).toBeNull();
  cleanup();
  matchBody = {
    merge: [{ id: 'm1', date: '2026-10-14', accountName: 'Konto Beispiel', amountCents: -1500 }],
    transfers: [],
    suggestions: [],
  };
  renderRow(base);
  await waitFor(() => expect(screen.getByLabelText('Weitere Aktionen')).toBeTruthy());
});

it('proposes a card bill as a transfer to the card and applies it through the guarded apply route (#1319)', async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(
      JSON.stringify({ merge: [], transfers: [], suggestions: [], groupId: 'g' }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  });
  const { onConfirmInline } = renderRow({
    ...base,
    amountCents: -123456,
    suggestion: {
      payeeId: null,
      payeeName: null,
      categoryId: null,
      categoryName: null,
      basis: null,
      singleSplit: true,
      transfer: {
        ruleId: 'card-settlement:card1',
        revision: 'r'.repeat(64),
        accountId: 'card1',
        label: 'Kartenabrechnung → Umbuchung auf Visa',
      },
    },
  });
  // No category pill is offered for a card bill.
  expect(screen.queryByRole('button', { name: 'Kategorie wählen' })).toBeNull();
  const pill = screen.getByTestId('card-settlement-suggestion');
  expect(pill.textContent).toBe('Kartenabrechnung → Umbuchung auf Visa');
  expect(pill.getAttribute('title')).toContain('1.234,56');
  fireEvent.click(pill);
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      url: '/api/assignment-rules/bookings/b1/apply',
      body: { ruleId: 'card-settlement:card1', revision: 'r'.repeat(64) },
    }),
  );
  expect(onConfirmInline).not.toHaveBeenCalled();
});
