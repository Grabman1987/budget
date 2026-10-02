import { createTestDatabase } from '@budget/db';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureFxSource, fixtureQuoteSource } from '@budget/market';
import { startDailyMarketTimer, viennaMinutes, type DailyTimer } from './timer';

let timer: DailyTimer | undefined;
afterEach(() => timer?.stop());

describe('daily market timer', () => {
  it('reads the Vienna wall clock, summer and winter time', () => {
    expect(viennaMinutes(new Date('2026-07-01T20:30:00Z'))).toBe(22 * 60 + 30);
    expect(viennaMinutes(new Date('2026-01-15T21:30:00Z'))).toBe(22 * 60 + 30);
    expect(viennaMinutes(new Date('2026-01-15T00:05:00Z'))).toBe(65);
  });

  it('runs once per Vienna day, from 22:30 on', async () => {
    const logs: string[] = [];
    timer = startDailyMarketTimer({
      db: createTestDatabase().db,
      sources: { quotes: fixtureQuoteSource(), fx: fixtureFxSource() },
      log: (m) => logs.push(m),
      checkEveryMs: 3_600_000,
    });
    expect(await timer.tick(new Date('2026-07-01T20:29:00Z'))).toBe(false);
    expect(await timer.tick(new Date('2026-07-01T20:30:00Z'))).toBe(true);
    expect(await timer.tick(new Date('2026-07-01T21:45:00Z'))).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(
      /^Market refresh: 0 price rows, 0 rate rows, 0 failed, price index unchanged$/,
    );
    // Next day it runs again.
    expect(await timer.tick(new Date('2026-07-02T20:31:00Z'))).toBe(true);
  });
});
