import { describe, expect, it } from 'vitest';
import {
  activeFilterKeys,
  filterFromSearch,
  hasFilter,
  validateBookingsSearch,
} from './bookings-search';

it('counts removable filters including deep links, but keeps search and sorting separate', () => {
  expect(activeFilterKeys({ q: 'Muster', sortierung: 'amount', richtung: 'asc' })).toEqual([]);
  expect(
    activeFilterKeys({
      buchung: 'booking-synthetic',
      konto: 'account-synthetic',
      kategorie: 'none',
      empfaenger: 'payee-synthetic',
      status: 'pending',
      markierung: 'none',
      von: '2026-09-01',
      bis: '2026-09-30',
      q: 'Muster',
    }),
  ).toEqual(['buchung', 'konto', 'kategorie', 'empfaenger', 'status', 'markierung', 'von', 'bis']);
  expect(activeFilterKeys({ konto: '', status: undefined })).toEqual([]);
});

describe('validateBookingsSearch', () => {
  it('keeps valid values and drops malformed ones', () => {
    const search = validateBookingsSearch({
      konto: 'a1',
      status: 'pending',
      markierung: 'none',
      von: '2026-09-01',
      bis: 'gestern',
      sortierung: 'amount',
      richtung: 'sideways',
      q: '',
      extra: 'x',
    });
    expect(search).toMatchObject({
      konto: 'a1',
      status: 'pending',
      markierung: 'none',
      von: '2026-09-01',
      sortierung: 'amount',
    });
    expect(search.bis).toBeUndefined();
    expect(search.richtung).toBeUndefined();
    expect(search.q).toBeUndefined();
  });
  it('drops what the server would refuse: impossible days, overlong ids and searches', () => {
    const search = validateBookingsSearch({
      von: '2026-02-30',
      bis: '2026-02-28',
      konto: 'x'.repeat(65),
      kategorie: 'k'.repeat(64),
      q: 'q'.repeat(201),
    });
    expect(search.von).toBeUndefined();
    expect(search.bis).toBe('2026-02-28');
    expect(search.konto).toBeUndefined();
    expect(search.kategorie).toBe('k'.repeat(64));
    expect(search.q).toBeUndefined();
    // A plain `?q=2024` arrives as a number from the router's JSON parsing.
    expect(validateBookingsSearch({ q: 2024 }).q).toBe('2024');
  });
  it('maps to the API filter and tells filters from sorting', () => {
    const search = validateBookingsSearch({ konto: 'a1', von: '2026-09-01', sortierung: 'payee' });
    expect(filterFromSearch(search)).toMatchObject({
      accountId: 'a1',
      from: '2026-09-01',
      sort: 'payee',
    });
    expect(hasFilter(search)).toBe(true);
    expect(hasFilter(validateBookingsSearch({ sortierung: 'payee' }))).toBe(false);
  });
});

// Global result links narrow the existing list to one exact booking.
it('validates an exact booking result link and forwards its id to the list API', () => {
  expect(filterFromSearch(validateBookingsSearch({ buchung: 'b-result' }))).toMatchObject({
    id: 'b-result',
  });
  expect(validateBookingsSearch({ buchung: 'b'.repeat(65) }).buchung).toBeUndefined();
});

it('keeps only a bounded report-cell return link without changing the booking filter', () => {
  const ruecksprung = '/reports/einnahmen-ausgaben/buchungen?zeitraum=1J&zelle=inc&spalte=2024-02';
  const selected = validateBookingsSearch({
    buchung: 'synthetic-booking',
    von: '2024-02-01',
    bis: '2024-02-29',
    ruecksprung,
  });
  expect(selected.ruecksprung).toBe(ruecksprung);
  expect(filterFromSearch(selected)).toMatchObject({
    id: 'synthetic-booking',
    from: '2024-02-01',
    to: '2024-02-29',
  });
  for (const unsafe of [
    'https://example.invalid',
    '//example.invalid',
    '/konten/buchungen',
    ruecksprung + 'x'.repeat(2000),
  ]) {
    expect(validateBookingsSearch({ ruecksprung: unsafe }).ruecksprung).toBeUndefined();
  }
});
