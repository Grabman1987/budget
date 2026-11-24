// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify({ merge: [], transfers: [], suggestions: [] }), {
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
