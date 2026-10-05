import { createTestDatabase, priceSeries, schema, type Db } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { refreshMarket } from './timer';
import { createMarketSources } from './sources';

let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
});

vi.setConfig({ testTimeout: 120_000 });

describe('refresh on the seeded sample ledger (fixture sources, no network)', () => {
  it('continues the daily series after the sample end and is idempotent', async () => {
    const sources = createMarketSources(db, 'fixture', {});
    const before = priceSeries(db, 'sec-etfw');
    expect(db.select().from(schema.priceAudit).all()).toEqual([]);
    const staleItems = () =>
      db
        .select()
        .from(schema.inboxItem)
        .all()
        .filter((i) => i.kind === 'stale_value');
    const staleBefore = staleItems();
    const first = await refreshMarket(db, sources, '2026-09-30');
    // The sample ends on 2026-09-17: 18.-30.9. is 9 weekdays, for five tracked securities.
    expect(first.prices.tracked).toBe(9);
    expect(first.prices.failed).toEqual([]);
    expect(first.prices.bySource.yfinance.rows).toBe(
      5 * 9 +
        ['benchmark-ftse', 'benchmark-sp500', 'benchmark-nasdaq', 'benchmark-atx'].reduce(
          (sum, id) => sum + priceSeries(db, id).length,
          0,
        ),
    );
    expect(first.fx.bySource.ecb.rows).toBeGreaterThan(0);
    expect(first.fx.failed).toEqual([]);
    const auditAfterFirst = db.select().from(schema.priceAudit).all();
    expect(auditAfterFirst).toHaveLength(
      first.prices.bySource.yfinance.rows + first.prices.bySource.ariva.rows,
    );
    expect(
      auditAfterFirst.every((row) => row.oldPriceMicro === null && row.oldSource === null),
    ).toBe(true);
    const after = priceSeries(db, 'sec-etfw');
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)?.date).toBe('2026-09-30');

    const rows = db.select().from(schema.price).all().length;
    const fx = db.select().from(schema.fxRate).all().length;
    const second = await refreshMarket(db, sources, '2026-09-30');
    expect(second.prices).toMatchObject({ upToDate: 9, failed: [] });
    expect(db.select().from(schema.price).all()).toHaveLength(rows);
    expect(db.select().from(schema.fxRate).all()).toHaveLength(fx);
    expect(db.select().from(schema.priceAudit).all()).toEqual(auditAfterFirst);
    // The sample has one stale-value item of its own (the hand-valued P2P loans); no new ones.
    expect(staleItems()).toEqual(staleBefore);
  });
});
