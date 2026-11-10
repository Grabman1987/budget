// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { BookingLegend } from './booking-legend';
import { CategoryCell } from './booking-cells';
import type { ListedBooking } from './types';

afterEach(cleanup);

it('opens a labelled status legend in one click without changing a booking', async () => {
  const user = userEvent.setup();
  const { container } = render(<BookingLegend />);
  const details = container.querySelector('details')!;
  expect(details.open).toBe(false);
  await user.click(screen.getByText('Status'));
  expect(details.open).toBe(true);
  const statuses = within(screen.getByRole('list', { name: 'Buchungsstatus' }));
  for (const label of ['vorgemerkt', 'bestätigt', 'geprüft']) {
    expect(statuses.getByText(label)).toBeTruthy();
  }
  // The six-shape flag legend is retired with the flag UI (#1040): only the status list remains.
  expect(screen.queryByRole('list', { name: 'Markierungen' })).toBeNull();
  await user.click(screen.getByText('Status'));
  expect(details.open).toBe(false);
});

it('omits only register class squares while retaining category choices and all category text', () => {
  const booking: ListedBooking = {
    id: 'synthetic',
    accountId: 'account',
    accountName: 'Giro Muster',
    date: '2026-10-02',
    amountCents: -1234,
    payeeId: null,
    payeeName: null,
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
    balanceAfterCents: null,
    splits: [
      {
        id: 'split',
        categoryId: 'category',
        categoryName: 'Sparen Muster',
        amountCents: -1234,
        memo: null,
        contactId: null,
        incomeTypeId: null,
        transferId: null,
      },
    ],
  };
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  const { container, rerender } = render(
    <QueryClientProvider client={client}>
      <CategoryCell
        booking={booking}
        classes={new Map([['category', 'future']])}
        showClass={false}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Sparen Muster')).toBeTruthy();
  expect(container.querySelector('.sw')).toBeNull();
  rerender(
    <QueryClientProvider client={client}>
      <CategoryCell booking={booking} classes={new Map([['category', 'future']])} />
    </QueryClientProvider>,
  );
  expect(container.querySelector('.sw-future')).not.toBeNull();
  expect(screen.getByText('Sparen Muster')).toBeTruthy();
});
