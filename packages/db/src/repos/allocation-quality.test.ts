import { beforeEach, afterEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { evaluateRule } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, holding, price, security } from '../schema';
import { portfolioAllocation } from './portfolio-allocation';
import { allocationReport } from './portfolio-allocation-report';
import { allocationInputsAsOf } from './allocation-inputs';
import { savingsProposal, applySavingsProposal } from './savings-plans';
import { reportPortfolioFixture, REPORT_TODAY } from './portfolio-report-fixture';
import { ruleInputs } from './rule-inputs';
import { accounts } from './entities';
import { undo } from './audit';
import { replaceExposureVersion } from './asset-exposure';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  reportPortfolioFixture(opened);
  opened.sqlite
    .exec(`INSERT INTO savings_plan (id, security_id, account_id, amount_cents, day_of_month, valid_from)
    VALUES ('p1', 'etf', 'depot-a', 10000, 1, '2026-01-01'), ('p2', 'coin', 'depot-b', 1000, 1, '2026-01-01');`);
});
afterEach(() => opened.close());
const view = () => portfolioAllocation(opened.db, REPORT_TODAY);

it('R07 weighted unknown value is central, deduplicated and provisional in live/report/rules/savings', () => {
  replaceExposureVersion(
    opened.db,
    'etf',
    {
      validFrom: '2026-09-01',
      complete: false,
      source: 'synthetic',
      weights: [{ assetClassId: 'world', weightBp: 6000 }],
    },
    { actor: 'test' },
  );
  const v = view();
  expect(v.quality).toMatchObject({
    classification: 'partial',
    confidence: 'provisional',
    unclassifiedProductCount: 1,
  });
  expect(v.quality.unclassifiedValueCents!).toBeGreaterThan(0);
  expect(v.risk!.proposals.length).toBeGreaterThan(0);
  expect(v.risk!.proposals.every((p) => p.confidence === 'provisional')).toBe(true);
  expect(allocationReport(opened.db, { today: REPORT_TODAY }).quality).toEqual(v.quality);
  const evaluated = evaluateRule('R13', {}, ruleInputs(opened.db, REPORT_TODAY))!;
  expect(evaluated.status).toBe('warn');
  expect(evaluated.actionText).toContain('keine verbindliche');
  expect(savingsProposal(opened.db, REPORT_TODAY)).toMatchObject({
    confidence: 'provisional',
    changed: false,
    note: 'quality_gate',
  });
  const before = opened.sqlite.prepare('SELECT * FROM savings_plan ORDER BY id').all();
  expect(applySavingsProposal(opened.db, REPORT_TODAY, { actor: 'test' }).changes).toEqual([]);
  expect(opened.sqlite.prepare('SELECT * FROM savings_plan ORDER BY id').all()).toEqual(before);
  expect(allocationReport(opened.db, { today: REPORT_TODAY }).history!.quality.at(-1)).toEqual(
    v.quality,
  );
});
it('R08 cost-basis and stale valuations produce structured provisional proposals, missing quotes/FX suppress them', () => {
  opened.sqlite.exec("DELETE FROM price WHERE security_id = 'etf'");
  let v = view();
  expect(v.quality).toMatchObject({
    valuationQuality: 'estimated',
    estimatedSecurityIds: ['etf'],
    confidence: 'provisional',
  });
  expect(v.quality.estimatedShareBp).toBeGreaterThan(0);
  expect(v.risk!.proposals.every((p) => p.confidence === 'provisional')).toBe(true);
  expect(savingsProposal(opened.db, REPORT_TODAY).note).toBe('quality_gate');
  opened.db
    .update(holding)
    .set({ costBasisCents: null })
    .where(eq(holding.securityId, 'etf'))
    .run();
  opened.sqlite.exec("DELETE FROM trade WHERE security_id = 'etf'");
  v = view();
  expect(v).toMatchObject({ status: 'unavailable', risk: null });
  expect(v.quality).toMatchObject({
    valuationQuality: 'incomplete',
    missingPriceSecurityIds: ['etf'],
  });
  expect(savingsProposal(opened.db, REPORT_TODAY)).toMatchObject({
    confidence: 'provisional',
    changed: false,
  });
  opened.db
    .insert(price)
    .values({
      securityId: 'etf',
      date: '2026-09-01',
      priceMicro: 100000000,
      currency: 'EUR',
      source: 'manual',
    })
    .run();
  expect(view().quality).toMatchObject({
    valuationQuality: 'estimated',
    staleSecurityIds: ['etf'],
  });
  opened.db.update(price).set({ currency: 'USD' }).where(eq(price.securityId, 'etf')).run();
  expect(view().quality).toMatchObject({
    valuationQuality: 'incomplete',
    missingFxSecurityIds: ['etf'],
  });
});
it('scope includes negative investment cash and money-market instruments; excludes current/card/debt/envelopes and opt-outs', () => {
  const initial = view().valueCents!;
  const make = (
    id: string,
    type: typeof account.$inferInsert.type,
    allocationScope: 'included' | 'default' = 'default',
  ) =>
    opened.db
      .insert(account)
      .values({
        id,
        name: 'Depot in name is irrelevant',
        type,
        role: type === 'loan' ? 'debt' : 'budget',
        onBudget: false,
        openingDate: '2025-12-31',
        openingBalanceCents: 100000,
        allocationScope,
      })
      .run();
  make('checking', 'checking');
  make('card', 'credit_card', 'included');
  make('debt', 'loan', 'included');
  make('envelope-source', 'cash');
  make('investment-cash', 'savings', 'included');
  opened.db
    .update(account)
    .set({ openingBalanceCents: -2000, allocationAssetClassId: 'world' })
    .where(eq(account.id, 'investment-cash'))
    .run();
  expect(view().valueCents).toBe(initial - 2000);
  expect(view().quality.confidence).toBe('exact');
  opened.db
    .update(account)
    .set({ allocationScope: 'excluded' })
    .where(eq(account.id, 'investment-cash'))
    .run();
  expect(view().valueCents).toBe(initial);
  const etf = allocationInputsAsOf(opened.db, REPORT_TODAY)
    .positions.filter((p) => p.securityId === 'etf')
    .reduce((sum, p) => sum + p.valueCents, 0);
  opened.db
    .update(security)
    .set({ name: 'Money market', kind: 'fund' })
    .where(eq(security.id, 'etf'))
    .run();
  expect(view().valueCents).toBe(initial);
  opened.db.update(security).set({ allocationIncluded: false }).where(eq(security.id, 'etf')).run();
  expect(view().valueCents).toBe(initial - etf);
  expect(allocationReport(opened.db, { today: REPORT_TODAY }).totalCents).toBe(initial - etf);
});
it('cash classification and explicit membership edits audit/undo/redo, reject inactive classes atomically', () => {
  const before = view().valueCents!;
  const row = accounts.create(
    opened.db,
    {
      name: 'Investment cash',
      type: 'savings',
      role: 'investment',
      onBudget: false,
      openingDate: '2025-12-31',
      openingBalanceCents: 5000,
      allocationScope: 'included',
    },
    { actor: 'test', groupId: 'cash-create' },
  );
  const creationUndo = undo(opened.db, { groupId: 'cash-create' }, { actor: 'test' });
  expect(view().valueCents).toBe(before);
  undo(opened.db, { groupId: creationUndo.groupId }, { actor: 'test' });
  expect(view().quality).toMatchObject({
    confidence: 'provisional',
    unclassifiedValueCents: 5000,
    unclassifiedProductCount: 1,
  });
  expect(() =>
    accounts.update(
      opened.db,
      row.id,
      { allocationAssetClassId: 'absent' },
      { actor: 'test', groupId: 'invalid' },
    ),
  ).toThrow('aktive Anlageklasse');
  expect(
    opened.sqlite.prepare("SELECT count(*) n FROM audit_log WHERE group_id = 'invalid'").get(),
  ).toEqual({ n: 0 });
  accounts.update(
    opened.db,
    row.id,
    { allocationAssetClassId: 'world' },
    { actor: 'test', groupId: 'classify' },
  );
  expect(view().quality.confidence).toBe('exact');
  const u = undo(opened.db, { groupId: 'classify' }, { actor: 'test' });
  expect(view().quality.confidence).toBe('provisional');
  undo(opened.db, { groupId: u.groupId }, { actor: 'test' });
  expect(view().quality.confidence).toBe('exact');
  accounts.update(
    opened.db,
    row.id,
    { allocationScope: 'excluded' },
    { actor: 'test', groupId: 'exclude' },
  );
  expect(view().valueCents).toBe(before);
  const exclusionUndo = undo(opened.db, { groupId: 'exclude' }, { actor: 'test' });
  expect(view().valueCents).toBe(before + 5000);
  undo(opened.db, { groupId: exclusionUndo.groupId }, { actor: 'test' });
  expect(view().valueCents).toBe(before);
});
it('excluded missing-price and missing-FX holdings do not contaminate the allocation quality', () => {
  opened.db
    .update(account)
    .set({ allocationScope: 'excluded' })
    .where(eq(account.id, 'depot-b'))
    .run();
  opened.db.update(price).set({ currency: 'USD' }).where(eq(price.securityId, 'coin')).run();
  expect(view().quality.confidence).toBe('exact');
  opened.db.update(security).set({ allocationIncluded: false }).where(eq(security.id, 'etf')).run();
  opened.sqlite.exec(
    "DELETE FROM price WHERE security_id = 'etf'; DELETE FROM trade WHERE security_id = 'etf'; UPDATE holding SET cost_basis_cents = NULL WHERE security_id = 'etf'",
  );
  expect(view().quality.confidence).toBe('exact');
});

it('P2P manual valuation replaces its balance once; foreign investment cash and basis FX stay incomplete', () => {
  const initial = view().valueCents!;
  opened.sqlite
    .exec(`INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents) VALUES ('p2p-manual', 'Synthetic platform', 'p2p', 'investment', 0, '2025-12-31', 100);
    INSERT INTO valuation (id, account_id, date, value_cents) VALUES ('mv', 'p2p-manual', '2026-09-01', 500);
    UPDATE account SET allocation_asset_class_id = 'spec' WHERE id = 'p2p-manual';`);
  expect(view().valueCents).toBe(initial + 500);
  opened.db.update(account).set({ currency: 'USD' }).where(eq(account.id, 'p2p-manual')).run();
  expect(view().quality).toMatchObject({
    valuationQuality: 'incomplete',
    missingFxAccountIds: ['p2p-manual'],
  });
  opened.db
    .update(account)
    .set({ allocationScope: 'excluded' })
    .where(eq(account.id, 'p2p-manual'))
    .run();
  opened.sqlite.exec("DELETE FROM price WHERE security_id = 'etf'");
  opened.db.update(account).set({ currency: 'USD' }).where(eq(account.id, 'depot-a')).run();
  expect(view().quality).toMatchObject({
    valuationQuality: 'incomplete',
    missingFxSecurityIds: ['etf'],
  });
});
it('savings plans outside the allocation universe suppress redistribution, with explicit provisional confidence', () => {
  opened.db
    .update(security)
    .set({ allocationIncluded: false })
    .where(eq(security.id, 'coin'))
    .run();
  expect(savingsProposal(opened.db, REPORT_TODAY)).toMatchObject({
    note: 'scope_gate',
    confidence: 'provisional',
    changed: false,
  });
});

it('instrument opt-out cannot re-enter through a P2P manual account valuation', () => {
  const initial = view().valueCents!;
  opened.sqlite
    .exec(`INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents, allocation_asset_class_id) VALUES ('p2p-opt-out', 'Synthetic platform', 'p2p', 'investment', 0, '2025-12-31', 100, 'spec');
    INSERT INTO valuation (id, account_id, date, value_cents) VALUES ('outside-mv', 'p2p-opt-out', '2026-09-01', 500);
    INSERT INTO security (id, name, kind, allocation_included) VALUES ('outside', 'Synthetic excluded', 'p2p', 0);
    INSERT INTO holding (id, account_id, security_id, as_of, units_e8, cost_basis_cents) VALUES ('outside-h', 'p2p-opt-out', 'outside', '2026-01-01', 100000000, 400);`);
  expect(view().valueCents).toBe(initial + 100);
  expect(view().quality.confidence).toBe('exact');
  expect(view().quality.estimatedSecurityIds).toEqual([]);
});
