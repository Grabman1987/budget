import {
  createTestDatabase,
  marketAttempts,
  priceSeries,
  recordMarketAttempt,
  schema,
  upsertFxRate,
  type Db,
} from '@budget/db';
import { MarketError, type MarketSources, type QuoteSource } from '@budget/market';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshPrices } from './refresh';

let db: Db;
const TODAY = '2026-09-30';

const addSecurity = (over: Partial<typeof schema.security.$inferInsert> = {}) =>
  db
    .insert(schema.security)
    .values({ id: 's1', name: 'Synthetischer US-Fonds', kind: 'etf', symbol: 'SYN-US', ...over })
    .run();

const sourcesOf = (quotes: QuoteSource): MarketSources => ({
  quotes,
  fx: { history: async () => [] },
});

const usdSource = (quotes: Array<{ date: string; priceMicro: number }>): QuoteSource => ({
  id: 'yfinance',
  async history() {
    return quotes.map((q) => ({ ...q, sourceCurrency: 'USD' }));
  },
});

beforeEach(() => {
  db = createTestDatabase().db;
});

describe('#1203 ECB conversion of quotes in another currency', () => {
  it('converts with the ECB rate of the day, the last earlier one up to 5 days back, else skips the day', async () => {
    addSecurity({ quoteFxCurrency: 'USD' });
    upsertFxRate(db, { date: '2026-09-28', currency: 'USD', rateMicro: 900_000, source: 'ecb' });
    upsertFxRate(db, { date: '2026-09-29', currency: 'USD', rateMicro: 920_000, source: 'ecb' });
    const logs: string[] = [];
    const result = await refreshPrices(
      db,
      sourcesOf(
        usdSource([
          { date: '2026-09-20', priceMicro: 100_000_000 }, // 8 days after no rate: skipped
          { date: '2026-09-28', priceMicro: 100_000_000 }, // rate of the day
          { date: '2026-09-30', priceMicro: 110_000_000 }, // last earlier rate (09-29)
        ]),
      ),
      { today: TODAY, log: (m) => logs.push(m) },
    );
    const rows = priceSeries(db, 's1');
    expect(rows.map((r) => [r.date, r.priceMicro, r.currency])).toEqual([
      ['2026-09-28', 90_000_000, 'EUR'],
      ['2026-09-30', 101_200_000, 'EUR'],
    ]);
    expect(rows[0]).toMatchObject({
      sourceCurrency: 'USD',
      sourcePriceMicro: 100_000_000,
      fxRateMicro: 900_000,
    });
    expect(rows[1]).toMatchObject({ sourcePriceMicro: 110_000_000, fxRateMicro: 920_000 });
    expect(result.fxSkipped).toEqual([{ securityId: 's1', days: ['2026-09-20'] }]);
    expect(logs.join('\n')).not.toMatch(/USD|SYN/);
    expect(marketAttempts(db, 's1')[0]).toMatchObject({
      outcome: 'ok',
      detail: '2 Zeilen, 1 Tage ohne EZB-Kurs übersprungen',
    });
  });

  it('never stores a foreign-currency quote unconverted when the owner has not chosen conversion', async () => {
    addSecurity();
    upsertFxRate(db, { date: '2026-09-29', currency: 'USD', rateMicro: 920_000, source: 'ecb' });
    const result = await refreshPrices(
      db,
      sourcesOf(usdSource([{ date: '2026-09-29', priceMicro: 100_000_000 }])),
      { today: TODAY },
    );
    expect(priceSeries(db, 's1')).toEqual([]);
    expect(result.fxSkipped).toHaveLength(1);
  });

  it('writes the attempt history with the HTTP status and keeps the newest 30 per security', async () => {
    addSecurity();
    addSecurity({ id: 's2', name: 'Anderes Instrument', symbol: 'SYN-B' });
    const failing: QuoteSource = {
      id: 'yfinance',
      async history() {
        throw new MarketError('http', '503', undefined, 503);
      },
    };
    await refreshPrices(db, sourcesOf(failing), {
      today: TODAY,
      now: new Date('2026-09-30T01:00:00Z'),
    });
    expect(marketAttempts(db, 's1')).toMatchObject([
      { source: 'yfinance', outcome: 'http', httpStatus: 503 },
    ]);
    for (let i = 0; i < 40; i++)
      recordMarketAttempt(db, {
        securityId: 's1',
        source: 'ariva',
        attemptedAt: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T0${i % 10}:00:00Z`,
        outcome: 'empty',
        detail: 'keine Zeilen',
      });
    expect(
      db.select().from(schema.marketAttempt).where(eq(schema.marketAttempt.securityId, 's1')).all(),
    ).toHaveLength(30);
    expect(marketAttempts(db, 's2')).toHaveLength(1);
  });

  it('records "keine Zeilen" for an empty answer', async () => {
    addSecurity();
    const empty: QuoteSource = { id: 'ariva', history: async () => [] };
    await refreshPrices(db, sourcesOf(empty), { today: TODAY });
    expect(marketAttempts(db, 's1')[0]).toMatchObject({
      source: 'ariva',
      outcome: 'empty',
      httpStatus: null,
      detail: 'keine Zeilen',
    });
  });
});
