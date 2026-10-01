import { describe, expect, it } from 'vitest';
import { bucketNetWorth, netWorthWindow, type NetWorthDayInput } from './networth-window';

// Three weeks and a bit from Fri 2026-08-28 (start day, value 1000,00) through 2026-09-20.
const day = (date: string, netWorthCents: number, ownCents: number, marketCents: number) => ({
  date,
  netWorthCents,
  ownCents,
  marketCents,
});

function sample(): NetWorthDayInput[] {
  const rows: NetWorthDayInput[] = [];
  let value = 100_000;
  for (let d = 29; d <= 31; d++) {
    value += 100;
    rows.push(day(`2026-08-${d}`, value, 100, 0));
  }
  for (let d = 1; d <= 20; d++) {
    value += 250;
    rows.push(day(`2026-09-${String(d).padStart(2, '0')}`, value, 200, 50));
  }
  return rows;
}

describe('netWorthWindow', () => {
  it('start + own + market = now, in exact cents', () => {
    const w = netWorthWindow(sample(), 100_000);
    expect(w.startCents).toBe(100_000);
    expect(w.ownCents).toBe(3 * 100 + 20 * 200);
    expect(w.marketCents).toBe(20 * 50);
    expect(w.nowCents).toBe(w.startCents + w.ownCents + w.marketCents);
    expect(w.deltaCents).toBe(w.nowCents - w.startCents);
  });

  it('refuses rows that do not add up (own + market must equal the change)', () => {
    const rows = sample();
    rows[5] = { ...rows[5]!, marketCents: rows[5]!.marketCents + 1 };
    expect(() => netWorthWindow(rows, 100_000)).toThrow(/does not add up/);
  });

  it('an empty window is just the start value', () => {
    expect(netWorthWindow([], 5_000)).toEqual({
      startCents: 5_000,
      ownCents: 0,
      marketCents: 0,
      nowCents: 5_000,
      deltaCents: 0,
    });
  });
});

describe('bucketNetWorth', () => {
  it('weeks: consecutive blocks of 7 days from the first day, the last block may be short', () => {
    const buckets = bucketNetWorth(sample(), 'week');
    expect(buckets.map((b) => [b.from, b.to])).toEqual([
      ['2026-08-29', '2026-09-04'],
      ['2026-09-05', '2026-09-11'],
      ['2026-09-12', '2026-09-18'],
      ['2026-09-19', '2026-09-20'],
    ]);
    expect(buckets[0]).toMatchObject({ ownCents: 3 * 100 + 4 * 200, marketCents: 4 * 50 });
  });

  it('months: calendar months, the first and last may be partial', () => {
    const buckets = bucketNetWorth(sample(), 'month');
    expect(buckets.map((b) => [b.from, b.to])).toEqual([
      ['2026-08-29', '2026-08-31'],
      ['2026-09-01', '2026-09-20'],
    ]);
    expect(buckets[1]).toMatchObject({ ownCents: 20 * 200, marketCents: 20 * 50 });
  });

  it('the buckets add up to the window totals', () => {
    for (const unit of ['week', 'month'] as const) {
      const buckets = bucketNetWorth(sample(), unit);
      const w = netWorthWindow(sample(), 100_000);
      expect(buckets.reduce((a, b) => a + b.ownCents, 0)).toBe(w.ownCents);
      expect(buckets.reduce((a, b) => a + b.marketCents, 0)).toBe(w.marketCents);
    }
  });
});
