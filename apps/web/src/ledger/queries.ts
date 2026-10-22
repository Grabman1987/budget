import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { addDays, todayInVienna } from '@budget/domain';
import {
  fetchAccounts,
  fetchBookings,
  fetchLookups,
  fetchPayees,
  fetchSeries,
  fetchSeriesBatch,
} from './api';
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

/** `seriesQuery` of every live account in one request (the Konten table's sparklines). */
export const seriesBatchQuery = (days: number, options?: { asOf?: string; quality?: true }) => {
  const to = options?.asOf ?? todayInVienna();
  const from = addDays(to, -days);
  return queryOptions({
    queryKey: [
      ...LEDGER_KEY,
      'series-batch',
      days,
      to,
      ...(options?.quality ? ['quality-v1'] : []),
    ],
    queryFn: () => fetchSeriesBatch(from, to, options?.quality ? { quality: true } : undefined),
  });
};

export const bookingsQuery = (filter: BookingFilter, cursor?: string, limit?: number) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'bookings', filter, cursor ?? null, limit ?? null],
    queryFn: () => fetchBookings(filter, cursor, limit),
  });

/** Future bookings are independent of loaded history pages, including dates beyond previews. */
export const futureBookingsQuery = (filter: BookingFilter, today: string) => {
  const from = filter.from && filter.from > today ? filter.from : addDays(today, 1);
  return queryOptions({
    queryKey: [...LEDGER_KEY, 'register-upcoming', filter, today],
    queryFn: async () => {
      const items = [] as Awaited<ReturnType<typeof fetchBookings>>['items'];
      let cursor: string | undefined;
      do {
        const page = await fetchBookings(
          { ...filter, from, sort: 'date', direction: 'asc' },
          cursor,
          200,
        );
        items.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return items;
    },
  });
};

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
export const bookingsInfiniteQuery = (filter: BookingFilter, limit?: number, nativeSummary = false) =>
  infiniteQueryOptions({
    queryKey: [...LEDGER_KEY, 'bookings', 'infinite', filter, limit ?? null, ...(nativeSummary ? ['native-summary-v1'] : [])],
    queryFn: ({ pageParam }) => fetchBookings(filter, pageParam, limit, nativeSummary),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
