import type { Db } from '@budget/db';
import { describe, expect, it } from 'vitest';
import { createMarketSources } from './sources';

const db = {} as Db;

describe('createMarketSources (live)', () => {
  it('uses Yahoo alone by default', () => {
    const s = createMarketSources(db, 'live', {});
    expect(s.quotes.id).toBe('yfinance');
    expect(s.fallbackQuotes).toBeUndefined();
  });

  it('makes Ariva the primary and Yahoo the fallback with BUDGET_ARIVA=1', () => {
    const s = createMarketSources(db, 'live', { BUDGET_ARIVA: '1' });
    expect(s.quotes.id).toBe('ariva');
    expect(s.fallbackQuotes?.id).toBe('yfinance');
  });
});
