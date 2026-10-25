import { describe, expect, it } from 'vitest';
import { calculateFunding, fundingTemplate } from './funding-plan';

describe('owner-configured funding scenario', () => {
  it('separates recurring rates from one-off money and splits the six sleeves exactly', () => {
    const p = fundingTemplate();
    p.monthlyCents = 40000;
    p.oneOffCents = 1000000;
    const r = calculateFunding(p);
    expect(r.stage).toBe(2);
    expect(r.rows.map((x) => x.monthlyCents)).toEqual([20000, 8000, 4000, 2000, 2000, 4000]);
    expect(r.rows.map((x) => x.budgetCents)).toEqual([
      520000, 208000, 104000, 52000, 52000, 104000,
    ]);
    expect(r.remainingCents).toBe(1040000); // No quotes, no invented orders.
  });
  it('selects exact wealth boundaries only in automatic mode; explicit stage stays fixed', () => {
    const p = fundingTemplate();
    p.stage = null;
    for (const [cash, stage] of [
      [999999, 0],
      [1000000, 1],
      [4999999, 1],
      [5000000, 2],
    ]) {
      p.oneOffCents = cash!;
      expect(calculateFunding(p).stage).toBe(stage);
    }
    p.stage = 2;
    p.oneOffCents = 0;
    expect(calculateFunding(p).stage).toBe(2);
  });
  it('buys only deficits, retains skipped budgets and never proposes sales', () => {
    const p = fundingTemplate();
    p.monthlyCents = 40000;
    p.rows[2]!.valueCents = 100000;
    const r = calculateFunding(p);
    expect(r.rows[2]!.budgetCents).toBe(0);
    expect(r.rows[2]!.overweightCents).toBe(86000);
    expect(r.rows.reduce((sum, x) => sum + x.budgetCents, 0)).toBe(40000);
  });
  it('uses integer units and fees inside the budget, suppressing costly orders', () => {
    const p = fundingTemplate();
    p.rows = [p.rows[0]!];
    p.stages = [{ fromCents: 0, weights: [10000] }];
    p.stage = 0;
    p.monthlyCents = 10000;
    p.rows[0]!.priceCents = 3000;
    p.fixedFeeCents = 150;
    p.variableFeeBp = 10;
    p.maxFeeBp = 1000;
    const r = calculateFunding(p);
    expect(r.rows[0]).toMatchObject({ unitsE8: 300000000, buyCents: 9000, feeCents: 159 });
    expect(r.remainingCents).toBe(841);
    p.maxFeeBp = 50;
    expect(calculateFunding(p).rows[0]).toMatchObject({ buyCents: 0, feeCents: 0 });
    expect(calculateFunding(p).remainingCents).toBe(10000);
  });
  it('supports fractional crypto and exact odd cents without overspending', () => {
    const p = fundingTemplate();
    p.monthlyCents = 40001;
    p.rows.forEach((row) => {
      row.fractional = true;
      row.priceCents = 10000000;
    });
    const r = calculateFunding(p);
    expect(r.rows.map((x) => x.monthlyCents)).toEqual([20001, 8000, 4000, 2000, 2000, 4000]);
    expect(r.rows[4]!.unitsE8).toBe(20000);
    expect(r.remainingCents).toBe(0);
  });
  it('rejects incomplete weights, negative values, duplicate instruments and unsafe sums', () => {
    const p = fundingTemplate();
    p.stages[2]!.weights[0] = 4999;
    expect(() => calculateFunding(p)).toThrow();
    p.stages[2]!.weights[0] = 5000;
    p.rows[0]!.valueCents = -1;
    expect(() => calculateFunding(p)).toThrow();
    p.rows[0]!.valueCents = 0;
    p.rows[0]!.securityId = p.rows[1]!.securityId = 'same';
    expect(() => calculateFunding(p)).toThrow();
    p.rows[1]!.securityId = null;
    p.oneOffCents = Number.MAX_SAFE_INTEGER;
    p.freeCashCents = 1;
    expect(() => calculateFunding(p)).toThrow();
  });
});
