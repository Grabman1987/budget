import { createTestDatabase, schema, type Db } from '@budget/db';
import { isWeekday } from '@budget/market';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { sampleLedger } from './ledger/build';
import { dailyMarketRows } from './market';
import { seedDatabase } from './seed';

let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
});

describe('daily sample market data', () => {
  it('keeps every month-end price and every known USD rate exactly as the ledger has them', () => {
    const ledger = sampleLedger();
    const prices = new Map(
      db
        .select()
        .from(schema.price)
        .all()
        .map((p) => [`${p.securityId}|${p.date}`, p]),
    );
    for (const known of ledger.prices) {
      const stored = prices.get(`${known.securityId}|${known.date}`);
      expect(stored?.priceMicro, `${known.securityId} ${known.date}`).toBe(known.priceMicro);
      expect(stored?.source).toBe(known.source);
    }
    const rates = new Map(
      db
        .select()
        .from(schema.fxRate)
        .all()
        .map((r) => [`${r.currency}|${r.date}`, r.rateMicro]),
    );
    for (const known of ledger.fxRates)
      expect(rates.get(`${known.currency}|${known.date}`), known.date).toBe(known.rateMicro);
  });

  it('adds every weekday between the first and last known price for tracked securities', () => {
    const series = db
      .select()
      .from(schema.price)
      .where(eq(schema.price.securityId, 'sec-etfw'))
      .all()
      .map((p) => p.date)
      .sort();
    expect(series[0]).toBe('2023-09-30');
    const weekdays = series.filter(isWeekday);
    // Consecutive weekdays: the gap to the next is 1 day, or 3 over a weekend.
    const gaps = weekdays.slice(1).map((d, i) => Date.parse(d) - Date.parse(weekdays[i] as string));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(3 * 86_400_000);
    expect(series.length).toBeGreaterThan(780);
    expect(series.at(-1)).toBe('2026-09-17');
  });

  it('gives P2P loans no daily prices (valued by hand) and USD a daily rate series', () => {
    const p2p = db.select().from(schema.price).where(eq(schema.price.securityId, 'sec-p2p')).all();
    expect(p2p).toHaveLength(37);
    const usd = db.select().from(schema.fxRate).where(eq(schema.fxRate.currency, 'USD')).all();
    expect(usd.length).toBeGreaterThan(700);
    expect(usd.every((r) => r.rateMicro > 0 && r.source === 'ecb')).toBe(true);
  });

  it('is deterministic and leaves the ledger rows themselves alone', () => {
    const a = dailyMarketRows(sampleLedger());
    const b = dailyMarketRows(sampleLedger());
    expect(a).toEqual(b);
    expect(sampleLedger().prices.filter((p) => p.securityId === 'sec-etfw')).toHaveLength(37);
  });
});
