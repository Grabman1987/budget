import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog } from '../schema';
import { createEntity } from './entities';
import { security } from '../schema';
import {
  fxRateOnOrBefore,
  latestPriceOnOrBefore,
  priceSeries,
  upsertFxRate,
  upsertPrice,
} from './prices';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  createEntity(db, security, { id: 's1', name: 'ETF', kind: 'etf' }, { actor: 't' });
  createEntity(db, security, { id: 's2', name: 'Aktie', kind: 'stock' }, { actor: 't' });
});
afterEach(() => opened.close());

const p = (date: string, priceMicro: number, over = {}) => ({
  securityId: 's1',
  date,
  priceMicro,
  currency: 'EUR',
  source: 'yfinance' as const,
  ...over,
});

describe('prices', () => {
  it('upsert replaces the price of a day, including its source, without audit entries', () => {
    const before = db.select().from(auditLog).all().length;
    upsertPrice(db, p('2026-01-02', 100_000_000));
    upsertPrice(db, p('2026-01-02', 101_500_000, { source: 'manual' }));
    expect(priceSeries(db, 's1')).toEqual([
      {
        securityId: 's1',
        date: '2026-01-02',
        priceMicro: 101_500_000,
        currency: 'EUR',
        source: 'manual',
      },
    ]);
    expect(db.select().from(auditLog).all()).toHaveLength(before);
  });

  it('returns the series ascending, limited by from/to (inclusive) and per security', () => {
    for (const [d, v] of [
      ['2026-01-03', 3],
      ['2026-01-01', 1],
      ['2026-01-02', 2],
      ['2026-01-04', 4],
    ] as const) {
      upsertPrice(db, p(d, v));
    }
    upsertPrice(db, p('2026-01-02', 99, { securityId: 's2' }));
    expect(priceSeries(db, 's1').map((r) => r.priceMicro)).toEqual([1, 2, 3, 4]);
    expect(priceSeries(db, 's1', '2026-01-02', '2026-01-03').map((r) => r.date)).toEqual([
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(priceSeries(db, 's1', '2026-01-03').map((r) => r.date)).toEqual([
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(priceSeries(db, 's1', undefined, '2026-01-01').map((r) => r.date)).toEqual([
      '2026-01-01',
    ]);
  });

  it('finds the latest price on or before a date', () => {
    upsertPrice(db, p('2026-01-02', 2));
    upsertPrice(db, p('2026-01-10', 10));
    expect(latestPriceOnOrBefore(db, 's1', '2026-01-10')?.priceMicro).toBe(10);
    expect(latestPriceOnOrBefore(db, 's1', '2026-01-09')?.priceMicro).toBe(2);
    expect(latestPriceOnOrBefore(db, 's1', '2026-01-01')).toBeUndefined();
    expect(latestPriceOnOrBefore(db, 's2', '2026-02-01')).toBeUndefined();
  });

  it('validates integer micro-prices', () => {
    expect(() => upsertPrice(db, p('2026-01-02', 1.5))).toThrow(/integer/);
  });
});

describe('fx rates', () => {
  it('upserts and looks up the latest rate on or before a date per currency', () => {
    upsertFxRate(db, { date: '2026-01-02', currency: 'USD', rateMicro: 920_000 });
    upsertFxRate(db, { date: '2026-01-05', currency: 'USD', rateMicro: 930_000 });
    upsertFxRate(db, {
      date: '2026-01-05',
      currency: 'CHF',
      rateMicro: 1_050_000,
      source: 'manual',
    });
    upsertFxRate(db, { date: '2026-01-05', currency: 'USD', rateMicro: 935_000 });
    expect(fxRateOnOrBefore(db, 'USD', '2026-01-04')).toEqual({
      date: '2026-01-02',
      currency: 'USD',
      rateMicro: 920_000,
      source: 'ecb',
    });
    expect(fxRateOnOrBefore(db, 'USD', '2026-01-09')?.rateMicro).toBe(935_000);
    expect(fxRateOnOrBefore(db, 'CHF', '2026-01-09')?.source).toBe('manual');
    expect(fxRateOnOrBefore(db, 'USD', '2026-01-01')).toBeUndefined();
    expect(fxRateOnOrBefore(db, 'GBP', '2026-01-09')).toBeUndefined();
  });
});
