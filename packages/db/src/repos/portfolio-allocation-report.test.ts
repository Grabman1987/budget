import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { allocationReport } from './portfolio-allocation-report';
import { portfolioSummary } from './portfolio-summary';
import { REPORT_TODAY, reportPortfolioFixture } from './portfolio-report-fixture';
import { seedBasics } from './test-helpers';

let opened: OpenedDatabase;

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  reportPortfolioFixture(opened);
});
afterEach(() => opened.close());

describe('allocationReport (report 4.2)', () => {
  it('shows the same classes, shares and breaches as the portfolio summary', () => {
    const report = allocationReport(opened.db, { today: REPORT_TODAY });
    const summary = portfolioSummary(opened.db, { today: REPORT_TODAY });
    expect(report.totalCents).toBe(summary.valueCents);
    expect(
      report.classes.map((c) => [
        c.assetClassId,
        c.valueCents,
        c.shareBp,
        c.targetBp,
        c.bandBp,
        c.breach,
      ]),
    ).toEqual(
      summary.classes.map((c) => [
        c.assetClassId,
        c.valueCents,
        c.shareBp,
        c.targetBp,
        c.bandBp,
        c.breach,
      ]),
    );
    expect(report.classes.reduce((a, c) => a + c.shareBp, 0)).toBe(10_000);
    expect(report.speculative).toEqual(summary.speculative);
    for (const c of report.classes)
      expect(c.products.reduce((a, p) => a + p.valueCents, 0)).toBe(c.valueCents);
  });

  it('lists products with their depots and 12-month time-weighted return', () => {
    const report = allocationReport(opened.db, { today: REPORT_TODAY });
    const world = report.classes.find((c) => c.assetClassId === 'world')!;
    expect(world.name).toBe('Aktien Welt');
    expect(world.products).toMatchObject([{ securityId: 'etf', depots: ['Depot A'] }]);
    expect(world.products[0]?.ttwror12).toEqual(expect.any(Number));
    const coin = report.classes
      .find((c) => c.assetClassId === 'spec')!
      .products.find((p) => p.securityId === 'coin')!;
    expect(coin.depots).toEqual(['Krypto B']);
  });

  it('splits regions to the cent and marks the part without region data', () => {
    const report = allocationReport(opened.db, { today: REPORT_TODAY });
    expect(report.regions.reduce((a, r) => a + r.valueCents, 0)).toBe(report.totalCents);
    expect(report.regions.reduce((a, r) => a + r.shareBp, 0)).toBe(10_000);
    const etf = report.classes.find((c) => c.assetClassId === 'world')!.products[0]!;
    const usa = report.regions.find((r) => r.region === 'USA')!;
    const usaEtf = usa.products.find((p) => p.securityId === 'etf')!;
    expect(Math.abs(usaEtf.valueCents - etf.valueCents * 0.6)).toBeLessThanOrEqual(1);
    // The coin has no region weights: it is the unassigned part, listed last.
    expect(report.regionsComplete).toBe(false);
    const last = report.regions[report.regions.length - 1]!;
    expect(last.region).toBeNull();
    expect(last.products.map((p) => p.securityId)).toEqual(['coin']);
  });

  it('builds Soll/Ist at the month ends with the versioned Soll', () => {
    const report = allocationReport(opened.db, { today: REPORT_TODAY });
    const history = report.history!;
    expect(history.dates[0]).toBe('2025-12-31');
    expect(history.dates.at(-1)).toBe(REPORT_TODAY);
    expect(history.dates).toContain('2026-05-31');
    for (let i = 0; i < history.dates.length; i++) {
      if (history.totalCents[i] === 0) continue;
      expect(history.classes.reduce((a, c) => a + c.istBp[i]!, 0)).toBe(10_000);
    }
    const world = history.classes.find((c) => c.assetClassId === 'world')!;
    const at = (date: string) => history.dates.indexOf(date);
    // Soll 70 % until 31.05., 60 % from 01.06. (a new version).
    expect(world.targetBp[at('2026-05-31')]).toBe(7_000);
    expect(world.targetBp[at('2026-06-30')]).toBe(6_000);
    // No Soll existed before 01.01.2026.
    expect(world.targetBp[at('2025-12-31')]).toBeNull();
    // The last point is today's table.
    const today = report.classes.find((c) => c.assetClassId === 'world')!;
    expect(world.istBp.at(-1)).toBe(today.shareBp);
    expect(world.breach.at(-1)).toBe(today.breach);
  });

  it('is empty without positions', () => {
    const empty = createTestDatabase();
    try {
      const report = allocationReport(empty.db, { today: REPORT_TODAY });
      expect(report).toMatchObject({ totalCents: 0, classes: [], regions: [], history: null });
    } finally {
      empty.close();
    }
  });
});
