// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BookingTable } from './booking-table';
import { MiniLine } from './mini-line';
import type { ListedBooking } from './types';

vi.mock('./queries', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  lookupsQuery: () => ({
    queryKey: ['lookups'],
    queryFn: async () => ({ categories: [], groups: [] }),
  }),
}));
vi.mock('./mutations', () => ({ useLedgerWrites: () => ({ patch: { isPending: false } }) }));
const booking: ListedBooking = {
  id: 'note-booking',
  accountId: 'note-account',
  accountName: 'Musterkonto',
  date: '2026-10-01',
  amountCents: -123,
  payeeId: null,
  payeeName: 'Musterladen',
  memo: 'Synthetic note with a second line.\nAdditional detail.',
  status: 'pending',
  flag: null,
  transferId: null,
  transferAccountId: null,
  transferAccountName: null,
  projectId: null,
  currency: 'EUR',
  originalAmountCents: null,
  originalCurrency: null,
  splits: [],
  balanceAfterCents: -123,
};
it('gives account notes their own cell with full hover text and a mobile payee line', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container, rerender } = render(
    <QueryClientProvider client={client}>
      <BookingTable items={[booking]} caption="Bookings" variant="account" onOpen={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('columnheader', { name: 'Notiz' })).toBeTruthy();
  expect(container.querySelector('td.kx-note span')?.getAttribute('title')).toBe(booking.memo);
  expect(container.querySelector('.kx-mobile-note')?.textContent).toBe(booking.memo);
  rerender(
    <QueryClientProvider client={client}>
      <BookingTable items={[booking]} caption="Bookings" variant="all" onOpen={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole('columnheader', { name: 'Notiz' })).toBeNull();
  expect(container.querySelector('.kx-payee .kmeta')?.textContent).toBe(booking.memo);
});
it('names the overview sparkline with its 90-day range', () => {
  const { container } = render(
    <MiniLine
      points={[
        { date: '2026-07-04', balanceCents: 100 },
        { date: '2026-10-01', balanceCents: 200 },
      ]}
    />,
  );
  expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
    'Kontosaldo der letzten 90 Tage',
  );
});
