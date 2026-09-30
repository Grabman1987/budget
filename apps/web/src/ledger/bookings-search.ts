import { BOOKING_FLAGS, BOOKING_STATUSES, type BookingFilter, type BookingSort } from './types';

/** URL parameters of Alle Buchungen (German names, linkable and reload-safe). */
export interface BookingsSearch {
  konto?: string | undefined;
  kategorie?: string | undefined;
  empfaenger?: string | undefined;
  status?: string | undefined;
  markierung?: string | undefined;
  von?: string | undefined;
  bis?: string | undefined;
  q?: string | undefined;
  sortierung?: string | undefined;
  richtung?: string | undefined;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined;
const day = (v: unknown): string | undefined =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
const oneOf = <T extends string>(v: unknown, list: ReadonlyArray<T>): T | undefined =>
  typeof v === 'string' && (list as ReadonlyArray<string>).includes(v) ? (v as T) : undefined;

const SORTS = ['date', 'amount', 'payee', 'account'] as const;

/** Route `validateSearch`: unknown or malformed values are dropped, never thrown. */
export function validateBookingsSearch(search: Record<string, unknown>): BookingsSearch {
  return {
    konto: text(search['konto']),
    kategorie: text(search['kategorie']),
    empfaenger: text(search['empfaenger']),
    status: oneOf(search['status'], BOOKING_STATUSES),
    markierung: oneOf(search['markierung'], [...BOOKING_FLAGS, 'none'] as const),
    von: day(search['von']),
    bis: day(search['bis']),
    q: text(search['q']),
    sortierung: oneOf(search['sortierung'], SORTS),
    richtung: oneOf(search['richtung'], ['asc', 'desc'] as const),
  };
}

/** The API filter belonging to the URL parameters. */
export function filterFromSearch(search: BookingsSearch): BookingFilter {
  return {
    accountId: search.konto,
    categoryId: search.kategorie,
    payeeId: search.empfaenger,
    status: oneOf(search.status, BOOKING_STATUSES),
    flag: oneOf(search.markierung, [...BOOKING_FLAGS, 'none'] as const),
    from: search.von,
    to: search.bis,
    q: search.q,
    sort: oneOf(search.sortierung, SORTS) as BookingSort | undefined,
    direction: oneOf(search.richtung, ['asc', 'desc'] as const),
  };
}

/** Is any filter (not sorting) set? */
export const hasFilter = (search: BookingsSearch): boolean =>
  Boolean(
    search.konto ||
    search.kategorie ||
    search.empfaenger ||
    search.status ||
    search.markierung ||
    search.von ||
    search.bis ||
    search.q,
  );
