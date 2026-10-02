import { cpiFetchedAt, cpiMonths, createTestDatabase, type Db } from '@budget/db';
import { MarketError, fixtureCpiMonths, type CpiSource, type MarketSources } from '@budget/market';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureFxSource, fixtureQuoteSource } from '@budget/market';
import { refreshCpi } from './refresh';

// Synthetic sources only: nothing here reaches the network.

let db: Db;
beforeEach(() => {
  db = createTestDatabase().db;
});

function sources(cpi: CpiSource | undefined): MarketSources {
  return { quotes: fixtureQuoteSource(), fx: fixtureFxSource(), cpi };
}
function counting(through: string, bump = 0) {
  const calls = { n: 0 };
  const source: CpiSource = {
    series: 'vpi-test',
    async monthly() {
      calls.n += 1;
      return fixtureCpiMonths(through).map((r) => ({ ...r, indexMicro: r.indexMicro + bump }));
    },
  };
  return { source, calls };
}

describe('refreshCpi', () => {
  it('reads the series once, stores every month with the fetch time and then leaves it alone for a month', async () => {
    const { source, calls } = counting('2025-12');
    const first = await refreshCpi(db, sources(source), {
      today: '2026-09-01',
      now: new Date('2026-09-01T21:30:00Z'),
    });
    expect(first).toEqual({ skipped: false, rows: 60, failed: null });
    expect(cpiFetchedAt(db, 'vpi-test')).toBe('2026-09-01T21:30:00.000Z');
    expect(Object.keys(cpiMonths(db, 'vpi-test').months)).toHaveLength(60);

    const sameDay = await refreshCpi(db, sources(source), { today: '2026-09-01' });
    const laterThisMonth = await refreshCpi(db, sources(source), {
      today: '2026-09-30',
      now: new Date('2026-09-30T21:30:00Z'),
    });
    expect(sameDay.skipped && laterThisMonth.skipped).toBe(true);
    expect(calls.n).toBe(1);
  });

  it('reads again once the stored series is older than a month and replaces the values', async () => {
    const { source, calls } = counting('2025-12');
    await refreshCpi(db, sources(source), {
      today: '2026-09-01',
      now: new Date('2026-09-01T21:30:00Z'),
    });
    const revised = counting('2026-01', 1_000);
    // 31 days after the first read.
    const day = '2026-10-01';
    const again = await refreshCpi(db, sources(revised.source), {
      today: day,
      now: new Date('2026-10-01T21:30:00Z'),
    });
    expect(again).toEqual({ skipped: false, rows: 61, failed: null });
    expect(calls.n).toBe(1);
    expect(revised.calls.n).toBe(1);
    const stored = cpiMonths(db, 'vpi-test');
    expect(Object.keys(stored.months)).toHaveLength(61);
    expect(stored.fetchedAt).toBe('2026-10-01T21:30:00.000Z');
    // Idempotent: the same read twice leaves 61 rows, not 122.
    const reread = counting('2026-01', 1_000);
    await refreshCpi(db, sources(reread.source), {
      today: '2026-11-15',
      now: new Date('2026-11-15T21:30:00Z'),
    });
    expect(Object.keys(cpiMonths(db, 'vpi-test').months)).toHaveLength(61);
  });

  it('keeps the stored series on a failure and only logs the error class', async () => {
    const { source } = counting('2025-12');
    await refreshCpi(db, sources(source), {
      today: '2026-01-05',
      now: new Date('2026-01-05T21:30:00Z'),
    });
    const logs: string[] = [];
    const broken: CpiSource = {
      series: 'vpi-test',
      async monthly() {
        throw new MarketError('http', '503 https://secret.example/path');
      },
    };
    const result = await refreshCpi(db, sources(broken), {
      today: '2026-03-01',
      log: (m) => logs.push(m),
    });
    expect(result).toEqual({ skipped: false, rows: 0, failed: 'http' });
    expect(logs).toEqual(['cpi: vpi-test failed (http)']);
    expect(Object.keys(cpiMonths(db, 'vpi-test').months)).toHaveLength(60);
    expect(cpiFetchedAt(db, 'vpi-test')).toBe('2026-01-05T21:30:00.000Z');
  });

  it('does nothing without a consumer price source', async () => {
    expect(await refreshCpi(db, sources(undefined), { today: '2026-09-01' })).toEqual({
      skipped: true,
      rows: 0,
      failed: null,
    });
  });
});
