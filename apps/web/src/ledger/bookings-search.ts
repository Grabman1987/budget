import { BOOKING_FLAGS, BOOKING_STATUSES, type BookingFilter, type BookingSort } from './types';

/** URL parameters of Alle Buchungen (German names, linkable and reload-safe). */
export interface BookingsSearch {
  buchung?: string | undefined;
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

const FILTER_KEYS = [
  'buchung',
  'konto',
  'kategorie',
  'empfaenger',
  'status',
  'markierung',
  'von',
  'bis',
] as const;
/** Search has its own field; sorting does not narrow the list. */
export const activeFilterKeys = (search: BookingsSearch) =>
  FILTER_KEYS.filter((key) => Boolean(search[key]));

/*
 * The same limits as the server's query schema (apps/server/src/api/schemas.ts), so a hand-edited
 * or stale link drops the bad value instead of ending on a 400 error page.
 */
const MAX_ID = 64;
const MAX_QUERY = 200;

/** A string, or a number the router parsed from a plain `?q=2024`. */
const raw = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
const text =
  (max: number) =>
  (v: unknown): string | undefined => {
    const s = raw(v);
    return s !== undefined && s !== '' && s.length <= max ? s : undefined;
  };
const id = text(MAX_ID);
const query = text(MAX_QUERY);
/** `YYYY-MM-DD` that is a real calendar day (no 2026-02-30). */
const day = (v: unknown): string | undefined =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v)
    ? v
    : undefined;
const oneOf = <T extends string>(v: unknown, list: ReadonlyArray<T>): T | undefined =>
  typeof v === 'string' && (list as ReadonlyArray<string>).includes(v) ? (v as T) : undefined;

const SORTS = ['date', 'amount', 'payee', 'account'] as const;

/** Route `validateSearch`: unknown or malformed values are dropped, never thrown. */
export function validateBookingsSearch(search: Record<string, unknown>): BookingsSearch {
  return {
    buchung: id(search['buchung']),
    konto: id(search['konto']),
    kategorie: id(search['kategorie']),
    empfaenger: id(search['empfaenger']),
    status: oneOf(search['status'], BOOKING_STATUSES),
    markierung: oneOf(search['markierung'], [...BOOKING_FLAGS, 'none'] as const),
    von: day(search['von']),
    bis: day(search['bis']),
    q: query(search['q']),
    sortierung: oneOf(search['sortierung'], SORTS),
    richtung: oneOf(search['richtung'], ['asc', 'desc'] as const),
  };
}

/** The API filter belonging to the URL parameters. */
export function filterFromSearch(search: BookingsSearch): BookingFilter {
  return {
    id: search.buchung,
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
    search.buchung ||
    search.konto ||
    search.kategorie ||
    search.empfaenger ||
    search.status ||
    search.markierung ||
    search.von ||
    search.bis ||
    search.q,
  );
