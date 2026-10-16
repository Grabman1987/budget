import {
  createTestDatabase,
  netWorthAsOf,
  netWorthDaily,
  portfolioFlows,
  valuationSeries,
  type Db,
} from '@budget/db';
import { addDays, periodWindow, windowPerformance, type Valuation } from '@budget/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from './seed';

const FROM = '2023-10-01';
const TODAY = '2026-09-17';
let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
});

describe('daily series of the seeded sample ledger', () => {
  it('the daily net worth equals netWorthAsOf on 50 days and ends at 84.730,00 EUR', () => {
    const daily = netWorthDaily(db, FROM, TODAY);
    expect(daily.at(-1)?.netWorthCents).toBe(8_473_000);
    let s = 12345;
    for (let i = 0; i < 50; i++) {
      s = (s * 9301 + 49297) % 233280;
      const row = daily[Math.floor((s / 233280) * daily.length)]!;
      expect(row.netWorthCents, row.date).toBe(netWorthAsOf(db, row.date).totalCents);
    }
    const last = daily.at(-1)!;
    const baseline = netWorthAsOf(db, addDays(FROM, -1)).totalCents;
    expect(last.cumulativeMarketCents + last.cumulativeOwnCents).toBe(
      last.netWorthCents - baseline,
    );
  });

  it('portfolio figures apply PP timing and pre-tax return flows to the unchanged sample ledger', () => {
    const s = valuationSeries(db, { from: FROM, to: TODAY });
    const series: Valuation[] = s.days.map((date, i) => ({ date, valueCents: s.totalCents[i]! }));
    const flows = portfolioFlows(db, { from: FROM, to: TODAY });
    const returnFlows = portfolioFlows(db, { from: FROM, to: TODAY, taxBasis: 'before-tax' });
    const irrFlows = portfolioFlows(db, { from: FROM, to: TODAY, taxBasis: 'pp-irr' });
    const figures = (period: '3M' | 'YTD' | '1J' | '3J') =>
      windowPerformance({ series, flows, returnFlows, irrFlows }, periodWindow(period, TODAY));
    // Independent PP examples establish the method; this pins the unchanged synthetic ledger.
    expect(figures('3J').ttwror).toBeCloseTo(0.3806630473072903, 9);
    expect(figures('YTD').ttwror).toBeCloseTo(0.06, 2);
    expect(figures('3M').ttwror).toBeCloseTo(0.024, 2);
    const all = figures('3J');
    expect(all.endValueCents).toBe(8_800_000);
    expect(all.xirr).toBeGreaterThan(0.1);
    expect(all.xirr).toBeLessThan(0.13);
    // Gain = end - start - contributions, in integer cents.
    expect(all.gainCents).toBe(all.endValueCents - all.startValueCents - all.contributionsCents);
  });
});
