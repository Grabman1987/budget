import { describe, expect, it } from 'vitest';
import { financialHealthAssessment, type FinancialHealthInput, type HealthSource } from './health';

const day = '2026-10-15';
const window = { from: '2025-10-01', to: '2026-09-30' };
const known = <T>(facts: T): HealthSource<T> => ({ state: 'available', asOf: day, window, facts });
const absent = { state: 'not_applicable', asOf: day, reason: 'no_portfolio' } as const;
const missing = { state: 'unavailable', asOf: day, reason: 'source_unavailable' } as const;

/** Literal case from the method document; no expected result calls production scoring helpers. */
const input = (): FinancialHealthInput => ({
  asOf: day,
  cashflow: known({ incomeCents: 100000, consumptionCents: 90000, targetBp: 2000, months: 12 }),
  reserves: known({
    reserveCents: 600000,
    averageNeedCents: 200000,
    tenthsOfMonth: 30,
    targetMonths: 6,
    months: 12,
  }),
  debt: known({
    mode: 'service',
    debtCents: 1000000,
    paymentsCents: 30000,
    incomeCents: 100000,
    ratioBp: 3000,
    maxBp: 3000,
    badOverBp: 1000,
    status: 'ok',
  }),
  structure: known({ status: 'warn', valueText: 'R13-Warnbereich', thresholdText: 'Sollband' }),
  concentration: known({ status: 'ok', valueText: 'R14 erfüllt', thresholdText: 'Konzentration' }),
  speculation: known({ status: 'bad', valueText: 'R15 verletzt', thresholdText: 'Spekulation' }),
});

describe('Financial Health v1 assessment only', () => {
  it('uses the independently specified 50,100,60 category values and 68 overall', () => {
    const result = financialHealthAssessment(input());
    expect(result.method).toBe('budget-health-v1');
    expect(result.asOf).toBe(day);
    expect(result.categories.map((c) => [c.id, c.weight, c.score])).toEqual([
      ['cashflow', 40, 50],
      ['debt', 30, 100],
      ['portfolio', 30, 60],
    ]);
    expect(result.score).toBe(68);
    expect(result.coverageBp).toBe(10000);
    expect(result.categories[0]!.metrics.map((m) => m.weight)).toEqual([50, 50]);
    expect(result.categories[2]!.metrics.map((m) => m.weight)).toEqual([40, 40, 20]);
  });

  it('excludes a verified absent portfolio weight, not an unknown portfolio', () => {
    const facts = { ...input(), structure: absent, concentration: absent, speculation: absent };
    const result = financialHealthAssessment(facts);
    // (50*40 + 100*30)/70 = 71.428..., no fabricated portfolio points.
    expect(result.score).toBe(71);
    expect(result.applicableWeight).toBe(70);
    expect(result.applicableCategories).toBe(2);
    expect(result.evaluatedCategories).toBe(2);
    expect(result.categories[2]).toMatchObject({ state: 'not_applicable', score: null });
    expect(result.coverageBp).toBe(10000);
    expect(financialHealthAssessment({ ...facts, structure: missing }).score).toBeNull();
  });

  it('keeps partial source coverage separate and never reweights missing metrics', () => {
    const result = financialHealthAssessment({ ...input(), reserves: missing });
    expect(result.score).toBeNull();
    expect(result.categories[0]).toMatchObject({ score: null, state: 'partial', coverageBp: 5000 });
    expect(result.categories[0]!.metrics[0]!.score).toBe(50);
    // Half of cashflow's 40 + debt's 30 + portfolio's 30 = 80% known.
    expect(result.coverageBp).toBe(8000);
    expect(result.evaluatedCategories).toBe(2);
    const noPortfolio = financialHealthAssessment({
      ...input(),
      reserves: missing,
      structure: absent,
      concentration: absent,
      speculation: absent,
    });
    // Known 20+30 of applicable 70 => 71.43% data coverage, still no overall score.
    expect(noPortfolio.score).toBeNull();
    expect(noPortfolio.coverageBp).toBe(7143);
  });

  it('has no score and zero coverage when no category is evaluable', () => {
    const result = financialHealthAssessment({
      asOf: day,
      cashflow: missing,
      reserves: missing,
      debt: missing,
      structure: missing,
      concentration: missing,
      speculation: missing,
    });
    expect(result.score).toBeNull();
    expect(result.coverageBp).toBe(0);
    expect(result.evaluatedCategories).toBe(0);
    expect(result.categories.every((c) => c.state === 'unavailable')).toBe(true);
  });

  it.each([
    [100001, 0],
    [100000, 0],
    [99990, 0],
    [90000, 50],
    [80100, 100],
    [80000, 100],
    [0, 100],
  ])('caps saving-capacity points at consumption %i: %i', (consumptionCents, points) => {
    // Shared savingsRate rounds to bp first: 19.90% / 20% = 99.5, rounds to 100.
    const result = financialHealthAssessment({
      ...input(),
      cashflow: known({ incomeCents: 100000, consumptionCents, targetBp: 2000, months: 1 }),
    });
    expect(result.categories[0]!.metrics[0]!.score).toBe(points);
  });

  it.each([
    [0, 0],
    [1, 2],
    [30, 50],
    [59, 98],
    [60, 100],
    [120, 100],
  ])('scores shared emergency coverage %i tenths at %i points', (tenthsOfMonth, score) => {
    const original = input().reserves;
    if (original.state !== 'available') throw new Error('Known fixture');
    const result = financialHealthAssessment({
      ...input(),
      reserves: known({ ...original.facts, tenthsOfMonth }),
    });
    expect(result.categories[0]!.metrics[1]!.score).toBe(score);
  });

  it('distinguishes true zero capacity/reserves from missing or unusable income', () => {
    const facts = input();
    const zero = financialHealthAssessment({
      ...facts,
      cashflow: known({ incomeCents: 100000, consumptionCents: 100000, targetBp: 2000, months: 1 }),
      reserves: known({
        reserveCents: 0,
        averageNeedCents: 20000,
        tenthsOfMonth: 0,
        targetMonths: 6,
        months: 1,
      }),
    });
    expect(zero.categories[0]).toMatchObject({ score: 0, state: 'complete', coverageBp: 10000 });
    const noIncome = financialHealthAssessment({
      ...facts,
      cashflow: known({ incomeCents: 0, consumptionCents: 0, targetBp: 2000, months: 1 }),
    });
    expect(noIncome.categories[0]!.metrics[0]!.score).toBeNull();
    expect(noIncome.score).toBeNull();
  });

  it('allows zero configured saving target only for nonnegative known capacity', () => {
    for (const [consumptionCents, score] of [
      [100000, 100],
      [100001, 0],
    ] as const) {
      const result = financialHealthAssessment({
        ...input(),
        cashflow: known({ incomeCents: 100000, consumptionCents, targetBp: 0, months: 1 }),
      });
      expect(result.categories[0]!.metrics[0]!.score).toBe(score);
    }
  });

  it('does not claim target attainment merely because points round up to 100', () => {
    const data = financialHealthAssessment({
      ...input(),
      cashflow: known({ incomeCents: 100000, consumptionCents: 80100, targetBp: 2000, months: 1 }),
      reserves: known({
        reserveCents: 11999000,
        averageNeedCents: 10000,
        tenthsOfMonth: 11999,
        targetMonths: 1200,
        months: 12,
      }),
    });
    for (const metric of data.categories[0]!.metrics) {
      expect(metric.score).toBe(100);
      expect(metric.explanation).toContain('unter');
      expect(metric.explanation).not.toContain('erreicht');
    }
  });

  it('does not turn unknown liabilities into debt-free health', () => {
    expect(
      financialHealthAssessment({ ...input(), debt: missing }).categories[1]!.score,
    ).toBeNull();
    const noDebt = financialHealthAssessment({
      ...input(),
      debt: known({
        mode: 'no_debt',
        debtCents: 0,
        paymentsCents: 0,
        incomeCents: null,
        ratioBp: null,
        maxBp: 3000,
        badOverBp: 1000,
        status: 'ok',
      }),
    });
    expect(noDebt.categories[1]!.score).toBe(100);
    expect(
      financialHealthAssessment({
        ...input(),
        debt: known({
          mode: 'no_debt',
          debtCents: 1,
          paymentsCents: 0,
          incomeCents: null,
          ratioBp: null,
          maxBp: 3000,
          badOverBp: 1000,
          status: 'ok',
        }),
      }).score,
    ).toBeNull();
  });

  it('rejects unsafe/fractional source cents and mismatched assessment days', () => {
    for (const incomeCents of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1.5]) {
      const result = financialHealthAssessment({
        ...input(),
        cashflow: known({ incomeCents, consumptionCents: 0, targetBp: 2000, months: 1 }),
      });
      expect(result.categories[0]!.metrics[0]).toMatchObject({
        score: null,
        reason: 'invalid_source',
      });
    }
    const facts = input();
    const result = financialHealthAssessment({
      ...facts,
      reserves: { ...facts.reserves, asOf: '2026-10-16' },
    });
    expect(result.score).toBeNull();
    expect(result.categories[0]!.metrics[1]!.reason).toBe('date_mismatch');
  });

  it('rounds the displayed category first, remains deterministic and does not mutate facts', () => {
    const facts = input();
    facts.cashflow = known({
      incomeCents: 100000,
      consumptionCents: 98600,
      targetBp: 2000,
      months: 1,
    });
    facts.reserves = known({
      reserveCents: 0,
      averageNeedCents: 20000,
      tenthsOfMonth: 0,
      targetMonths: 6,
      months: 1,
    });
    const before = JSON.stringify(facts);
    const one = financialHealthAssessment(facts);
    // Capacity 7, reserve 0: cashflow 3.5 rounds to 4; 4*.4+100*.3+60*.3=49.6 => 50.
    // Aggregating the unrounded 3.5 would yield 49 instead.
    expect(one.categories[0]!.score).toBe(4);
    expect(one.score).toBe(50);
    expect(financialHealthAssessment(facts)).toEqual(one);
    expect(JSON.stringify(facts)).toBe(before);
  });
});
