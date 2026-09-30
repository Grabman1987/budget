import { describe, expect, it } from 'vitest';
import { filterFromSearch, hasFilter, validateBookingsSearch } from './bookings-search';

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
