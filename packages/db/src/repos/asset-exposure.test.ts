import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  assetClass,
  auditLog,
  price,
  security,
  securityAssetExposure,
  securityExposureVersion,
} from '../schema';
import { history, undo } from './audit';
import { assetExposureOfSecurityAsOf, replaceExposureVersion } from './asset-exposure';
import { portfolioAllocation } from './portfolio-allocation';
import { allocationReport } from './portfolio-allocation-report';
import { portfolioPositions } from './portfolio-positions';
import { reportPortfolioFixture, REPORT_TODAY } from './portfolio-report-fixture';
import { portfolioSummary } from './portfolio-summary';
import { ruleInputs } from './rule-inputs';
import { savingsProposal } from './savings-plans';
import { createAssetClass, createSecurity, updateSecurity } from './securities';

let opened: OpenedDatabase;
const ctx = { actor: 'tester', groupId: 'change' };
beforeEach(() => {
  opened = createTestDatabase();
  reportPortfolioFixture(opened);
});
afterEach(() => opened.close());
const write = (
  validFrom: string,
  weights = [{ assetClassId: 'spec', weightBp: 10000 }],
  complete = true,
  groupId = 'change',
) =>
  replaceExposureVersion(
    opened.db,
    'etf',
    { validFrom, weights, complete, source: 'manual' },
    { ...ctx, groupId },
  );
const rows = () => ({
  versions: opened.db.select().from(securityExposureVersion).all(),
  members: opened.db.select().from(securityAssetExposure).all(),
});

describe('historical exposure foundation', () => {
  it('A01 a 2026 class change preserves 2025 Ist, whole values and regions', () => {
    const before = allocationReport(opened.db, { today: REPORT_TODAY });
    write('2026-01-01');
    const after = allocationReport(opened.db, { today: REPORT_TODAY });
    expect(after.history!.dates[0]).toBe('2025-12-31');
    expect(after.history!.classes.map((c) => c.istBp[0])).toEqual(
      before.history!.classes.map((c) => c.istBp[0]),
    );
    expect(after.history!.classes.find((c) => c.assetClassId === 'world')!.istBp[0]).toBe(7547);
    expect(after.totalCents).toBe(before.totalCents);
    expect(after.regions).toEqual(before.regions);
    expect(after.classes.find((c) => c.assetClassId === 'world')!.valueCents).toBe(0);
    expect(assetExposureOfSecurityAsOf(opened.db, 'etf', '2025-12-30').weights).toEqual([]);
  });

  it('A02 current positions, report, summary and R13 share literal weighted cent values', () => {
    createAssetClass(opened.db, { id: 'third', name: 'Dritte Klasse' }, ctx);
    opened.db.update(price).set({ priceMicro: 25250 }).where(eq(price.securityId, 'etf')).run();
    // Isolate a 40-unit snapshot at EUR 0.025250 = 101 cents.
    opened.sqlite.exec(
      "DELETE FROM trade WHERE security_id = 'etf'; DELETE FROM holding WHERE security_id != 'etf'; DELETE FROM trade WHERE security_id != 'etf';",
    );
    write('2025-12-31', [
      { assetClassId: 'world', weightBp: 6000 },
      { assetClassId: 'spec', weightBp: 3500 },
      { assetClassId: 'third', weightBp: 500 },
    ]);
    const live = portfolioAllocation(opened.db, REPORT_TODAY);
    const report = allocationReport(opened.db, { today: REPORT_TODAY });
    const summary = portfolioSummary(opened.db, { today: REPORT_TODAY });
    const positions = portfolioPositions(opened.db, REPORT_TODAY);
    const expected = { world: 61, spec: 35, third: 5 };
    expect(
      Object.fromEntries(live.risk!.allocation.rows.map((r) => [r.assetClass, r.valueCents])),
    ).toEqual(expected);
    expect(Object.fromEntries(report.classes.map((r) => [r.assetClassId, r.valueCents]))).toEqual(
      expected,
    );
    expect(Object.fromEntries(summary.classes.map((r) => [r.assetClassId, r.valueCents]))).toEqual(
      expected,
    );
    expect(Object.fromEntries(positions.classes.map((r) => [r.id, r.valueCents]))).toEqual(
      expected,
    );
    expect(
      ruleInputs(opened.db, REPORT_TODAY).positions.reduce((a, p) => a + p.valueCents, 0),
    ).toBe(101);
    expect(
      Object.fromEntries(
        ruleInputs(opened.db, REPORT_TODAY).positions.map((p) => [p.assetClass, p.valueCents]),
      ),
    ).toEqual(expected);
    expect(report.classes.flatMap((c) => c.products).reduce((a, p) => a + p.valueCents, 0)).toBe(
      101,
    );
    expect(report.regions.reduce((a, r) => a + r.valueCents, 0)).toBe(101);
    expect(summary.valueCents).toBe(101);
  });

  it('A03 invalid complete sums, duplicates, references and dates reject without audit or storage change', () => {
    const before = rows();
    const auditBefore = opened.db.select().from(auditLog).all();
    for (const weights of [
      [{ assetClassId: 'world', weightBp: 9999 }],
      [{ assetClassId: 'world', weightBp: 10001 }],
      [
        { assetClassId: 'world', weightBp: 5000 },
        { assetClassId: 'world', weightBp: 5000 },
      ],
      [{ assetClassId: 'absent', weightBp: 10000 }],
    ])
      expect(() => write('2026-01-01', weights)).toThrow();
    expect(() => write('2026-02-30')).toThrow('Wirksamkeitsdatum');
    expect(rows()).toEqual(before);
    expect(opened.db.select().from(auditLog).all()).toEqual(auditBefore);
    write('2026-01-01', [{ assetClassId: 'world', weightBp: 6000 }], false);
    const report = allocationReport(opened.db, { today: REPORT_TODAY });
    expect(report.classes.some((c) => c.assetClassId === null && c.valueCents > 0)).toBe(true);
    expect(report.classes.reduce((a, c) => a + c.valueCents, 0)).toBe(report.totalCents);
    write('2026-02-01', [], false);
    expect(assetExposureOfSecurityAsOf(opened.db, 'etf', '2026-02-01')).toMatchObject({
      complete: false,
      weights: [],
    });
  });

  it('A08 future exposure leaves current allocation, R13, regions and savings proposals unchanged (A07 n/a: targets untouched)', () => {
    const before = portfolioAllocation(opened.db, REPORT_TODAY);
    const plans = savingsProposal(opened.db, REPORT_TODAY);
    write('2027-01-01');
    expect(portfolioAllocation(opened.db, REPORT_TODAY)).toEqual(before);
    expect(savingsProposal(opened.db, REPORT_TODAY)).toEqual(plans);
    expect(assetExposureOfSecurityAsOf(opened.db, 'etf', '2027-01-01').weights).toEqual([
      { assetClassId: 'spec', weightBp: 10000 },
    ]);
  });

  it('class history treats a same-day purchase and reclassification as flows, never artificial return', () => {
    opened.sqlite.exec(
      "DELETE FROM trade; DELETE FROM holding WHERE security_id != 'etf'; UPDATE price SET price_micro = 100000000 WHERE security_id = 'etf'; INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents) VALUES ('same-day-buy', 'etf', 'depot-a', '2026-06-01', 'buy', 100000000, 10000);",
    );
    const before = portfolioSummary(opened.db, {
      today: REPORT_TODAY,
      period: 'YTD',
      includePerformanceHistory: true,
    });
    write('2026-06-01');
    const after = portfolioSummary(opened.db, {
      today: REPORT_TODAY,
      period: 'YTD',
      includePerformanceHistory: true,
    });
    expect(after.valueCents).toBe(410000);
    expect(after.performance).toEqual(before.performance);
    const classes = after.performanceHistory!.classes;
    expect(classes.find((c) => c.assetClassId === 'world')!.performance!.ttwror).toBeCloseTo(0);
    expect(classes.find((c) => c.assetClassId === 'spec')!.performance!.ttwror).toBeCloseTo(0);
    expect(classes.reduce((a, c) => a + c.valueCents, 0)).toBe(410000);
  });

  it('exposure change and same-day replacement undo/redo restore exact rows', () => {
    const before = rows();
    write('2026-01-01');
    const changed = rows();
    const undone = undo(opened.db, { groupId: 'change' }, { actor: 'tester' });
    expect(rows()).toEqual(before);
    undo(opened.db, { groupId: undone.groupId }, { actor: 'tester' });
    expect(rows()).toEqual(changed);
    write(
      '2026-01-01',
      [
        { assetClassId: 'world', weightBp: 6000 },
        { assetClassId: 'spec', weightBp: 4000 },
      ],
      true,
      'replace',
    );
    const replaced = rows();
    const undoneReplacement = undo(opened.db, { groupId: 'replace' }, { actor: 'tester' });
    expect(rows()).toEqual(changed);
    undo(opened.db, { groupId: undoneReplacement.groupId }, { actor: 'tester' });
    expect(rows()).toEqual(replaced);
    const member = rows().members.find((r) => r.source === 'manual')!;
    expect(() =>
      undo(
        opened.db,
        { auditId: history(opened.db, 'security_asset_exposure', member.id)[0]!.id },
        ctx,
        { force: true },
      ),
    ).toThrow('gesamte Aktion');
    expect(rows()).toEqual(replaced);
  });

  it('instrument classification writes a dated single exposure in the same undo group', () => {
    const before = rows();
    const oldSecurity = opened.db.select().from(security).where(eq(security.id, 'etf')).get();
    updateSecurity(
      opened.db,
      'etf',
      { assetClassId: 'spec', exposureValidFrom: '2026-09-17' },
      ctx,
    );
    expect(assetExposureOfSecurityAsOf(opened.db, 'etf', '2026-09-16').weights).toEqual([
      { assetClassId: 'world', weightBp: 10000 },
    ]);
    undo(opened.db, { groupId: 'change' }, { actor: 'tester' });
    expect(rows()).toEqual(before);
    expect(opened.db.select().from(security).where(eq(security.id, 'etf')).get()).toEqual(
      oldSecurity,
    );
  });

  it('new instruments default to today, and metadata updates preserve mixed exposures', () => {
    createSecurity(
      opened.db,
      { id: 'new', name: 'Neues Instrument', kind: 'etf', assetClassId: 'world' },
      ctx,
    );
    const v = opened.db
      .select()
      .from(securityExposureVersion)
      .where(eq(securityExposureVersion.securityId, 'new'))
      .get()!;
    expect(v.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    write('2026-01-01', [
      { assetClassId: 'world', weightBp: 6000 },
      { assetClassId: 'spec', weightBp: 4000 },
    ]);
    const before = rows();
    updateSecurity(opened.db, 'etf', { name: 'Umbenannt' }, { actor: 'tester' });
    expect(rows()).toEqual(before);
    expect(opened.db.select().from(assetClass).all()).toHaveLength(2);
  });
});
