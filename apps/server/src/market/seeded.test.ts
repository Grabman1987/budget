import { createTestDatabase, priceSeries, schema, type Db } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { beforeAll, describe, expect, it } from 'vitest';
import { refreshMarket } from './timer';
import { createMarketSources } from './sources';

let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
});

describe('refresh on the seeded sample ledger (fixture sources, no network)', () => {
  it('continues the daily series after the sample end and is idempotent', async () => {
    const sources = createMarketSources(db, 'fixture', {});
    const before = priceSeries(db, 'sec-etfw');
    const staleItems = () =>
      db
        .select()
        .from(schema.inboxItem)
        .all()
        .filter((i) => i.kind === 'stale_value');
    const staleBefore = staleItems();
    const first = await refreshMarket(db, sources, '2026-09-30');
    // The sample ends on 2026-09-17: 18.-30.9. is 9 weekdays, for five tracked securities.
    expect(first.prices.tracked).toBe(5);
    expect(first.prices.failed).toEqual([]);
    expect(first.prices.bySource.yfinance.rows).toBe(5 * 9);
    expect(first.fx.bySource.ecb.rows).toBeGreaterThan(0);
    expect(first.fx.failed).toEqual([]);
    const after = priceSeries(db, 'sec-etfw');
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)?.date).toBe('2026-09-30');

    const rows = db.select().from(schema.price).all().length;
    const fx = db.select().from(schema.fxRate).all().length;
    const second = await refreshMarket(db, sources, '2026-09-30');
    expect(second.prices).toMatchObject({ upToDate: 5, failed: [] });
    expect(db.select().from(schema.price).all()).toHaveLength(rows);
    expect(db.select().from(schema.fxRate).all()).toHaveLength(fx);
    expect(db.select().from(schema.priceAudit).all()).toHaveLength(0);
    // The sample has one stale-value item of its own (the hand-valued P2P loans); no new ones.
    expect(staleItems()).toEqual(staleBefore);
  });
});
