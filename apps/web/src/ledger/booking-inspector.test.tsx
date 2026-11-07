// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import type * as BudgetUi from '@budget/ui';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { BookingInspector, type BookingInspectorData } from './booking-inspector';
import type { ListedBooking } from './types';
import * as http from '../api/http';

vi.mock('@budget/ui', async (original) => ({
  ...(await original<typeof BudgetUi>()),
  DetailPanel: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, hash, children }: { to: string; hash?: string; children: ReactNode }) => (
    <a href={to + (hash ? `#${hash}` : '')}>{children}</a>
  ),
}));
const booking = {
  id: 'synthetic',
  payeeId: 'payee',
  payeeName: 'Synthetic payee',
  date: '2026-10-02',
  accountName: 'Synthetic account',
  amountCents: -1234,
  currency: 'EUR',
} as ListedBooking;
const empty: BookingInspectorData = {
  usualCategory: null,
  history: [],
  rules: [],
  repetition: null,
};
afterEach(() => {
  vi.restoreAllMocks();
  act(() => setAmountsHidden(false));
});
function setup(row: ListedBooking | null = booking) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BookingInspector booking={row} onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

it('reads only on open and distinguishes empty context', async () => {
  const request = vi.spyOn(http, 'request').mockResolvedValue(empty);
  const closed = setup(null);
  expect(request).not.toHaveBeenCalled();
  closed.unmount();
  setup({ ...booking, payeeId: null, payeeName: null });
  await screen.findByText('Kein Empfänger zugeordnet.');
  expect(screen.getByText('Keine übliche Kategorie gespeichert.')).toBeTruthy();
  expect(screen.getByText('Keine Wiederholung mit dieser Buchung verknüpft.')).toBeTruthy();
  expect(request).toHaveBeenCalledExactlyOnceWith('GET', '/api/bookings/synthetic/inspector');
});

it('shows loading and retry instead of a false empty history', async () => {
  const request = vi.spyOn(http, 'request').mockRejectedValue(new Error('Synthetic failure'));
  setup();
  expect(screen.getByText(/Buchungsdetails.*laden|lade.*Buchungsdetails/i)).toBeTruthy();
  await screen.findByRole('alert');
  expect(screen.queryByText('Keine weiteren Buchungen vorhanden.')).toBeNull();
  request.mockResolvedValue(empty);
  fireEvent.click(screen.getByRole('button', { name: /erneut|noch einmal/i }));
  await screen.findByText('Keine weiteren Buchungen vorhanden.');
});

it('retains native currencies, exact links and amount privacy without mutation controls', async () => {
  const request = vi.spyOn(http, 'request').mockResolvedValue({
    ...empty,
    usualCategory: { id: 'cat', name: 'Synthetic category' },
    history: [
      {
        id: 'older',
        date: '2026-09-01',
        amountCents: 2345,
        currency: 'USD',
        accountName: 'Synthetic foreign account',
      },
    ],
    rules: [{ id: 'rule', name: 'Synthetic rule', enabled: false, matches: false }],
    repetition: { id: 'repeat', name: 'Synthetic repetition', dueDate: '2026-09-30' },
  });
  setup();
  await screen.findByText('Synthetic category');
  expect(screen.getByRole('link', { name: /Synthetic rule/ }).getAttribute('href')).toBe(
    '/einstellungen/zuordnung#regel-rule',
  );
  expect(screen.getByRole('link', { name: /Synthetic repetition/ }).getAttribute('href')).toBe(
    '/plan/erwartet/repeat',
  );
  expect(screen.getByText(/Deaktiviert.*Bedingungen passen nicht/)).toBeTruthy();
  expect(screen.getByText(/23,45/).textContent).toContain('USD');
  act(() => setAmountsHidden(true));
  await waitFor(() => expect(screen.queryByText(/23,45|12,34/)).toBeNull());
  expect(screen.queryByRole('button', { name: /speichern|übernehmen|bearbeiten/i })).toBeNull();
  expect(request).toHaveBeenCalledExactlyOnceWith('GET', '/api/bookings/synthetic/inspector');
});
