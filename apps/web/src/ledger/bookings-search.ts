import { BOOKING_FLAGS, BOOKING_STATUSES, type BookingFilter, type BookingSort } from './types';

import { BOOKING_SEARCH_SORTS as SORTS, type BookingsSearch } from '@budget/domain';
export { validateBookingsSearch, type BookingsSearch } from '@budget/domain';

const FILTER_KEYS = [
  'buchung',
  'konto',
  'kategorie',
  'kategoriegruppe',
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
const oneOf = <T extends string>(v: unknown, list: ReadonlyArray<T>): T | undefined =>
  typeof v === 'string' && (list as ReadonlyArray<string>).includes(v) ? (v as T) : undefined;

/** The API filter belonging to the URL parameters. */
export function filterFromSearch(search: BookingsSearch): BookingFilter {
  return {
    basis: search.kategoriegruppe
      ? 'category-spending'
      : search.kategorie
        ? search.basis
        : undefined,
    id: search.buchung,
    accountId: search.konto,
    categoryId: search.kategorie,
    categoryGroupId: search.kategoriegruppe,
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
    search.kategoriegruppe ||
    search.empfaenger ||
    search.status ||
    search.markierung ||
    search.von ||
    search.bis ||
    search.q,
  );
