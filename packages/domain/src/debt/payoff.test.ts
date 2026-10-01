import { describe, expect, it } from 'vitest';
import {
  amortize,
  comparePayoffStrategies,
  monthlyInterestCents,
  PaymentBelowInterestError,
  payoffPlan,
  simulatePayoff,
  type PayoffLoan,
} from './index';

// Prototype loan (design/prototype/vermoegen.js): 12.176 € at 6,32 %, 412 € per month, +300 €.
const LOAN = {
  balanceCents: 1_217_600,
  rateBp: 632,
  paymentCents: 41_200,
  startMonth: '2026-10',
};

describe('amortize', () => {
  it('prototype: 33 months, interest about 1.094 €, payoff June 2029', () => {
    const a = amortize(LOAN);
    expect(a.months).toBe(33);
    expect(a.payoffMonth).toBe('2029-06');
    expect(a.totalInterestCents).toBe(109_405); // float prototype: 1.094,03
    expect(a.rows[0]).toMatchObject({
      index: 0,
      month: '2026-10',
      openingCents: 1_217_600,
      interestCents: 6_413,
      principalCents: 41_200 - 6_413,
      closingCents: 1_217_600 - 34_787,
    });
    expect(a.rows.at(-1)!.closingCents).toBe(0);
  });

  it('conserves cents: paid = balance + interest + fees, rows chain, years add up', () => {
    const a = amortize({ ...LOAN, monthlyFeeCents: 150 });
    expect(a.totalPaidCents).toBe(LOAN.balanceCents + a.totalInterestCents + a.totalFeeCents);
    for (let i = 1; i < a.rows.length; i++) {
      expect(a.rows[i]!.openingCents).toBe(a.rows[i - 1]!.closingCents);
    }
    const sum = (k: 'interestCents' | 'principalCents' | 'feeCents') =>
      a.perYear.reduce((x, y) => x + y[k], 0);
    expect(sum('interestCents')).toBe(a.totalInterestCents);
    expect(sum('principalCents')).toBe(LOAN.balanceCents);
    expect(sum('feeCents')).toBe(a.totalFeeCents);
    expect(a.perYear.map((y) => y.year)).toEqual([2026, 2027, 2028, 2029]);
  });

  it('last payment is only what is owed', () => {
    const a = amortize({ ...LOAN, balanceCents: 10_000, paymentCents: 6_000, rateBp: 0 });
    expect(a.rows.map((r) => r.paymentCents)).toEqual([6_000, 4_000]);
    expect(a.totalInterestCents).toBe(0);
  });

  it('0 % rate and empty balance', () => {
    const z = amortize({ ...LOAN, balanceCents: 0 });
    expect(z).toMatchObject({ months: 0, payoffMonth: null, rows: [], perYear: [] });
    expect(monthlyInterestCents(1_000_000, 0)).toBe(0);
  });

  it('a payment not above the interest is an error (also the exact interest)', () => {
    expect(() => amortize({ ...LOAN, paymentCents: 6_413 })).toThrow(PaymentBelowInterestError);
    expect(() => amortize({ ...LOAN, paymentCents: 6_000 })).toThrow(PaymentBelowInterestError);
    expect(() => amortize({ ...LOAN, paymentCents: 6_414, maxMonths: 3 })).toThrow(/Not repaid/);
    // fees count like interest
    expect(() => amortize({ ...LOAN, paymentCents: 6_500, monthlyFeeCents: 100 })).toThrow(
      PaymentBelowInterestError,
    );
  });

  it('rejects floats and negatives', () => {
    expect(() => amortize({ ...LOAN, balanceCents: 10.5 })).toThrow(RangeError);
    expect(() => amortize({ ...LOAN, extraCents: -1 })).toThrow(RangeError);
  });

  it('horizon limit throws instead of looping', () => {
    expect(() => amortize({ ...LOAN, maxMonths: 12 })).toThrow(/Not repaid/);
  });
});

describe('payoffPlan', () => {
  it('prototype: +300 € pays off 15 months earlier and saves about 476 € interest', () => {
    const p = payoffPlan({ ...LOAN, extraCents: 30_000 });
    expect(p.base.months).toBe(33);
    expect(p.withExtra.months).toBe(18);
    expect(p.withExtra.payoffMonth).toBe('2028-03');
    expect(p.monthsEarlier).toBe(15);
    expect(p.withExtra.totalInterestCents).toBe(61_726); // float prototype: 617,27
    expect(p.interestSavedCents).toBe(109_405 - 61_726);
    expect(p.withExtra.perYear.map((y) => y.year)).toEqual([2026, 2027, 2028]);
  });

  it('no extra: nothing saved', () => {
    const p = payoffPlan({ ...LOAN, extraCents: 0 });
    expect(p.interestSavedCents).toBe(0);
    expect(p.monthsEarlier).toBe(0);
  });

  it('the regular payment must cover interest even when the extra would', () => {
    expect(() => payoffPlan({ ...LOAN, paymentCents: 6_000, extraCents: 30_000 })).toThrow(
      PaymentBelowInterestError,
    );
  });
});

// Ported from reference/finance-hub/tests/debt-strategy.test.mjs (monthly rate .01 = 1.200 bp).
const loan = (
  id: string,
  balanceCents: number,
  rateBp: number,
  minimumCents: number,
  monthlyFeeCents = 0,
): PayoffLoan => ({ id, name: id, balanceCents, rateBp, minimumCents, monthlyFeeCents });

describe('simulatePayoff (ported debt-strategy tests)', () => {
  it('avalanche and snowball conserve cents and roll freed minimums into the common budget', () => {
    const debts = [loan('high', 100_000, 1200, 10_000), loan('small', 20_000, 120, 5_000)];
    const options = { startMonth: '2026-02', extraCents: 10_000 };
    const a = simulatePayoff(debts, { ...options, strategy: 'avalanche' });
    const s = simulatePayoff(debts, { ...options, strategy: 'snowball' });
    expect(a.interestCents).toBeLessThan(s.interestCents);
    expect(a.monthlyBudgetCents).toBe(25_000);
    for (const r of [a, s]) {
      expect(r.totalPaidCents).toBe(r.startingDebtCents + r.interestCents + r.feeCents);
      expect(r.rows.at(-1)!.balanceCents).toBe(0);
      expect(r.rows.slice(0, -1).every((x) => x.paymentCents === 25_000)).toBe(true);
      expect(r.rows.every((x) => x.paymentCents <= 25_000)).toBe(true);
    }
    const smallS = s.loans.find((d) => d.id === 'small')!.paidOffMonth!;
    const highS = s.loans.find((d) => d.id === 'high')!.paidOffMonth!;
    expect(smallS).toBe('2026-03');
    expect(smallS < highS).toBe(true);
  });

  it('avalanche is the default and snowball can cost more interest', () => {
    const debts = [loan('high', 100_000, 1200, 10_000), loan('small', 20_000, 120, 5_000)];
    const cmp = comparePayoffStrategies(debts, { startMonth: '2026-02', extraCents: 10_000 });
    expect(simulatePayoff(debts, { startMonth: '2026-02', extraCents: 10_000 }).strategy).toBe(
      'avalanche',
    );
    expect(cmp.interestAdvantageCents).toBe(
      cmp.snowball.interestCents - cmp.avalanche.interestCents,
    );
    expect(cmp.interestAdvantageCents).toBeGreaterThan(0);
  });

  it('zero APR debt ends without invented interest or final overpayment', () => {
    const r = simulatePayoff([loan('a', 10_000, 0, 1_000), loan('b', 10_000, 0, 1_000)], {
      startMonth: '2026-02',
      extraCents: 1_000,
    });
    expect(r.months).toBe(7);
    expect(r.totalPaidCents).toBe(20_000);
    expect(r.interestCents).toBe(0);
    expect(r.rows.at(-1)!.paymentCents).toBe(2_000);
    expect(r.endMonth).toBe('2026-08');
  });

  it('insufficient monthly payment throws instead of inventing a payoff date', () => {
    try {
      simulatePayoff([loan('a', 100_000, 1200, 500)], { startMonth: '2026-02' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentBelowInterestError);
      expect((e as PaymentBelowInterestError).loanIds).toEqual(['a']);
    }
  });

  it('known fees are charged every month and counted', () => {
    const r = simulatePayoff([loan('a', 100_000, 1200, 20_000, 100)], { startMonth: '2026-02' });
    expect(r.feeCents).toBe(100 * r.months);
    expect(r.loans[0]!.feeCents).toBe(r.feeCents);
    expect(r.totalPaidCents).toBe(100_000 + r.interestCents + r.feeCents);
  });

  it('no loans and all-zero balances need no months', () => {
    expect(simulatePayoff([], { startMonth: '2026-02' })).toMatchObject({
      months: 0,
      endMonth: null,
    });
    expect(simulatePayoff([loan('a', 0, 500, 100)], { startMonth: '2026-02' }).months).toBe(0);
  });

  it('tie-breaks are deterministic (rate, balance, id)', () => {
    const debts = [loan('b', 50_000, 600, 1_000), loan('a', 50_000, 600, 1_000)];
    const r = simulatePayoff(debts, { startMonth: '2026-02', extraCents: 20_000 });
    expect(r.rows[0]!.loans.find((l) => l.id === 'a')!.paymentCents).toBeGreaterThan(
      r.rows[0]!.loans.find((l) => l.id === 'b')!.paymentCents,
    );
  });

  it('horizon limit throws', () => {
    expect(() =>
      simulatePayoff([loan('a', 100_000, 600, 1_000)], { startMonth: '2026-02', maxMonths: 6 }),
    ).toThrow(/Not repaid/);
  });
});
