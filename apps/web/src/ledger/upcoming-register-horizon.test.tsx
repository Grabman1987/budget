// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { registerOccurrencesQuery, type Occurrence } from '../expected/api';
import { accountsQuery, futureBookingsQuery } from './queries';
import { useUpcomingRegister } from './upcoming-register';
import type { BookingFilter } from './types';

vi.mock('@budget/ui', async (original) => ({
  ...(await original<object>()),
  useIsPhone: () => false,
}));

const today = '2026-11-25';
const occurrence = (id: string, dueDate: string): Occurrence =>
  ({
    occurrenceId: id,
    paymentId: `p-${id}`,
    dueDate,
    status: 'expected',
    bookingId: null,
    name: id,
    accountId: 'synthetic-account',
    accountName: 'Muster',
    amountCents: 100,
    currency: 'EUR',
    kind: 'inflow',
    categoryId: null,
    categoryName: null,
    payeeId: null,
    payeeName: null,
  }) as unknown as Occurrence;

function names(filter: BookingFilter) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData([...accountsQuery().queryKey, today], {
    accounts: [{ id: 'synthetic-account', currency: 'EUR', balanceCents: 0 }],
  });
  client.setQueryData(futureBookingsQuery({ accountId: 'synthetic-account' }, today).queryKey, []);
  client.setQueryData(futureBookingsQuery(filter, today).queryKey, []);
  client.setQueryData(registerOccurrencesQuery(today).queryKey, [
    occurrence('soon', '2026-12-15'),
    occurrence('edge', '2026-12-26'),
    occurrence('later', '2027-06-15'),
  ]);
  function Register() {
    const { model } = useUpcomingRegister(filter, today, 'account');
    return <output>{model?.schedules.map((s) => s.name).join(',')}</output>;
  }
  const view = render(
    <QueryClientProvider client={client}>
      <Register />
    </QueryClientProvider>,
  );
  const text = screen.getByRole('status').textContent;
  view.unmount();
  client.clear();
  return text;
}

it('lists planned occurrences only for the next 31 days unless a later "bis" filter is set', () => {
  expect(names({ accountId: 'synthetic-account' })).toBe('soon,edge');
  expect(names({ accountId: 'synthetic-account', to: '2027-12-31' })).toBe('soon,edge,later');
});
