import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { accounts } from './entities';
import { undo } from './audit';
import {
  createAssetClass,
  updateAssetClass,
  deleteAssetClass,
  listAssetClasses,
  targetsAsOf,
  createSecurity,
} from './securities';
import { applyOwnerConfig, parseOwnerConfigFile } from './operator-owner-config';
import { allocationReport } from './portfolio-allocation-report';
import { assetClassesSettings } from './asset-classes-settings';
import { reportPortfolioFixture, REPORT_TODAY } from './portfolio-report-fixture';
import { seedBasics } from './test-helpers';

let opened: OpenedDatabase;
const ctx = { actor: 'tester', groupId: 'tree' };
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());

it('keeps groups two levels deep, unassignable and protected from archive; moves undo and redo', () => {
  const db = opened.db;
  createAssetClass(db, { id: 'g', name: 'Gruppe A', isGroup: true }, ctx);
  createAssetClass(db, { id: 'c', name: 'Klasse A' }, { ...ctx, groupId: 'class' });
  updateAssetClass(db, 'c', { parentId: 'g' }, { ...ctx, groupId: 'move' });
  expect(listAssetClasses(db).find((c) => c.id === 'c')?.parentId).toBe('g');
  expect(() => updateAssetClass(db, 'g', { parentId: 'c' }, ctx)).toThrow();
  expect(() => createAssetClass(db, { name: 'Klasse B', parentId: 'c' }, ctx)).toThrow();
  expect(() => deleteAssetClass(db, 'g', ctx)).toThrow();
  expect(() =>
    createSecurity(db, { name: 'Produkt A', kind: 'etf', assetClassId: 'g' }, ctx),
  ).toThrow();
  expect(() =>
    accounts.create(
      db,
      {
        name: 'Plattform A',
        type: 'p2p',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-01-01',
        allocationAssetClassId: 'g',
      },
      ctx,
    ),
  ).toThrow();
  const result = undo(db, { groupId: 'move' }, { ...ctx, groupId: 'undo' });
  expect(listAssetClasses(db).find((c) => c.id === 'c')?.parentId).toBeNull();
  undo(db, { groupId: result.groupId }, { ...ctx, groupId: 'redo' });
  expect(listAssetClasses(db).find((c) => c.id === 'c')?.parentId).toBe('g');
});

it('includes unmanaged cash-only classes in whole-portfolio group Ist without chart cents', () => {
  const db = opened.db;
  createAssetClass(db, { id: 'g', name: 'Gruppe A', isGroup: true }, ctx);
  createAssetClass(db, { id: 'a', name: 'Klasse A', parentId: 'g' }, ctx);
  createAssetClass(db, { id: 'b', name: 'Klasse B', parentId: 'g' }, ctx);
  for (const [id, type, allocationAssetClassId, openingBalanceCents] of [
    ['p', 'p2p', 'a', 101],
    ['c', 'brokerage', 'b', 99],
  ] as const)
    accounts.create(
      db,
      {
        id,
        name: `Position ${id}`,
        type,
        role: 'investment',
        onBudget: false,
        openingDate: '2026-01-01',
        openingBalanceCents,
        allocationAssetClassId,
      },
      ctx,
    );
  const report = allocationReport(db, { today: '2026-01-01' });
  expect(report.totalCents).toBe(200);
  expect(report.classifiedCents).toBe(101);
  expect(report.compositionGroups[0]).toMatchObject({
    valueCents: 101,
    shareBp: 10000,
    portfolioShareBp: 10000,
  });
  expect(report.compositionGroups[0]?.classes.find((c) => c.assetClassId === 'b')).toMatchObject({
    valueCents: 0,
    shareBp: 0,
    portfolioShareBp: 4950,
    targetBp: null,
  });
});

it('pairs value with share on the same base: classified value stays separate from the R13 row value', () => {
  const db = opened.db;
  createAssetClass(db, { id: 'g', name: 'Gruppe A', isGroup: true }, ctx);
  createAssetClass(db, { id: 'a', name: 'Klasse A', parentId: 'g' }, ctx);
  for (const [id, type, openingBalanceCents] of [
    ['p', 'p2p', 1000],
    ['c', 'brokerage', 3000],
  ] as const)
    accounts.create(
      db,
      {
        id,
        name: `Position ${id}`,
        type,
        role: 'investment',
        onBudget: false,
        openingDate: '2026-01-01',
        openingBalanceCents,
        allocationAssetClassId: 'a',
      },
      ctx,
    );
  const report = allocationReport(db, { today: '2026-01-01' });
  const cls = report.compositionGroups[0]!.classes[0]!;
  expect(cls).toMatchObject({
    portfolioValueCents: 4000,
    portfolioShareBp: 10000,
    valueCents: 1000,
  });
  expect(report.compositionGroups[0]).toMatchObject({
    portfolioValueCents: 4000,
    portfolioShareBp: 10000,
    valueCents: 1000,
  });
  const actual = assetClassesSettings(db, '2026-01-01').classes.find((c) => c.id === 'g')!.actual;
  expect(actual).toMatchObject({ valueCents: 4000, shareBp: 10000 });
});

const tree = {
  groups: [{ name: 'Kryptogruppe', classes: ['Coin A', 'Coin B'] }],
  createClasses: ['Coin A', 'Coin B'],
  targets: [
    { className: 'Coin A', targetShareBp: 6000, bandBp: 500, validFrom: '2026-01-01' },
    { className: 'Coin B', targetShareBp: 4000, bandBp: 200, validFrom: '2026-01-01' },
  ],
  accountClasses: [{ accountName: 'Plattform A', className: 'Coin B' }],
};
const run = (assetClassTree: unknown, dryRun = false) =>
  applyOwnerConfig(
    opened.db,
    parseOwnerConfigFile({ assetClassTree }, '2026-01-01'),
    { actor: 'operator' },
    { dryRun, today: '2026-01-01' },
  );
it('reports every tree change in dry-run, writes one undoable group and is idempotent', () => {
  accounts.create(
    opened.db,
    {
      id: 'p',
      name: 'Plattform A',
      type: 'p2p',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: 101,
    },
    ctx,
  );
  const preview = run(tree, true);
  expect(preview.filter((r) => r.status !== 'unchanged')).toHaveLength(7);
  expect(preview.every((r) => r.status !== 'skipped' && r.groupId === '')).toBe(true);
  expect(listAssetClasses(opened.db)).toEqual([]);
  expect(targetsAsOf(opened.db, '2026-01-01')).toEqual([]);
  const changes = run(tree);
  expect(changes.map((r) => [r.key, r.status, r.detail])).toEqual(
    preview.map((r) => [r.key, r.status, r.detail]),
  );
  expect(new Set(changes.map((r) => r.groupId)).size).toBe(1);
  expect(run(tree).every((r) => r.status === 'unchanged')).toBe(true);
  expect(targetsAsOf(opened.db, '2026-01-01').map((t) => [t.targetShareBp, t.bandBp])).toEqual([
    [6000, 500],
    [4000, 200],
  ]);
  const group = changes[0]!.groupId;
  const reversal = undo(opened.db, { groupId: group }, { ...ctx, groupId: 'undo-tree' });
  expect(listAssetClasses(opened.db)).toEqual([]);
  expect(accounts.get(opened.db, 'p')?.allocationAssetClassId).toBeNull();
  undo(opened.db, { groupId: reversal.groupId }, { ...ctx, groupId: 'redo-tree' });
  expect(accounts.get(opened.db, 'p')?.allocationAssetClassId).toBeTruthy();
});
it('rejects unknown names atomically within a group and incomplete targets with the difference', () => {
  createAssetClass(opened.db, { id: 'a', name: 'Coin A' }, ctx);
  const result = run({ groups: [{ name: 'Gruppe A', classes: ['Coin A', 'Unknown'] }] });
  expect(result[0]).toMatchObject({ status: 'skipped', reason: 'unknown_asset_class' });
  expect(listAssetClasses(opened.db).map((c) => c.name)).toEqual(['Coin A']);
  expect(() => run({ targets: [tree.targets[0]] })).toThrow(/-4000 bp/);
  expect(() =>
    run({
      groups: [
        { name: 'G', classes: ['A'] },
        { name: 'H', classes: ['A'] },
      ],
    }),
  ).toThrow(/twice/);
  expect(() => run({ createClasses: ['A'], extra: true })).toThrow(/unknown key/);
});
it('replaces a legacy standard band with the explicitly requested zero custom band', () => {
  createAssetClass(opened.db, { id: 'a', name: 'Coin A' }, ctx);
  opened.sqlite.exec(
    "INSERT INTO asset_class_target (id, asset_class_id, target_share_bp, band_bp, valid_from) VALUES ('old', 'a', 10000, 0, '2026-01-01')",
  );
  const changes = run({
    targets: [{ className: 'Coin A', targetShareBp: 10000, bandBp: 0, validFrom: '2026-01-01' }],
  });
  expect(changes[0]?.status).toBe('updated');
  expect(targetsAsOf(opened.db, '2026-01-01')[0]?.bandMode).toBe('custom');
});
it('defaults unclassified P2P accounts only during an explicit tree run', () => {
  accounts.create(
    opened.db,
    {
      id: 'p',
      name: 'Plattform A',
      type: 'p2p',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: 101,
    },
    ctx,
  );
  expect(allocationReport(opened.db, { today: '2026-01-01' }).classifiedCents).toBe(0);
  expect(run({}, true).map((r) => r.status)).toEqual(['created', 'created', 'updated']);
  expect(listAssetClasses(opened.db)).toEqual([]);
  run({});
  const report = allocationReport(opened.db, { today: '2026-01-01' });
  expect(report.compositionGroups).toMatchObject([
    {
      name: 'P2P',
      valueCents: 101,
      shareBp: 10000,
      classes: [{ name: 'Plattform A', products: [{ name: 'Plattform A', valueCents: 101 }] }],
    },
  ]);
  expect(run({}).every((r) => r.status === 'unchanged')).toBe(true);
});
it('conserves products, classes and group cents and sums targets including unheld members', () => {
  seedBasics(opened.db);
  reportPortfolioFixture(opened);
  createAssetClass(opened.db, { id: 'g', name: 'Gruppe A', isGroup: true }, ctx);
  updateAssetClass(opened.db, 'world', { parentId: 'g' }, ctx);
  updateAssetClass(opened.db, 'spec', { parentId: 'g' }, ctx);
  const report = allocationReport(opened.db, { today: REPORT_TODAY });
  expect(report.compositionGroups).toHaveLength(1);
  const settingsGroup = assetClassesSettings(opened.db, REPORT_TODAY).classes.find(
    (c) => c.id === 'g',
  )!;
  expect(settingsGroup.target?.targetBp).toBe(10000);
  expect(settingsGroup.actual?.shareBp).toBe(report.compositionGroups[0]?.portfolioShareBp);
  expect(report.compositionGroups[0]).toMatchObject({
    name: 'Gruppe A',
    valueCents: report.classifiedCents,
    shareBp: 10000,
    targetBp: 10000,
  });
  for (const group of report.compositionGroups) {
    expect(group.classes.reduce((s, c) => s + c.valueCents, 0)).toBe(group.valueCents);
    for (const cls of group.classes)
      expect(cls.products.reduce((s, p) => s + p.valueCents, 0)).toBe(cls.valueCents);
  }
  opened.sqlite.exec('UPDATE security SET regions_json=NULL;');
  expect(allocationReport(opened.db, { today: REPORT_TODAY }).regionsAvailable).toBe(false);
  opened.sqlite.exec('UPDATE security SET regions_json=\'{"Region A":0.49}\';');
  expect(allocationReport(opened.db, { today: REPORT_TODAY }).regionsAvailable).toBe(false);
  opened.sqlite.exec('UPDATE security SET regions_json=\'{"Region A":0.5}\';');
  expect(allocationReport(opened.db, { today: REPORT_TODAY }).regionsAvailable).toBe(true);
});

it('does not assign a P2P default when a same-name class belongs to another group', () => {
  createAssetClass(opened.db, { id: 'g', name: 'Andere Gruppe', isGroup: true }, ctx);
  createAssetClass(opened.db, { id: 'c', name: 'Plattform A', parentId: 'g' }, ctx);
  accounts.create(
    opened.db,
    {
      id: 'p',
      name: 'Plattform A',
      type: 'p2p',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-01-01',
    },
    ctx,
  );
  const changes = run({});
  expect(changes.some((c) => c.status === 'skipped')).toBe(true);
  expect(accounts.get(opened.db, 'p')?.allocationAssetClassId).toBeNull();
});
