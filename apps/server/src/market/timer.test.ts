import {
  createTestDatabase,
  lastMarketRun,
  lastSuccessfulMarketRun,
  priceStand,
  schema,
  type Db,
} from '@budget/db';
import {
  fixtureFxSource,
  fixtureQuoteSource,
  MarketError,
  type MarketSources,
  type QuoteSource,
} from '@budget/market';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_FAILED_PER_DAY,
  NIGHTLY_AT_MINUTES,
  nightlyDue,
  refreshMarket,
  startDailyMarketTimer,
  viennaMinutes,
  type DailyTimer,
} from './timer';

let timer: DailyTimer | undefined;
let db: Db;
afterEach(() => timer?.stop());
beforeEach(() => {
  db = createTestDatabase().db;
  db.insert(schema.security)
    .values({ id: 's1', name: 'Synthetischer ETF', kind: 'etf', symbol: 'SYN-A' })
    .run();
});

const fixtureSources = (): MarketSources => ({
  quotes: fixtureQuoteSource(),
  fx: fixtureFxSource(),
});
const brokenQuotes: QuoteSource = {
  id: 'ariva',
  async history() {
    throw new MarketError('timeout', 'https://secret.example/?token=abc');
  },
};
const start = (sources: MarketSources, logs: string[] = []) =>
  (timer = startDailyMarketTimer({
    db,
    sources,
    log: (m) => logs.push(m),
    checkEveryMs: 3_600_000,
  }));

// 2026-07-02 is a Thursday, summer time (UTC+2): 02:30 Vienna is 00:30 UTC.
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00Z`);

describe('nightly market timer', () => {
  it('advances the source hook even when the market run is already complete', async () => {
    const ticks: Date[] = [];
    timer = startDailyMarketTimer({
      db,
      sources: fixtureSources(),
      checkEveryMs: 3_600_000,
      log: () => {},
      onTick: async (now) => {
        ticks.push(now);
      },
    });
    const first = at('2026-07-01', '08:00');
    const second = at('2026-07-01', '08:01');
    expect(await timer.tick(first)).toBe(true);
    expect(await timer.tick(second)).toBe(false);
    expect(ticks).toEqual([first, second]);
  });
  it('reads the Vienna wall clock, summer and winter time', () => {
    expect(viennaMinutes(new Date('2026-07-01T20:30:00Z'))).toBe(22 * 60 + 30);
    expect(viennaMinutes(new Date('2026-01-15T21:30:00Z'))).toBe(22 * 60 + 30);
    expect(viennaMinutes(new Date('2026-01-15T00:05:00Z'))).toBe(65);
    expect(NIGHTLY_AT_MINUTES).toBe(150);
  });

  it('runs once a night from 02:30 Vienna, asks for the previous day and logs the run', async () => {
    const logs: string[] = [];
    start(fixtureSources(), logs);
    // The very first run is a catch-up, at any time of day.
    expect(await timer!.tick(at('2026-07-01', '08:00'))).toBe(true);
    expect(lastSuccessfulMarketRun(db)).toMatchObject({
      trigger: 'nightly',
      asOf: '2026-06-30',
      status: 'ok',
      failedCount: 0,
    });
    expect(await timer!.tick(at('2026-07-01', '20:00'))).toBe(false);
    // The night after: not before 02:30 Vienna (00:30 UTC in summer time), once.
    expect(await timer!.tick(at('2026-07-02', '00:29'))).toBe(false);
    expect(await timer!.tick(at('2026-07-02', '00:30'))).toBe(true);
    expect(await timer!.tick(at('2026-07-02', '01:45'))).toBe(false);
    expect(lastSuccessfulMarketRun(db)).toMatchObject({ asOf: '2026-07-01' });
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatch(
      /^Market refresh: \d+ price rows, 0 rate rows, 0 failed, price index unchanged$/,
    );
    // Winter time (UTC+1): the same wall clock, an hour later in UTC.
    expect(await timer!.tick(at('2026-12-02', '01:29'))).toBe(true); // months missed: catch-up
    expect(await timer!.tick(at('2026-12-03', '01:29'))).toBe(false);
    expect(await timer!.tick(at('2026-12-03', '01:30'))).toBe(true);
  });

  it('is idempotent: a second run writes nothing, and the Stand is the run time', async () => {
    const sources = fixtureSources();
    const first = await refreshMarket(db, sources, '2026-07-01', {
      trigger: 'nightly',
      clock: () => at('2026-07-02', '00:30'),
    });
    const rows = (r: typeof first) =>
      Object.values(r.prices.bySource).reduce((n, s) => n + s.rows, 0);
    expect(rows(first)).toBeGreaterThan(0);
    const second = await refreshMarket(db, sources, '2026-07-01', {
      clock: () => at('2026-07-02', '00:40'),
    });
    expect(rows(second)).toBe(0);
    expect(second.prices.upToDate).toBe(1);
    // "Stand ... Kurse HH:MM": the newest successful run, not the moment a price was written.
    expect(priceStand(db, '2026-07-01')).toEqual({
      priceDate: '2026-07-01',
      priceAt: '2026-07-02T00:40:00.000Z',
    });
    expect(lastMarketRun(db)).toMatchObject({ trigger: 'manual', priceRows: 0, status: 'ok' });
  });

  it('makes up a missed night at once, whatever the hour', async () => {
    await refreshMarket(db, fixtureSources(), '2026-06-27', {
      trigger: 'nightly',
      clock: () => at('2026-06-28', '00:30'),
    });
    // Last success on 28.06.: the 02:30 slot of 29.06. is still ahead at 02:29, gone at 10:00.
    expect(nightlyDue(db, at('2026-06-29', '00:29'))).toBe(false);
    expect(nightlyDue(db, at('2026-06-29', '08:00'))).toBe(true);
    // Two nights missed: due at any hour, even before 02:30.
    expect(nightlyDue(db, at('2026-06-30', '00:10'))).toBe(true);
  });

  it('backs off after failures (30 minutes, three a day) and logs error classes only', async () => {
    start({ quotes: brokenQuotes, fx: fixtureFxSource() });
    expect(await timer!.tick(at('2026-07-02', '00:30'))).toBe(true);
    expect(lastMarketRun(db)).toMatchObject({
      status: 'failed',
      failedCount: 1,
      errorClasses: 'timeout',
    });
    expect(JSON.stringify(lastMarketRun(db))).not.toMatch(/secret|token/);
    expect(lastSuccessfulMarketRun(db)).toBeUndefined();
    expect(await timer!.tick(at('2026-07-02', '00:50'))).toBe(false);
    expect(await timer!.tick(at('2026-07-02', '01:01'))).toBe(true);
    expect(await timer!.tick(at('2026-07-02', '01:40'))).toBe(true);
    expect(MAX_FAILED_PER_DAY).toBe(3);
    expect(await timer!.tick(at('2026-07-02', '03:00'))).toBe(false);
    // The next day it tries again.
    expect(await timer!.tick(at('2026-07-03', '00:30'))).toBe(true);
  });

  it('a partial run (one security failed, one written) is the Stand and is not retried', async () => {
    db.insert(schema.security)
      .values({ id: 's2', name: 'Zweiter', kind: 'etf', symbol: 'SYN-B' })
      .run();
    let calls = 0;
    const flaky: QuoteSource = {
      id: 'yfinance',
      async history(ref, from, to) {
        if (++calls === 1) throw new MarketError('http', '503');
        return fixtureQuoteSource().history(ref, from, to);
      },
    };
    start({ quotes: flaky, fx: fixtureFxSource() });
    expect(await timer!.tick(at('2026-07-02', '08:00'))).toBe(true);
    expect(lastSuccessfulMarketRun(db)).toMatchObject({ status: 'partial', failedCount: 1 });
    expect(await timer!.tick(at('2026-07-02', '09:00'))).toBe(false);
  });
});
