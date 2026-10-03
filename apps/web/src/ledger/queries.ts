import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { addDays, todayInVienna } from '@budget/domain';
import { fetchAccounts, fetchBookings, fetchLookups, fetchPayees, fetchSeries } from './api';
import type { BookingFilter } from './types';

/** Query keys and options of the ledger. Every write invalidates the `LEDGER_KEY` family. */
export const LEDGER_KEY = ['ledger'] as const;

export const accountsQuery = () =>
  queryOptions({ queryKey: [...LEDGER_KEY, 'accounts'], queryFn: () => fetchAccounts() });

/** End-of-day balances; `days` is the window length ending today. */
export const seriesQuery = (accountId: string, days: number) => {
  const to = todayInVienna();
  const from = addDays(to, -days);
  return queryOptions({
    queryKey: [...LEDGER_KEY, 'series', accountId, days, to],
    queryFn: () => fetchSeries(accountId, from, to),
  });
};

export const bookingsQuery = (filter: BookingFilter, cursor?: string, limit?: number) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'bookings', filter, cursor ?? null, limit ?? null],
    queryFn: () => fetchBookings(filter, cursor, limit),
  });

/** Pick lists change rarely; they refresh on focus like everything else but are kept a minute. */
export const lookupsQuery = (bookingId?: string) =>
  queryOptions({
    queryKey: bookingId ? ['ledger-lookups', bookingId] : ['ledger-lookups'],
    queryFn: () => fetchLookups(bookingId),
    staleTime: 60_000,
  });

export const payeesQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'payees'],
    queryFn: fetchPayees,
    staleTime: 60_000,
  });

/** Alle Buchungen and Einzelkonto: pages of the filtered list, loaded by cursor. */
export const bookingsInfiniteQuery = (filter: BookingFilter, limit?: number) =>
  infiniteQueryOptions({
    queryKey: [...LEDGER_KEY, 'bookings', 'infinite', filter, limit ?? null],
    queryFn: ({ pageParam }) => fetchBookings(filter, pageParam, limit),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
