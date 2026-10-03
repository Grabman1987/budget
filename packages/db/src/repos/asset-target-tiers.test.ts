import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { price } from '../schema';
import {
  activeTargetsAsOf,
  investmentSumAccountIds,
  investmentSumAsOf,
  listTargetTiers,
  setTargetTiers,
  targetTiersDiffer,
  type TargetTierInput,
} from './asset-target-tiers';
import { undoAuditGroups } from './operator-ops';
import { portfolioAllocation } from './portfolio-allocation';
import { allocationReport } from './portfolio-allocation-report';
import { REPORT_TODAY, reportPortfolioFixture } from './portfolio-report-fixture';
import { portfolioSummary } from './portfolio-summary';
import { ruleInputs } from './rule-inputs';
import { createAssetClass, deleteAssetClass } from './securities';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
  reportPortfolioFixture(opened);
});
afterEach(() => opened.close());

const tiers = (lowUpTo: number): TargetTierInput[] => [
  {
    upToCents: lowUpTo,
    targets: [
      { assetClassId: 'world', targetShareBp: 9_000 },
      { assetClassId: 'spec', targetShareBp: 1_000, bandBp: 200 },
    ],
  },
  {
    upToCents: null,
    targets: [
      { assetClassId: 'world', targetShareBp: 5_000 },
      { assetClassId: 'spec', targetShareBp: 5_000 },
    ],
  },
];

describe('setTargetTiers', () => {
  it('stores tiers lowest threshold first with their sums', () => {
    setTargetTiers(db, [...tiers(2_000_000)].reverse(), testCtx);
    const stored = listTargetTiers(db);
    expect(stored.map((t) => [t.upToCents, t.sumBp])).toEqual([
      [2_000_000, 10_000],
      [null, 10_000],
    ]);
    expect(stored[0]!.shares).toEqual([
      { assetClassId: 'world', targetShareBp: 9_000, bandBp: 0 },
      { assetClassId: 'spec', targetShareBp: 1_000, bandBp: 200 },
    ]);
  });

  it.each([
    [
      'a tier that does not add up',
      [{ upToCents: 1, targets: [{ assetClassId: 'world', targetShareBp: 9_000 }] }],
      'add up to 9000',
    ],
    [
      'an unknown asset class',
      [{ upToCents: 1, targets: [{ assetClassId: 'nope', targetShareBp: 10_000 }] }],
      'nope',
    ],
    [
      'a class twice in one tier',
      [
        {
          upToCents: 1,
          targets: [
            { assetClassId: 'world', targetShareBp: 5_000 },
            { assetClassId: 'world', targetShareBp: 5_000 },
          ],
        },
      ],
      'twice',
    ],
    [
      'two open tiers',
      [
        { upToCents: null, targets: [{ assetClassId: 'world', targetShareBp: 10_000 }] },
        { upToCents: null, targets: [{ assetClassId: 'world', targetShareBp: 10_000 }] },
      ],
      'only one tier can be open',
    ],
    [
      'a negative threshold',
      [{ upToCents: -1, targets: [{ assetClassId: 'world', targetShareBp: 10_000 }] }],
      '0 or more',
    ],
  ] as const)('refuses %s and writes nothing', (_name, input, message) => {
    expect(() => setTargetTiers(db, input as unknown as TargetTierInput[], testCtx)).toThrow(
      message,
    );
    expect(listTargetTiers(db)).toEqual([]);
  });

  it('knows when nothing would change and does not write then', () => {
    setTargetTiers(db, tiers(2_000_000), testCtx);
    expect(targetTiersDiffer(db, tiers(2_000_000))).toBe(false);
    expect(targetTiersDiffer(db, tiers(3_000_000))).toBe(true);
    const [low, open] = tiers(2_000_000);
    const changed: TargetTierInput[] = [
      {
        upToCents: low!.upToCents,
        targets: [
          { assetClassId: 'world', targetShareBp: 9_000 },
          { assetClassId: 'spec', targetShareBp: 1_000, bandBp: 300 },
        ],
      },
      open!,
    ];
    expect(targetTiersDiffer(db, changed)).toBe(true);
  });

  it('replaces the set in one audit group and one undo restores the previous set', () => {
    setTargetTiers(db, tiers(2_000_000), testCtx);
    const groupId = 'replace-group';
    setTargetTiers(db, tiers(3_000_000), { ...testCtx, groupId });
    expect(listTargetTiers(db).map((t) => t.upToCents)).toEqual([3_000_000, null]);
    undoAuditGroups(db, [groupId], testCtx);
    expect(listTargetTiers(db).map((t) => t.upToCents)).toEqual([2_000_000, null]);
    expect(listTargetTiers(db)[0]!.shares[1]).toMatchObject({ targetShareBp: 1_000, bandBp: 200 });
  });

  it('keeps an asset class that is part of a target set from being deleted', () => {
    createAssetClass(db, { id: 'extra', name: 'Zusatz', sortOrder: 9 }, testCtx);
    setTargetTiers(
      db,
      [
        {
          upToCents: null,
          targets: [
            { assetClassId: 'world', targetShareBp: 9_000 },
            { assetClassId: 'extra', targetShareBp: 1_000 },
          ],
        },
      ],
      testCtx,
    );
    expect(() => deleteAssetClass(db, 'extra', testCtx)).toThrow(/target sets/);
    setTargetTiers(db, [], testCtx);
    expect(() => deleteAssetClass(db, 'extra', testCtx)).not.toThrow();
  });

  it('an empty list removes every tier', () => {
    setTargetTiers(db, tiers(2_000_000), testCtx);
    setTargetTiers(db, [], testCtx);
    expect(listTargetTiers(db)).toEqual([]);
  });
});

describe('investment sum', () => {
  it('selects investment accounts and the non-budget cash accounts linked to them', () => {
    const accounts = [
      {
        id: 'depot',
        role: 'investment',
        onBudget: false,
        openingDate: '2025-01-01',
        referenceAccountId: 'cash',
      },
      {
        id: 'cash',
        role: 'reserve',
        onBudget: false,
        openingDate: '2025-01-01',
        referenceAccountId: null,
      },
      {
        id: 'giro',
        role: 'budget',
        onBudget: true,
        openingDate: '2025-01-01',
        referenceAccountId: null,
      },
      {
        id: 'late',
        role: 'investment',
        onBudget: false,
        openingDate: '2027-01-01',
        referenceAccountId: 'giro',
      },
      {
        id: 'other',
        role: 'reserve',
        onBudget: false,
        openingDate: '2025-01-01',
        referenceAccountId: null,
      },
    ];
    expect(investmentSumAccountIds(accounts, '2026-01-01').sort()).toEqual(['cash', 'depot']);
    // A budget account stays out even when an investment account settles through it.
    const viaGiro = accounts.map((a) =>
      a.id === 'depot' ? { ...a, referenceAccountId: 'giro' } : a,
    );
    expect(investmentSumAccountIds(viaGiro, '2026-01-01')).toEqual(['depot']);
  });

  it('is the market value of the depots plus the signed balance of their cash account', () => {
    const holdings = portfolioSummary(db, { today: REPORT_TODAY }).valueCents;
    expect(investmentSumAsOf(db, REPORT_TODAY)).toBe(holdings);
    // Investment cash account with a negative balance, linked as Verrechnungskonto of depot A.
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents, sort_order)
        VALUES ('cash-a', 'Verrechnung A', 'checking', 'reserve', 0, '2025-12-31', -250000, 20);
      UPDATE account SET reference_account_id = 'cash-a' WHERE id = 'depot-a';
      UPDATE account SET reference_account_id = 'giro' WHERE id = 'depot-b';`);
    expect(investmentSumAsOf(db, REPORT_TODAY)).toBe(holdings - 250_000);
  });

  it('is unavailable when a held security has no quote', () => {
    db.delete(price).where(eq(price.securityId, 'coin')).run();
    expect(investmentSumAsOf(db, REPORT_TODAY)).toBeNull();
  });
});

describe('activeTargetsAsOf', () => {
  it('uses the dated versions without tiers', () => {
    const active = activeTargetsAsOf(db, REPORT_TODAY);
    expect(active.source).toBe('dated');
    expect(active.tier).toBeNull();
    expect(active.targets.map((t) => [t.assetClassId, t.targetShareBp, t.validFrom])).toEqual([
      ['world', 6_000, '2026-06-01'],
      ['spec', 4_000, '2026-06-01'],
    ]);
  });

  it('chooses the tier by the investment sum', () => {
    const sum = investmentSumAsOf(db, REPORT_TODAY)!;
    setTargetTiers(db, tiers(sum), testCtx);
    const low = activeTargetsAsOf(db, REPORT_TODAY);
    expect(low).toMatchObject({
      source: 'tiers',
      tier: { upToCents: sum, position: 1, count: 2 },
      investmentSumCents: sum,
    });
    expect(low.targets.map((t) => t.targetShareBp)).toEqual([9_000, 1_000]);
    // One cent below the threshold of the first tier moves to the open tier.
    setTargetTiers(db, tiers(sum - 1), testCtx);
    const high = activeTargetsAsOf(db, REPORT_TODAY);
    expect(high.tier).toMatchObject({ upToCents: null, position: 2 });
    expect(high.targets.map((t) => t.targetShareBp)).toEqual([5_000, 5_000]);
  });

  it('falls back to the dated versions when the sum cannot be valued', () => {
    setTargetTiers(db, tiers(1), testCtx);
    db.delete(price).where(eq(price.securityId, 'coin')).run();
    const active = activeTargetsAsOf(db, REPORT_TODAY);
    expect(active).toMatchObject({ source: 'dated', sumUnavailable: true, tier: null });
    expect(active.targets).toHaveLength(2);
  });

  it('a negative sum belongs to the lowest tier', () => {
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents, sort_order)
        VALUES ('cash-a', 'Verrechnung A', 'checking', 'reserve', 0, '2025-12-31', -90000000, 20);
      UPDATE account SET reference_account_id = 'cash-a' WHERE id = 'depot-a';`);
    setTargetTiers(db, tiers(0), testCtx);
    expect(investmentSumAsOf(db, REPORT_TODAY)!).toBeLessThan(0);
    expect(activeTargetsAsOf(db, REPORT_TODAY).tier).toMatchObject({ position: 1 });
  });
});

describe('consumers of the active Soll-Allocation', () => {
  it('portfolio allocation shows the tier targets and which tier is active', () => {
    const sum = investmentSumAsOf(db, REPORT_TODAY)!;
    setTargetTiers(db, tiers(sum + 1_000_000), testCtx);
    const view = portfolioAllocation(db, REPORT_TODAY);
    expect(view.targetSet).toMatchObject({
      source: 'tiers',
      upToCents: sum + 1_000_000,
      position: 1,
      count: 2,
      investmentSumCents: sum,
    });
    expect(view.targetSet.tierLabel).toMatch(/^bis /);
    expect(view.classes.map((c) => [c.id, c.targetBp, c.bandBp, c.validFrom])).toEqual([
      ['world', 9_000, 500, null],
      ['spec', 1_000, 200, null],
    ]);
  });

  it('the allocation report and its history use the tier', () => {
    const sum = investmentSumAsOf(db, REPORT_TODAY)!;
    setTargetTiers(db, tiers(sum), testCtx);
    const report = allocationReport(db, { today: REPORT_TODAY });
    expect(report.targetSet.position).toBe(1);
    expect(report.classes.find((c) => c.assetClassId === 'world')?.targetBp).toBe(9_000);
    const history = report.history!;
    expect(history.tierLabels).toHaveLength(history.dates.length);
    expect(history.tierLabels.every((label) => label !== null)).toBe(true);
    expect(history.classes.find((c) => c.assetClassId === 'world')?.targetBp.at(-1)).toBe(9_000);
  });

  it('without tiers the report keeps the dated targets and shows no tier', () => {
    const report = allocationReport(db, { today: REPORT_TODAY });
    expect(report.targetSet).toMatchObject({ source: 'dated', tierLabel: null });
    expect(report.history!.tierLabels.every((label) => label === null)).toBe(true);
  });

  it('rule R13 reads the tier through the rule inputs', () => {
    const sum = investmentSumAsOf(db, REPORT_TODAY)!;
    setTargetTiers(db, tiers(sum), testCtx);
    const inputs = ruleInputs(db, REPORT_TODAY);
    expect(inputs.classTargets.map((t) => [t.assetClass, t.targetBp])).toEqual([
      ['world', 9_000],
      ['spec', 1_000],
    ]);
    expect(inputs.classTargetTier).toMatchObject({
      position: 1,
      count: 2,
      investmentSumCents: sum,
    });
    // Dated versions again after the tiers are gone.
    setTargetTiers(db, [], testCtx);
    const plain = ruleInputs(db, REPORT_TODAY);
    expect(plain.classTargets.map((t) => t.targetBp)).toEqual([6_000, 4_000]);
    expect(plain.classTargetTier).toBeNull();
  });
});
