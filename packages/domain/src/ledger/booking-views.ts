import { validateBookingsSearch, type BookingsSearch } from './bookings-search';

export const BOOKING_VIEW_LIMIT = 20;
export const BOOKING_VIEW_NAME_LIMIT = 40;
export const BOOKING_SEARCH_KEYS = ['basis', 'buchung', 'konto', 'kategorie', 'kategoriegruppe', 'empfaenger', 'status', 'markierung', 'von', 'bis', 'q', 'sortierung', 'richtung'] as const;
export type SavedBookingSearch = Pick<BookingsSearch, typeof BOOKING_SEARCH_KEYS[number]>;
export interface BookingViewInput { name: string; search: SavedBookingSearch }
export interface BookingView extends BookingViewInput { id: string }
export interface BookingViewsDocument { schemaVersion: 1; views: BookingView[] }
export interface BookingViewsState extends BookingViewsDocument { revision: string; unavailable: boolean }
export type BookingViewsChange = { kind: 'save'; view: BookingViewInput; id?: string } | { kind: 'delete'; id: string };
export interface BookingViewsWrite extends BookingViewsState { groupId: string; changed: boolean }

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));
export const bookingViewId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

/** Strict persistence uses the same validation as URLs, without silently dropping bad fields. */
export function savedBookingSearch(raw: unknown): SavedBookingSearch | null {
  if (!record(raw) || !keys(raw, BOOKING_SEARCH_KEYS)) return null;
  const parsed = validateBookingsSearch(raw);
  const search: SavedBookingSearch = {};
  for (const key of BOOKING_SEARCH_KEYS) if (Object.hasOwn(raw, key)) {
    if (typeof raw[key] !== 'string' || parsed[key] !== raw[key]) return null;
    Object.assign(search, { [key]: parsed[key] });
  }
  return search;
}

/** Capture only filter/sort fields, never panel/return/selection or result state. */
export function bookingSearchToSave(search: BookingsSearch): SavedBookingSearch {
  return Object.fromEntries(BOOKING_SEARCH_KEYS.filter((key) => search[key] !== undefined).map((key) => [key, search[key]]));
}

export function bookingViewInput(raw: unknown): BookingViewInput | null {
  if (!record(raw) || !keys(raw, ['name', 'search'])) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const search = savedBookingSearch(raw.search);
  return name && name.length <= BOOKING_VIEW_NAME_LIMIT && search ? { name, search } : null;
}

export function bookingViewsDocument(raw: unknown): BookingViewsDocument | null {
  if (!record(raw) || !keys(raw, ['schemaVersion', 'views']) || raw.schemaVersion !== 1 || !Array.isArray(raw.views) || raw.views.length > BOOKING_VIEW_LIMIT) return null;
  const views: BookingView[] = [];
  for (const value of raw.views) {
    if (!record(value) || !keys(value, ['id', 'name', 'search']) || !bookingViewId(value.id)) return null;
    const view = bookingViewInput({ name: value.name, search: value.search });
    if (!view) return null;
    views.push({ id: value.id, ...view });
  }
  if (new Set(views.map((view) => view.id)).size !== views.length || new Set(views.map((view) => view.name.toLowerCase())).size !== views.length) return null;
  return { schemaVersion: 1, views };
}
