import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { assetClass, assetClassTarget, assetTargetVersion, price } from '../schema';
import { assetClassesSettings } from './asset-classes-settings';
import {
  createAssetClass,
  updateAssetClass,
  deleteAssetClass,
  restoreAssetClass,
  setTargets,
  targetsAsOf,
  listTargetVersions,
} from './securities';
import { undo } from './audit';
import { resolvePortfolioRiskPolicy } from './portfolio-risk-policy';
import { portfolioAllocation } from './portfolio-allocation';
import { allocationReport } from './portfolio-allocation-report';
import { ruleInputs } from './rule-inputs';
import { ensureDefaultRules } from './rules';
import { savingsProposal } from './savings-plans';
let opened: OpenedDatabase;
const ctx = (groupId: string) => ({ actor: 'tester', groupId });
const a = [{ assetClassId: 'a', targetShareBp: 10000 }];
const b = [{ assetClassId: 'b', targetShareBp: 10000 }];
beforeEach(() => {
  opened = createTestDatabase();
  opened.sqlite
    .exec(`INSERT INTO asset_class (id,name,sort_order) VALUES ('a','Aktien',1),('b','Reserve',2);
    INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents,allocation_asset_class_id) VALUES ('depot','Depot A','brokerage','investment',0,'2025-12-31',-1,'b');
    INSERT INTO security (id,name,kind,asset_class_id) VALUES ('s','Fonds A','etf','a'),('s2','Fonds B','etf','b');
    INSERT INTO holding (id,security_id,account_id,as_of,units_e8,cost_basis_cents) VALUES ('h','s','depot','2025-12-31',100000000,1000000);
    INSERT INTO price (security_id,date,price_micro,currency,source) VALUES
    ('s','2025-12-31',10000000000,'EUR','manual'),('s','2026-01-31',10000000000,'EUR','manual'),('s','2026-02-28',10000000000,'EUR','manual');
    INSERT INTO security_exposure_version (id,security_id,valid_from,complete,source) VALUES ('v','s','2025-12-31',1,'synthetic'),('v2','s2','2025-12-31',1,'synthetic');
    INSERT INTO security_asset_exposure (id,version_id,security_id,asset_class_id,weight_bp,valid_from,source) VALUES ('e','v','s','a',10000,'2025-12-31','synthetic'),('e2','v2','s2','b',10000,'2025-12-31','synthetic');
    INSERT INTO booking (id,account_id,date,amount_cents,source) VALUES ('cash','depot','2026-02-01',2,'manual');
    INSERT INTO savings_plan (id,security_id,account_id,amount_cents,day_of_month,valid_from) VALUES ('pa','s','depot',10000,1,'2026-01-01'),('pb','s2','depot',10000,1,'2026-01-01');`);
  ensureDefaultRules(opened.db);
});
afterEach(() => opened.close());
it('A04/A05/A07: complete dated versions preserve null vs managed zero and future versions; same-day undo restores legacy rows', () => {
  opened.db
    .insert(assetClassTarget)
    .values({ id: 'legacy', assetClassId: 'a', validFrom: '2025-12-31', targetShareBp: 10000 })
    .run();
  const original = opened.db.select().from(assetClassTarget).all();
  setTargets(
    opened.db,
    '2025-12-31',
    [...b, { assetClassId: 'a', targetShareBp: 0, bandBp: 0, bandMode: 'custom' }],
    ctx('replace'),
    { completeSnapshot: true, label: ' Strategie ', reason: ' Synthetisch ' },
  );
  expect(
    targetsAsOf(opened.db, '2026-01-31').map((t) => [t.assetClassId, t.targetShareBp]),
  ).toEqual([
    ['b', 10000],
    ['a', 0],
  ]);
  expect(listTargetVersions(opened.db)[0]).toMatchObject({
    label: 'Strategie',
    reason: 'Synthetisch',
    auditGroupId: 'replace',
  });
  const undone = undo(opened.db, { groupId: 'replace' }, ctx('undo'));
  expect(opened.db.select().from(assetClassTarget).all()).toEqual(original);
  expect(targetsAsOf(opened.db, '2026-01-31').map((t) => t.assetClassId)).toEqual(['a']);
  undo(opened.db, { groupId: undone.groupId }, ctx('redo'));
  expect(targetsAsOf(opened.db, '2026-01-31').map((t) => t.targetShareBp)).toEqual([10000, 0]);
  setTargets(opened.db, '2050-01-01', a, ctx('future'), { completeSnapshot: true });
  expect(portfolioAllocation(opened.db, '2026-01-31').classes.map((t) => t.targetBp)).toEqual([
    0, 10000,
  ]);
  expect(portfolioAllocation(opened.db, '2050-01-01').classes.map((t) => t.targetBp)).toEqual([
    10000,
    null,
  ]);
  const logs = opened.sqlite.prepare('SELECT count(*) AS n FROM audit_log').get();
  expect(() =>
    setTargets(
      opened.db,
      '2026-01-31',
      [{ assetClassId: 'a', targetShareBp: 9500 }],
      ctx('invalid'),
      { completeSnapshot: true },
    ),
  ).toThrow('95,00 %');
  expect(opened.sqlite.prepare('SELECT count(*) AS n FROM audit_log').get()).toEqual(logs);
});
it('tiers use signed PR3 investment cash and each month-end selects its own policy across live, R13, history and savings', () => {
  setTargets(opened.db, '2026-01-01', a, ctx('tiers'), {
    completeSnapshot: true,
    tiers: [
      { upToCents: 1000000, targets: a },
      { upToCents: null, targets: [{ assetClassId: 'a', targetShareBp: 0 }, ...b] },
    ],
  });
  const jan = resolvePortfolioRiskPolicy(opened.db, '2026-01-31');
  const feb = resolvePortfolioRiskPolicy(opened.db, '2026-02-28');
  expect(jan).toMatchObject({
    investmentCents: 999999,
    tierIndex: 0,
    targets: [{ assetClass: 'a', targetBp: 10000 }],
  });
  expect(feb).toMatchObject({
    investmentCents: 1000001,
    tierIndex: 1,
    targets: [
      { assetClass: 'a', targetBp: 0 },
      { assetClass: 'b', targetBp: 10000 },
    ],
  });
  expect(portfolioAllocation(opened.db, '2026-01-31').classes.map((c) => c.targetBp)).toEqual([
    10000,
    null,
  ]);
  expect(portfolioAllocation(opened.db, '2026-02-28').classes.map((c) => c.targetBp)).toEqual([
    0, 10000,
  ]);
  const inputs = ruleInputs(opened.db, '2026-02-28');
  expect(inputs.classTargets).toEqual(feb.targets);
  const report = allocationReport(opened.db, { today: '2026-02-28' });
  const history = report.history!;
  expect(history.classes.find((c) => c.assetClassId === 'a')!.targetBp).toEqual([null, 10000, 0]);
  expect(history.classes.find((c) => c.assetClassId === 'b')!.targetBp).toEqual([
    null,
    null,
    10000,
  ]);
  expect(history.totalCents).toEqual([999999, 999999, 1000001]);
  const proposal = savingsProposal(opened.db, '2026-02-28');
  expect(proposal.plans.map((p) => [p.id, p.proposedCents])).toEqual([
    ['pa', 0],
    ['pb', 20000],
  ]);
  expect(assetClassesSettings(opened.db, '2026-02-28').allocation).toEqual(
    portfolioAllocation(opened.db, '2026-02-28'),
  );
});
it('U02-U07/U12: trimmed unique names, rename/order, archive/restore and every write undo/redo', () => {
  const row = createAssetClass(opened.db, { name: '  Neue Klasse  ', sortOrder: 3 }, ctx('create'));
  expect(row.name).toBe('Neue Klasse');
  expect(() => createAssetClass(opened.db, { name: ' neue klasse ' }, ctx('duplicate'))).toThrow(
    'bereits',
  );
  expect(() => createAssetClass(opened.db, { name: ' ' }, ctx('blank'))).toThrow('Namen');
  const u = undo(opened.db, { groupId: 'create' }, ctx('undo-create'));
  expect(
    opened.db
      .select()
      .from(assetClass)
      .all()
      .find((c) => c.id === row.id)!.deletedAt,
  ).not.toBeNull();
  undo(opened.db, { groupId: u.groupId }, ctx('redo-create'));
  for (const [group, patch] of [
    ['rename', { name: 'Andere Klasse' }],
    ['order', { sortOrder: 0 }],
  ] as const) {
    const before = opened.db.select().from(assetClass).all();
    updateAssetClass(opened.db, row.id, patch, ctx(group));
    const after = opened.db.select().from(assetClass).all();
    const undone = undo(opened.db, { groupId: group }, ctx('undo-' + group));
    expect(opened.db.select().from(assetClass).all()).toEqual(before);
    undo(opened.db, { groupId: undone.groupId }, ctx('redo-' + group));
    expect(opened.db.select().from(assetClass).all()).toEqual(after);
  }
  deleteAssetClass(opened.db, row.id, ctx('archive'), '2026-02-28');
  const archiveUndo = undo(opened.db, { groupId: 'archive' }, ctx('undo-archive'));
  undo(opened.db, { groupId: archiveUndo.groupId }, ctx('redo-archive'));
  restoreAssetClass(opened.db, row.id, ctx('restore'));
  const restoreUndo = undo(opened.db, { groupId: 'restore' }, ctx('undo-restore'));
  undo(opened.db, { groupId: restoreUndo.groupId }, ctx('redo-restore'));
  expect(() => deleteAssetClass(opened.db, 'a', ctx('used'), '2026-02-28')).toThrow(
    'Klassifikationshistorie',
  );
});
it('A06: positive current/future/tier targets block archive; replacement and archive roll back together on deps', () => {
  createAssetClass(opened.db, { id: 'free', name: 'Freie Klasse' }, ctx('free'));
  setTargets(
    opened.db,
    '2026-01-01',
    [{ assetClassId: 'free', targetShareBp: 10000 }],
    ctx('target'),
    { completeSnapshot: true },
  );
  expect(() => deleteAssetClass(opened.db, 'free', ctx('unsafe'), '2026-02-28')).toThrow(
    'positive',
  );
  setTargets(opened.db, '2026-02-28', a, ctx('retire'), {
    completeSnapshot: true,
    archiveClassId: 'free',
    asOf: '2026-02-28',
  });
  expect(targetsAsOf(opened.db, '2026-02-28').map((t) => t.targetShareBp)).toEqual([10000]);
  expect(
    allocationReport(opened.db, { today: '2026-02-28' }).history!.classes.find(
      (c) => c.assetClassId === 'free',
    ),
  ).toMatchObject({ name: 'Freie Klasse', targetBp: [null, 10000, null] });
  undo(opened.db, { groupId: 'retire' }, ctx('undo-retire'));
  expect(targetsAsOf(opened.db, '2026-02-28')[0]!.assetClassId).toBe('free');
  const before = opened.db.select().from(assetTargetVersion).all();
  expect(() =>
    setTargets(opened.db, '2026-02-28', b, ctx('blocked-dep'), {
      completeSnapshot: true,
      archiveClassId: 'a',
      asOf: '2026-02-28',
    }),
  ).toThrow('Klassifikationshistorie');
  expect(opened.db.select().from(assetTargetVersion).all()).toEqual(before);
  setTargets(opened.db, '2026-02-28', a, ctx('replacement-only'), { completeSnapshot: true });
  deleteAssetClass(opened.db, 'free', ctx('archive-only'), '2026-02-28');
  const beforeForcedUndo = opened.db.select().from(assetTargetVersion).all();
  expect(() =>
    undo(opened.db, { groupId: 'replacement-only' }, ctx('force-undo'), { force: true }),
  ).toThrow('archivierten Anlageklasse');
  expect(opened.db.select().from(assetTargetVersion).all()).toEqual(beforeForcedUndo);
  restoreAssetClass(opened.db, 'free', ctx('restore-after-force'));
  setTargets(opened.db, '2050-01-01', a, ctx('future-tier'), {
    completeSnapshot: true,
    tiers: [
      { upToCents: 1000000, targets: a },
      { upToCents: null, targets: [{ assetClassId: 'free', targetShareBp: 10000 }] },
    ],
  });
  expect(() => deleteAssetClass(opened.db, 'free', ctx('future-block'), '2026-02-28')).toThrow(
    'positive',
  );
});

it('an archived managed zero retains its current target and band in settings', () => {
  createAssetClass(opened.db, { id: 'zero', name: 'Auslaufend' }, ctx('zero-create'));
  setTargets(
    opened.db,
    '2026-01-01',
    [
      ...a,
      {
        assetClassId: 'zero',
        targetShareBp: 0,
        bandBp: 123,
        bandMode: 'custom',
      },
    ],
    ctx('zero-policy'),
    { completeSnapshot: true },
  );
  deleteAssetClass(opened.db, 'zero', ctx('zero-archive'), '2026-02-28');
  expect(
    assetClassesSettings(opened.db, '2026-02-28').classes.find((c) => c.id === 'zero')!.target,
  ).toMatchObject({ targetBp: 0, bandBp: 123, validFrom: '2026-01-01' });
});

it('a missing investment valuation is distinct from an unmanaged target in tiered settings', () => {
  setTargets(opened.db, '2026-01-01', a, ctx('unknown-tier'), {
    completeSnapshot: true,
    tiers: [
      { upToCents: 1000000, targets: a },
      { upToCents: null, targets: b },
    ],
  });
  opened.db.update(price).set({ currency: 'JPY' }).run();
  const settings = assetClassesSettings(opened.db, '2026-02-28');
  expect(settings.allocation.valueCents).toBeNull();
  expect(settings.allocation.policy.targetValidFrom).toBe('2026-01-01');
  expect(settings.targetsUnavailable).toBe(true);
  expect(settings.allocation.policy.targets).toEqual([]);
});
