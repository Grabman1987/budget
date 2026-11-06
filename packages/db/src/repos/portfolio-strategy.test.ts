import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { price, security, trade } from '../schema';
import { undo } from './audit';
import { createTrade } from './trades';
import {
  portfolioStrategyView,
  recordStrategyMonthlyDecision,
  saveStrategyConfiguration,
  strategyConfiguration,
  strategyDecisions,
  confirmStrategyRebalance,
} from './portfolio-strategy';
import {
  seedStrategyTestPortfolio,
  strategyTestConfiguration,
  strategyTestEvidence,
  STRATEGY_TEST_AS_OF,
} from './portfolio-strategy-fixture';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedStrategyTestPortfolio(opened);
});
afterEach(() => opened.close());
const ctx = (groupId: string) => ({ actor: 'test', groupId });
const save = () =>
  saveStrategyConfiguration(
    opened.db,
    { config: strategyTestConfiguration(), revision: strategyConfiguration(opened.db).revision },
    '2026-09-30',
    ctx('config'),
  );
const decide = () =>
  recordStrategyMonthlyDecision(
    opened.db,
    strategyTestEvidence(),
    '2026-09',
    STRATEGY_TEST_AS_OF,
    strategyConfiguration(opened.db).revision,
    ctx('decision'),
  );
const view = () => portfolioStrategyView(opened.db, STRATEGY_TEST_AS_OF, strategyTestEvidence());
const ledger = () =>
  ['booking', 'trade', 'savings_plan', 'asset_class_target'].map((table) =>
    opened.sqlite.prepare(`SELECT * FROM ${table}`).all(),
  );

it('saves settings with conflict/Undo/redo protection and changes no financial records', () => {
  const before = ledger(),
    initial = strategyConfiguration(opened.db),
    saved = save();
  expect(saved.config).toEqual(strategyTestConfiguration());
  expect(() =>
    saveStrategyConfiguration(
      opened.db,
      { config: strategyTestConfiguration(), revision: initial.revision },
      '2026-09-30',
      ctx('stale'),
    ),
  ).toThrow(/geändert/);
  const reversal = undo(opened.db, { groupId: saved.groupId }, ctx('reverse'));
  expect(strategyConfiguration(opened.db).config).toBeNull();
  expect(strategyConfiguration(opened.db).revision).not.toBe(initial.revision);
  undo(opened.db, { groupId: reversal.groupId }, ctx('restore'));
  expect(strategyConfiguration(opened.db).config).toEqual(strategyTestConfiguration());
  expect(ledger()).toEqual(before);
});
it('retains monthly facts, is idempotent, and never writes from a daily preview', () => {
  save();
  const before = ledger();
  decide();
  expect(decide().changedCount).toBe(0);
  const count = opened.sqlite.prepare('SELECT count(*) AS n FROM audit_log').get();
  const result = view();
  expect(result.binding?.trend).toBe('weak');
  expect(result.contribution?.rows.map((row) => row.idealCents)).toEqual([0, 513, 0, 9487]);
  expect(result.contribution).toMatchObject({
    portfolioCents: 100000,
    grossCents: 10000,
    residualCents: 0,
  });
  expect(result.rebalance).toMatchObject({ due: true, trigger: 'quarter_end' });
  expect(opened.sqlite.prepare('SELECT count(*) AS n FROM audit_log').get()).toEqual(count);
  expect(ledger()).toEqual(before);
  const changed = strategyTestEvidence();
  changed.input.closes = changed.input.closes.map((row, index) => ({
    ...row,
    closeUnits: 100000 + index,
  }));
  const preview = portfolioStrategyView(opened.db, STRATEGY_TEST_AS_OF, changed);
  expect(preview.dailyPreview).toMatchObject({ status: 'available', trend: 'strong' });
  expect(preview.binding?.trend).toBe('weak');
  expect(preview.contribution?.rows.map((row) => row.idealCents)).toEqual([0, 513, 0, 9487]);
  expect(() =>
    recordStrategyMonthlyDecision(
      opened.db,
      changed,
      '2026-09',
      STRATEGY_TEST_AS_OF,
      result.revision,
      ctx('changed'),
    ),
  ).toThrow(/bereits|überschrieben/);
  undo(opened.db, { groupId: 'decision' }, ctx('undo-decision'));
  expect(strategyDecisions(opened.db, STRATEGY_TEST_AS_OF)).toEqual([]);
  expect(() =>
    recordStrategyMonthlyDecision(
      opened.db,
      changed,
      '2026-09',
      STRATEGY_TEST_AS_OF,
      result.revision,
      ctx('changed-after-undo'),
    ),
  ).toThrow(/bereits/);
  expect(decide().decision.fingerprint).toBe(result.binding?.fingerprint);
});
it('keeps missing evidence, held incompatible products and missing prices explicit', () => {
  save();
  expect(portfolioStrategyView(opened.db, STRATEGY_TEST_AS_OF)).toMatchObject({
    contribution: null,
    dailyPreview: { status: 'unavailable', reason: 'trusted_provider_unconfigured' },
  });
  decide();
  opened.db
    .update(security)
    .set({ leverageFactor: 30 })
    .where(eq(security.id, 'strategy-nasdaq2x'))
    .run();
  expect(view().contribution).toBeNull();
  expect(view().diagnostics.some((reason) => reason.startsWith('incompatible:'))).toBe(true);
  opened.db
    .update(security)
    .set({ leverageFactor: 20 })
    .where(eq(security.id, 'strategy-nasdaq2x'))
    .run();
  opened.db.delete(price).where(eq(price.securityId, 'strategy-gold')).run();
  expect(view().valuation.valueCents).toBeNull();
  expect(view().contribution).toBeNull();
  expect(view().valuation.categoryValues.find((row) => row.category === 'gold')?.holdings).toEqual([
    { securityId: 'strategy-gold', valueCents: null },
  ]);
});
it('rejects a daily 3x buy route and monthly decisions outside the permitted evidence window', () => {
  opened.db
    .update(security)
    .set({ leverageFactor: 30 })
    .where(eq(security.id, 'strategy-nasdaq2x'))
    .run();
  expect(save).toThrow(/2×/);
  opened.db
    .update(security)
    .set({ leverageFactor: 20 })
    .where(eq(security.id, 'strategy-nasdaq2x'))
    .run();
  save();
  const late = '2026-10-02T12:00:00.000Z';
  expect(() =>
    recordStrategyMonthlyDecision(
      opened.db,
      strategyTestEvidence(late),
      '2026-09',
      late,
      strategyConfiguration(opened.db).revision,
      ctx('late'),
    ),
  ).toThrow(/window/);
});
it('confirms existing executions once, supports Undo, and invalidates changed or undone trades', () => {
  save();
  decide();
  const captured = createTrade(
    opened.db,
    {
      securityId: 'strategy-global',
      accountId: 'strategy-depot',
      date: '2026-09-30',
      kind: 'sell',
      unitsE8: -10000000,
      amountCents: 6000,
    },
    ctx('trade'),
  );
  const before = ledger(),
    current = view();
  const payload = {
    decisionFingerprint: current.binding!.fingerprint,
    revision: current.rebalanceExecution!.revision,
    tradeIds: [captured.trade.id],
    confirmedComplete: true as const,
  };
  expect(() =>
    confirmStrategyRebalance(
      opened.db,
      { ...payload, tradeIds: ['missing'] },
      STRATEGY_TEST_AS_OF,
      ctx('bad'),
    ),
  ).toThrow();
  confirmStrategyRebalance(opened.db, payload, STRATEGY_TEST_AS_OF, ctx('confirm'));
  expect(view().rebalanceExecution?.completed).toBe(true);
  expect(ledger()).toEqual(before);
  expect(() =>
    confirmStrategyRebalance(opened.db, payload, STRATEGY_TEST_AS_OF, ctx('stale')),
  ).toThrow(/geändert/);
  const reversed = undo(opened.db, { groupId: 'confirm' }, ctx('undo-confirm'));
  expect(view().rebalanceExecution?.completed).toBe(false);
  undo(opened.db, { groupId: reversed.groupId }, ctx('redo-confirm'));
  expect(view().rebalanceExecution?.completed).toBe(true);
  undo(opened.db, { groupId: 'trade' }, ctx('undo-trade'));
  expect(view().rebalanceExecution).toMatchObject({ completed: false, invalidated: true });
  expect(opened.db.select().from(trade).all()).toHaveLength(1);
});
