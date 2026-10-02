import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase, sqliteOf } from '../client';
import { auditLog, price, priceAudit } from '../schema';
import { history, undo } from './audit';
import { createEntity } from './entities';
import { security } from '../schema';
import {
  fxRateOnOrBefore,
  latestPriceOnOrBefore,
  priceSeries,
  setManualPrice,
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
  it('keeps imported history: a refresh never writes on or before the last imported day', () => {
    upsertPrice(db, p('2026-01-02', 100_000_000, { source: 'import' }));
    upsertPrice(db, p('2026-01-06', 103_000_000, { source: 'import' }));
    // On an imported day and in a gap before the last imported day: refused.
    expect(upsertPrice(db, p('2026-01-02', 1, { source: 'yfinance' }))).toBe(false);
    expect(upsertPrice(db, p('2026-01-03', 1, { source: 'ariva' }))).toBe(false);
    // After the last imported day a refresh writes as before.
    expect(upsertPrice(db, p('2026-01-07', 104_000_000, { source: 'yfinance' }))).toBe(true);
    // Manual wins over import, and an import replaces a refreshed price.
    expect(upsertPrice(db, p('2026-01-02', 99_000_000, { source: 'manual' }))).toBe(true);
    expect(upsertPrice(db, p('2026-01-02', 98_000_000, { source: 'import' }))).toBe(false);
    expect(priceSeries(db, 's1').map((r) => [r.date, r.priceMicro, r.source])).toEqual([
      ['2026-01-02', 99_000_000, 'manual'],
      ['2026-01-06', 103_000_000, 'import'],
      ['2026-01-07', 104_000_000, 'yfinance'],
    ]);
    // Another security is not affected.
    expect(upsertPrice(db, p('2026-01-03', 5, { securityId: 's2', source: 'yfinance' }))).toBe(
      true,
    );
  });

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

  it('undoes and redoes an initial manual price insertion', () => {
    const ctx = { actor: 'test', groupId: 'manual-insert' };
    const { groupId } = setManualPrice(
      db,
      { securityId: 's1', date: '2026-01-02', priceMicro: 100_000_000, currency: 'EUR' },
      ctx,
    );
    expect(history(db, 'price', 's1:2026-01-02')[0]).toMatchObject({
      action: 'create',
      before: null,
      after: { price_micro: 100_000_000, source: 'manual' },
      groupId,
    });

    const reverted = undo(db, { groupId }, { actor: 'test' });
    expect(priceSeries(db, 's1')).toEqual([]);
    undo(db, { groupId: reverted.groupId }, { actor: 'test' });
    expect(priceSeries(db, 's1')).toMatchObject([{ date: '2026-01-02', priceMicro: 100_000_000 }]);
  });

  it('undoes and redoes replacing a provider price while retaining price history', () => {
    upsertPrice(db, p('2026-01-02', 100_000_000));
    const result = setManualPrice(
      db,
      { securityId: 's1', date: '2026-01-02', priceMicro: 101_000_000, currency: 'EUR' },
      { actor: 'test', groupId: 'manual-replace' },
    );
    expect(result.price.source).toBe('manual');
    expect(db.select().from(auditLog).where(eq(auditLog.entityType, 'price')).all()).toHaveLength(
      1,
    );
    expect(db.select().from(priceAudit).all()).toMatchObject([
      {
        oldPriceMicro: 100_000_000,
        newPriceMicro: 101_000_000,
        oldSource: 'yfinance',
        newSource: 'manual',
      },
    ]);

    const reverted = undo(db, { groupId: result.groupId }, { actor: 'test' });
    expect(priceSeries(db, 's1')).toMatchObject([
      { date: '2026-01-02', priceMicro: 100_000_000, source: 'yfinance' },
    ]);
    undo(db, { groupId: reverted.groupId }, { actor: 'test' });
    expect(priceSeries(db, 's1')).toMatchObject([
      { date: '2026-01-02', priceMicro: 101_000_000, source: 'manual' },
    ]);
  });

  it('reverts successive manual edits in order and rejects undo of a stale edit', () => {
    const first = setManualPrice(
      db,
      { securityId: 's1', date: '2026-01-02', priceMicro: 100_000_000, currency: 'EUR' },
      { actor: 'test', groupId: 'first-manual' },
    );
    const second = setManualPrice(
      db,
      { securityId: 's1', date: '2026-01-02', priceMicro: 102_000_000, currency: 'EUR' },
      { actor: 'test', groupId: 'second-manual' },
    );
    expect(() => undo(db, { groupId: first.groupId }, { actor: 'test' })).toThrow(/changed after/);
    expect(priceSeries(db, 's1')[0]?.priceMicro).toBe(102_000_000);

    undo(db, { groupId: second.groupId }, { actor: 'test' });
    expect(priceSeries(db, 's1')[0]?.priceMicro).toBe(100_000_000);
    undo(db, { groupId: first.groupId }, { actor: 'test' });
    expect(priceSeries(db, 's1')).toEqual([]);
  });

  it('rolls back a manual quote when recording its audit entry fails', () => {
    sqliteOf(opened.db).exec(`
      CREATE TRIGGER reject_price_audit BEFORE INSERT ON audit_log
      WHEN NEW.entity_type = 'price'
      BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;
    `);
    expect(() =>
      setManualPrice(
        db,
        { securityId: 's1', date: '2026-01-02', priceMicro: 100_000_000, currency: 'EUR' },
        { actor: 'test', groupId: 'atomic-manual' },
      ),
    ).toThrow(/audit unavailable/);
    expect(priceSeries(db, 's1')).toEqual([]);
    expect(db.select().from(auditLog).where(eq(auditLog.entityType, 'price')).all()).toEqual([]);
    expect(db.select().from(price).all()).toEqual([]);
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
