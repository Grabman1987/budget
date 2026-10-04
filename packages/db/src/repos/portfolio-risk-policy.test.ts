import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { evaluateRule } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { assetClass, assetClassTarget, price, rule, security } from '../schema';
import { allocationReport } from './portfolio-allocation-report';
import { portfolioAllocation } from './portfolio-allocation';
import { resolvePortfolioRiskPolicy } from './portfolio-risk-policy';
import { portfolioSummary } from './portfolio-summary';
import { reportPortfolioFixture, REPORT_TODAY } from './portfolio-report-fixture';
import { ruleInputs } from './rule-inputs';
import { evaluateRules, financeCheck, updateRule, ensureDefaultRules } from './rules';
import { savingsProposal } from './savings-plans';
import { undo } from './audit';
import { replaceExposureVersion } from './asset-exposure';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  reportPortfolioFixture(opened);
  ensureDefaultRules(opened.db);
  opened.sqlite
    .exec(`INSERT INTO savings_plan (id, security_id, account_id, amount_cents, day_of_month, valid_from)
    VALUES ('plan-etf', 'etf', 'depot-a', 10000, 1, '2026-01-01'),
      ('plan-coin', 'coin', 'depot-b', 1000, 1, '2026-01-01');`);
});
afterEach(() => opened.close());
const patch = (code: 'R13' | 'R14' | 'R15', params: Record<string, unknown>) =>
  updateRule(opened.db, code, { params }, { actor: 'tester', groupId: `policy-${code}` });

describe('one portfolio risk policy across runtime consumers', () => {
  it('weighted small holdings conserve separately rounded gross cents without changing market cents', () => {
    opened.sqlite.exec("DELETE FROM trade; DELETE FROM holding WHERE security_id != 'etf';");
    opened.db.update(price).set({ priceMicro: 25250 }).where(eq(price.securityId, 'etf')).run();
    opened.db.update(security).set({ leverageFactor: 11 }).where(eq(security.id, 'etf')).run();
    opened.db.insert(assetClass).values({ id: 'third', name: 'Synthetic third class' }).run();
    replaceExposureVersion(
      opened.db,
      'etf',
      {
        validFrom: '2025-12-31',
        complete: true,
        source: 'synthetic_fixture',
        weights: [
          { assetClassId: 'world', weightBp: 6000 },
          { assetClassId: 'spec', weightBp: 3500 },
          { assetClassId: 'third', weightBp: 500 },
        ],
      },
      { actor: 'tester' },
    );
    const inputs = ruleInputs(opened.db, REPORT_TODAY);
    expect(Object.fromEntries(inputs.positions.map((p) => [p.assetClass, p.valueCents]))).toEqual({
      world: 61,
      spec: 35,
      third: 5,
    });
    expect(
      Object.fromEntries(inputs.positions.map((p) => [p.assetClass, p.grossExposureCents])),
    ).toEqual({ world: 67, spec: 39, third: 5 });
    const risk = portfolioAllocation(opened.db, REPORT_TODAY).risk!;
    expect(risk.cluster.totalGrossExposureCents).toBe(111);
    expect(risk.speculative).toMatchObject({
      totalCents: 101,
      valueCents: 101,
      grossExposureCents: 111,
    });
  });

  it('stored R15 severity changes finance check and evaluation without changing the exposure', () => {
    patch('R15', { badOverBp: 1000 });
    expect(evaluateRule('R15', {}, ruleInputs(opened.db, REPORT_TODAY))!.status).toBe('warn');
    expect(
      financeCheck(opened.db, REPORT_TODAY).keyRules.find((r) => r.code === 'R15')!.status,
    ).toBe('warn');
    expect(portfolioAllocation(opened.db, REPORT_TODAY).risk!.speculative.breach).toBe(true);
  });
  it('R04 stored R15 changes rule, portfolio, rebalancing, report and savings together; undo/redo restores policy', () => {
    expect(portfolioAllocation(opened.db, REPORT_TODAY).risk!.speculative.breach).toBe(true);
    patch('R15', { limitBp: 10000, badOverBp: 77 });
    const risk = portfolioAllocation(opened.db, REPORT_TODAY).risk!;
    expect(risk.speculative).toMatchObject({ limitBp: 10000, breach: false });
    expect(risk.proposals.some((p) => p.rule === 'R15')).toBe(false);
    expect(portfolioSummary(opened.db, { today: REPORT_TODAY }).speculative).toEqual(
      risk.speculative,
    );
    expect(allocationReport(opened.db, { today: REPORT_TODAY }).speculative).toEqual(
      risk.speculative,
    );
    expect(evaluateRule('R15', {}, ruleInputs(opened.db, REPORT_TODAY))!.status).toBe('ok');
    expect(
      financeCheck(opened.db, REPORT_TODAY).keyRules.find((r) => r.code === 'R15')!.status,
    ).toBe('ok');
    expect(
      savingsProposal(opened.db, REPORT_TODAY).plans.find((p) => p.id === 'plan-coin')!.reason,
    ).not.toBe('paused_r15');
    evaluateRules(opened.db, REPORT_TODAY);
    const undone = undo(opened.db, { groupId: 'policy-R15' }, { actor: 'tester' });
    expect(portfolioAllocation(opened.db, REPORT_TODAY).risk!.speculative.breach).toBe(true);
    undo(opened.db, { groupId: undone.groupId }, { actor: 'tester' });
    expect(resolvePortfolioRiskPolicy(opened.db, REPORT_TODAY).R15.limitBp).toBe(10000);
  });

  it('R05 platform limits agree in all R14 consumers, including finance check and stored evaluations', () => {
    patch('R15', { limitBp: 10000 });
    patch('R14', { platformBp: 100, singleBp: 10000, badOverBp: 0 });
    const live = portfolioAllocation(opened.db, REPORT_TODAY).risk!;
    const summary = portfolioSummary(opened.db, { today: REPORT_TODAY });
    expect(live.cluster.platforms[0]!.breach).toBe(true);
    expect(live.cluster.limits.platformBp).toBe(100);
    expect(summary.cluster).toEqual(live.cluster);
    expect(allocationReport(opened.db, { today: REPORT_TODAY }).cluster).toEqual(live.cluster);
    expect(
      savingsProposal(opened.db, REPORT_TODAY).plans.find((p) => p.id === 'plan-coin')!.reason,
    ).toBe('paused_r14_platform');
    expect(live.proposals.find((p) => p.code === 'r14_platform')!.referenceBp).toBe(100);
    const evaluated = evaluateRule('R14', {}, ruleInputs(opened.db, REPORT_TODAY))!;
    expect(evaluated.detail['platforms']).toEqual(live.cluster.platforms);
    expect(evaluated.status).toBe('bad');
    expect(financeCheck(opened.db, REPORT_TODAY).counts.bad).toBeGreaterThan(0);
    evaluateRules(opened.db, REPORT_TODAY);
    expect(
      opened.sqlite
        .prepare("SELECT status FROM rule_result WHERE rule_id = 'rule-r14' AND as_of = ?")
        .get(REPORT_TODAY),
    ).toEqual({ status: 'bad' });
  });

  it('R06 same-date report and live allocation use stored R13 standard and class band overrides', () => {
    patch('R13', { maxBandBp: 123, relativeBandPct: 10, badFactorPct: 150 });
    opened.db.update(assetClassTarget).set({ bandBp: 0 }).run();
    opened.db
      .update(assetClassTarget)
      .set({ bandBp: 234 })
      .where(eq(assetClassTarget.assetClassId, 'world'))
      .run();
    const live = portfolioAllocation(opened.db, REPORT_TODAY);
    expect(live.classes.map((c) => c.bandBp)).toEqual([234, 123]);
    const report = allocationReport(opened.db, { today: REPORT_TODAY });
    expect(report.classes.map((c) => c.bandBp)).toEqual([234, 123]);
    expect(
      Object.fromEntries(report.history!.classes.map((c) => [c.assetClassId, c.bandBp.at(-1)])),
    ).toEqual({ world: 234, spec: 123 });
    expect(ruleInputs(opened.db, REPORT_TODAY).portfolioRiskPolicy!.R13.badFactorPct).toBe(150);
  });

  it('leveraged ETF reaches every risk consumer without rewriting market allocation or region values', () => {
    const before = allocationReport(opened.db, { today: REPORT_TODAY });
    opened.db.update(security).set({ leverageFactor: 30 }).where(eq(security.id, 'etf')).run();
    const live = portfolioAllocation(opened.db, REPORT_TODAY).risk!;
    const inputs = ruleInputs(opened.db, REPORT_TODAY);
    expect(live.speculative.grossExposureCents).toBeGreaterThan(live.speculative.totalCents);
    expect(evaluateRule('R15', {}, inputs)!.detail['shareBp']).toBe(live.speculative.shareBp);
    expect(evaluateRule('R14', {}, inputs)!.detail['singles']).toEqual(live.cluster.singles);
    const report = allocationReport(opened.db, { today: REPORT_TODAY });
    expect(report.speculative).toEqual(live.speculative);
    expect(report.totalCents).toBe(before.totalCents);
    expect(report.regions).toEqual(before.regions);
    expect(report.classes.map((c) => c.valueCents)).toEqual(
      before.classes.map((c) => c.valueCents),
    );
    expect(savingsProposal(opened.db, REPORT_TODAY).note).toBe('no_eligible_plan');
  });

  it('defaults only for absent parameters; disabled rules retain policy; corrupt stored values fail visibly', () => {
    expect(resolvePortfolioRiskPolicy(opened.db, REPORT_TODAY).R15.limitBp).toBe(1000);
    opened.db
      .update(rule)
      .set({ paramsJson: '{"limitBp":4321}', enabled: false })
      .where(eq(rule.code, 'R15'))
      .run();
    expect(resolvePortfolioRiskPolicy(opened.db, '2025-12-31').R15.limitBp).toBe(4321);
    opened.db.update(rule).set({ paramsJson: '{"limitBp":-1}' }).where(eq(rule.code, 'R15')).run();
    expect(() => resolvePortfolioRiskPolicy(opened.db, REPORT_TODAY)).toThrow('Risikoparameter');
  });
});
