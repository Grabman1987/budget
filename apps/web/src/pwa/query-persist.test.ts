import { todayInVienna } from '@budget/domain';
import { describe, expect, it } from 'vitest';
import { isPersistedQuery } from './query-persist';

describe('isPersistedQuery', () => {
  const month = todayInVienna().slice(0, 7);

  it('persists the start-page reads', () => {
    expect(isPersistedQuery(['ledger', 'heute', month, 'payday'])).toBe(true);
    expect(isPersistedQuery(['ledger', 'accounts'])).toBe(true);
    expect(isPersistedQuery(['budget', month])).toBe(true);
    expect(isPersistedQuery(['goals', month])).toBe(true);
    expect(isPersistedQuery(['ledger', 'inbox', 'count'])).toBe(true);
    expect(isPersistedQuery(['ledger', 'portfolio-positions'])).toBe(true);
  });

  it('leaves old months, filtered reads and everything else out', () => {
    expect(isPersistedQuery(['ledger', 'heute', '2020-01', 'month'])).toBe(false);
    expect(isPersistedQuery(['budget', '2020-01'])).toBe(false);
    expect(isPersistedQuery(['budget', 'months', [month]])).toBe(false);
    expect(isPersistedQuery(['ledger', 'portfolio-positions', '2026-01-01'])).toBe(false);
    expect(isPersistedQuery(['ledger', 'bookings', {}, null, null])).toBe(false);
    expect(isPersistedQuery(['auth', 'status'])).toBe(false);
  });
});
