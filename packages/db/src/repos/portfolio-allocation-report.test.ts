import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { allocationReport } from './portfolio-allocation-report';
import { portfolioSummary } from './portfolio-summary';
import { REPORT_TODAY, reportPortfolioFixture } from './portfolio-report-fixture';
import { seedBasics } from './test-helpers';
import { portfolioAllocation } from './portfolio-allocation';
import { replaceExposureVersion } from './asset-exposure';

let opened: OpenedDatabase;

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  reportPortfolioFixture(opened);
});
afterEach(() => opened.close());

describe('allocationReport (report 4.2)', () => {
  it('lists dated target classes and assigned unheld securities without changing held cents', () => {
    const before = allocationReport(opened.db, { today: REPORT_TODAY });
    opened.sqlite.exec(`
      INSERT INTO asset_class (id, name) VALUES ('reserve', 'Reserve A');
      INSERT INTO asset_class_target (id, asset_class_id, valid_from, target_share_bp, band_bp)
        VALUES ('tr', 'reserve', '2026-06-01', 1000, 200);
      UPDATE asset_class_target SET target_share_bp=5000 WHERE id='t2w';
      INSERT INTO security (id, name, isin, kind, currency, allocation_included)
        VALUES ('unheld', 'Produkt Reserve', 'AT0000000011', 'other', 'EUR', 1),
               ('excluded', 'Produkt außerhalb', NULL, 'bond', 'EUR', 0),
               ('future', 'Produkt künftig', NULL, 'bond', 'EUR', 1);
    `);
    for (const id of ['unheld', 'excluded', 'future'])
      replaceExposureVersion(
        opened.db,
        id,
        {
          validFrom: id === 'future' ? '2026-10-01' : '2026-06-01',
          complete: true,
          source: 'synthetic',
          weights: [{ assetClassId: 'reserve', weightBp: 10000 }],
        },
        { actor: 'test' },
      );
    const report = allocationReport(opened.db, { today: REPORT_TODAY });
    const assignedSecurities = [
      {
        securityId: 'unheld',
        name: 'Produkt Reserve',
        isin: 'AT0000000011',
        kind: 'other',
        held: false,
      },
    ];
    expect(report.classes.find((c) => c.assetClassId === 'reserve')).toMatchObject({
      valueCents: 0,
      shareBp: 0,
      targetBp: 1000,
      deviationBp: -1000,
      assignedSecurities,
    });
    expect(
      report.compositionGroups.flatMap((g) => g.classes).find((c) => c.assetClassId === 'reserve'),
    ).toMatchObject({
      valueCents: 0,
      shareBp: 0,
      portfolioShareBp: 0,
      assignedSecurities,
    });
    expect(report.compositionClasses.find((c) => c.assetClassId === 'reserve')).toMatchObject({
      valueCents: 0,
      shareBp: 0,
      assignedSecurities,
    });
    expect(report.classifiedCents).toBe(before.classifiedCents);
    expect(report.compositionGroups.reduce((sum, g) => sum + g.valueCents, 0)).toBe(
      before.classifiedCents,
    );
    for (const cls of before.compositionClasses) {
      const after = report.compositionClasses.find((c) => c.assetClassId === cls.assetClassId)!;
      expect(after.products).toEqual(cls.products);
      expect(after.valueCents).toBe(cls.valueCents);
      expect(after.shareBp).toBe(cls.shareBp);
    }
    const live = portfolioAllocation(opened.db, REPORT_TODAY);
    expect(live.classes.find((c) => c.id === 'reserve')).toMatchObject({ assignedSecurities });
    expect(live.risk!.proposals).toContainEqual(
      expect.objectContaining({
        code: 'r13_under',
        assetClass: 'reserve',
        shareBp: 0,
      }),
    );
  });
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

it('shows 100% positive classified layers without negative cash or unknown positions; starts in the budget month', () => {
  opened.sqlite.exec(`UPDATE account SET opening_date='2026-01-01' WHERE on_budget=1;
    UPDATE account SET opening_balance_cents=-200000 WHERE id='depot-a';`);
  const report = allocationReport(opened.db, { today: REPORT_TODAY });
  expect(report.history!.dates[0]).toBe('2026-01-01');
  expect(report.compositionClasses.reduce((sum, c) => sum + c.shareBp, 0)).toBe(10000);
  expect(report.compositionClasses.every((c) => c.shareBp >= 0 && c.shareBp <= 10000)).toBe(true);
  expect(report.separatePositions).toContainEqual({
    name: 'Depot A',
    valueCents: -200000,
    reason: 'Negative Position',
  });
  expect(
    report.classifiedCents + report.separatePositions.reduce((sum, p) => sum + p.valueCents, 0),
  ).toBe(report.totalCents);
  for (let i = 0; i < report.history!.dates.length; i++)
    expect(report.history!.classes.reduce((sum, c) => sum + c.chartBp[i]!, 0)).toBe(10000);
});
