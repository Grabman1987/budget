import { expect, it } from 'vitest';
import { BOOKING_SEARCH_KEYS, bookingSearchToSave, bookingViewInput, bookingViewsDocument, savedBookingSearch } from './booking-views';
import { validateBookingsSearch } from './bookings-search';

it('captures all thirteen literal URL fields without return paths, coercion or lost filter semantics', () => {
  const search = { basis: 'category-spending', buchung: 'booking-id', konto: 'account-id', kategorie: 'none', kategoriegruppe: 'group-id', empfaenger: 'payee-id', status: 'reconciled', markierung: 'purple', von: '2026-02-28', bis: '2026-10-02', q: '2024', sortierung: 'amount', richtung: 'asc' };
  expect(Object.keys(search)).toEqual([...BOOKING_SEARCH_KEYS]);
  expect(savedBookingSearch(search)).toEqual(search);
  expect(bookingSearchToSave(validateBookingsSearch({ ...search, ruecksprung: '/reports/einnahmen-ausgaben/buchungen?jahr=2026', panel: 'buchung', cursor: 'private' }))).toEqual(search);
  expect(validateBookingsSearch({ q: 2024, von: '2026-02-30', extra: 'ignored' })).toMatchObject({ q: '2024', von: undefined });
  expect(savedBookingSearch({ q: 2024 })).toBeNull();
  expect(savedBookingSearch({ konto: 'removed-account-id' })).toEqual({ konto: 'removed-account-id' });
});

it('rejects malformed or unknown persisted fields instead of broadening to the remaining filters', () => {
  for (const invalid of [
    { basis: 'other' }, { buchung: '' }, { konto: 'x'.repeat(65) }, { kategorie: 12 },
    { status: 'all' }, { markierung: 'black' }, { von: '2026-02-30' }, { bis: 'tomorrow' },
    { q: 'q'.repeat(201) }, { sortierung: 'balance' }, { richtung: 'sideways' },
    { cursor: 'x' }, { ruecksprung: '/reports' }, { panel: 'buchung' }, { selected: ['booking'] },
    { rows: [] }, { sumCents: 1234 }, { accountName: 'private' }, { konto: undefined },
  ]) expect(savedBookingSearch({ status: 'pending', ...invalid })).toBeNull();
  for (const flag of ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'none'])
    expect(savedBookingSearch({ markierung: flag })).toEqual({ markierung: flag });
  for (const sort of ['date', 'amount', 'payee', 'account']) expect(savedBookingSearch({ sortierung: sort })).toEqual({ sortierung: sort });
  expect(bookingViewInput({ name: '  Muster  ', search: {} })).toEqual({ name: 'Muster', search: {} });
  for (const name of ['', '  ', 'x'.repeat(41)]) expect(bookingViewInput({ name, search: {} })).toBeNull();
});

it('keeps corrupt, future or duplicate stored documents unavailable', () => {
  const view = { id: '81800000-0000-4000-8000-000000000001', name: 'Muster', search: { q: 'Muster' } };
  expect(bookingViewsDocument({ schemaVersion: 1, views: [view] })).toEqual({ schemaVersion: 1, views: [view] });
  for (const raw of [null, { schemaVersion: 2, views: [] }, { schemaVersion: 1, views: [view, view] },
    { schemaVersion: 1, views: [view, { ...view, id: '81800000-0000-4000-8000-000000000002', name: 'MUSTER' }] },
    { schemaVersion: 1, views: [{ ...view, id: 'bad' }] }, { schemaVersion: 1, views: [{ ...view, search: { cursor: 'x' } }] },
    { schemaVersion: 1, views: [], extra: 1 },
  ]) expect(bookingViewsDocument(raw)).toBeNull();
});
