import { describe, expect, it } from 'vitest';
import {
  amortize,
  comparePayoffStrategies,
  compareLoanScenario,
  loanScenarioInputSchema,
  measuresBeforeStart,
  PaymentBelowInterestError,
  rateInForce,
  simulateLoan,
  simulatePayoff,
  type LoanTermsInput,
} from './index';

const flat = (over: Partial<LoanTermsInput> = {}): LoanTermsInput => ({
  balanceCents: 100_000,
  startMonth: '2026-10',
  rateBp: 0,
  installmentCents: 10_000,
  monthlyFeeCents: 0,
  ...over,
});

describe('rateInForce', () => {
  const changes = [
    { month: '2027-03', rateBp: 400 },
    { month: '2026-06', rateBp: 300 },
  ];
  it('uses the latest change that has started, else the base rate (any order)', () => {
    expect(rateInForce(200, changes, '2026-05')).toBe(200);
    expect(rateInForce(200, changes, '2026-06')).toBe(300);
    expect(rateInForce(200, changes, '2027-02')).toBe(300);
    expect(rateInForce(200, changes, '2027-03')).toBe(400);
    expect(rateInForce(200, changes, '2040-01')).toBe(400);
  });
  it('same month: the later entry wins', () => {
    expect(
      rateInForce(
        100,
        [
          { month: '2026-10', rateBp: 500 },
          { month: '2026-10', rateBp: 700 },
        ],
        '2026-10',
      ),
    ).toBe(700);
  });
});

describe('simulateLoan baseline', () => {
  it('matches the single-rate amortisation (prototype loan, 33 months)', () => {
    const terms = flat({
      balanceCents: 1_217_600,
      rateBp: 632,
      installmentCents: 41_200,
    });
    const a = amortize({
      balanceCents: 1_217_600,
      rateBp: 632,
      paymentCents: 41_200,
      startMonth: '2026-10',
    });
    const s = simulateLoan(terms);
    expect(s.months).toBe(33);
    expect(s.payoffMonth).toBe('2029-06');
    expect(s.totalInterestCents).toBe(a.totalInterestCents);
    expect(s.totalPaidCents).toBe(a.totalPaidCents);
    expect(s.rows.map((r) => r.closingCents)).toEqual(a.rows.map((r) => r.closingCents));
  });

  it('conserves cents with fee: paid = balance + interest + fees, rows chain, years add up', () => {
    const s = simulateLoan(flat({ balanceCents: 500_000, rateBp: 450, monthlyFeeCents: 150 }));
    expect(s.totalPaidCents).toBe(500_000 + s.totalInterestCents + s.totalFeeCents);
    for (let i = 1; i < s.rows.length; i++)
      expect(s.rows[i]!.openingCents).toBe(s.rows[i - 1]!.closingCents);
    expect(s.perYear.reduce((a, y) => a + y.principalCents, 0)).toBe(500_000);
    expect(s.perYear.reduce((a, y) => a + y.interestCents, 0)).toBe(s.totalInterestCents);
    expect(s.rows.at(-1)!.closingCents).toBe(0);
  });

  it('empty balance has no rows; installment below interest throws', () => {
    expect(simulateLoan(flat({ balanceCents: 0 }))).toMatchObject({
      months: 0,
      payoffMonth: null,
      rows: [],
    });
    expect(() => simulateLoan(flat({ rateBp: 12_000, installmentCents: 5_000 }))).toThrow(
      PaymentBelowInterestError,
    );
    expect(() => simulateLoan(flat({ installmentCents: 0 }))).toThrow(PaymentBelowInterestError);
  });

  it('rejects out-of-range input', () => {
    expect(() => simulateLoan(flat({ startMonth: '2026-13' }))).toThrow(RangeError);
    expect(() => simulateLoan(flat({ balanceCents: -1 }))).toThrow(RangeError);
    expect(() => simulateLoan(flat({ installmentCents: 1.5 }))).toThrow(RangeError);
    expect(() => simulateLoan(flat({ maxMonths: 3 }))).toThrow(/Not repaid within 3/);
  });
});

describe('variable conditions (dated rate changes)', () => {
  // 1 000 € at 12 %, 500 € per month: interest 10,00 in month 0.
  const terms = flat({ rateBp: 1200, installmentCents: 50_000 });

  it('literal schedule without and with a change to 0 % from November', () => {
    const base = simulateLoan(terms);
    expect(base.rows.map((r) => [r.interestCents, r.paymentCents, r.closingCents])).toEqual([
      [1000, 50_000, 51_000],
      [510, 50_000, 1_510],
      [15, 1_525, 0],
    ]);
    const varied = simulateLoan({ ...terms, rateChanges: [{ month: '2026-11', rateBp: 0 }] });
    expect(varied.rows.map((r) => [r.rateBp, r.interestCents, r.closingCents])).toEqual([
      [1200, 1000, 51_000],
      [0, 0, 1_000],
      [0, 0, 0],
    ]);
    expect(varied.totalInterestCents).toBe(1000);
  });

  it('a change on or before the start replaces the base rate', () => {
    const s = simulateLoan({ ...terms, rateChanges: [{ month: '2026-01', rateBp: 0 }] });
    expect(s.totalInterestCents).toBe(0);
  });

  it('a rising rate that the installment no longer covers throws', () => {
    expect(() =>
      simulateLoan(flat({ rateBp: 600, installmentCents: 1_000 }), [
        { kind: 'rate_change', fromMonth: '2026-12', rateBp: 60_000 },
      ]),
    ).toThrow(PaymentBelowInterestError);
  });
});

describe('scenarios', () => {
  it('one-off Sondertilgung shortens the term and is capped at what is owed', () => {
    const s = simulateLoan(flat(), [{ kind: 'one_off', month: '2026-12', amountCents: 30_000 }]);
    expect(s.months).toBe(7);
    expect(s.totalExtraCents).toBe(30_000);
    expect(s.rows[2]).toMatchObject({
      regularCents: 10_000,
      extraCents: 30_000,
      paymentCents: 40_000,
    });
    const huge = simulateLoan(flat(), [
      { kind: 'one_off', month: '2026-10', amountCents: 9_999_999 },
    ]);
    expect(huge.months).toBe(1);
    expect(huge.rows[0]!.paymentCents).toBe(100_000);
    expect(huge.rows[0]!.extraCents).toBe(90_000);
  });

  it('recurring Sondertilgung honours interval and end month', () => {
    const quarterly = simulateLoan(flat(), [
      {
        kind: 'recurring',
        fromMonth: '2026-10',
        toMonth: null,
        everyMonths: 3,
        amountCents: 5_000,
      },
    ]);
    expect(quarterly.months).toBe(9);
    expect(quarterly.totalExtraCents).toBe(15_000);
    expect(quarterly.rows.filter((r) => r.extraCents > 0).map((r) => r.month)).toEqual([
      '2026-10',
      '2027-01',
      '2027-04',
    ]);
    const bounded = simulateLoan(flat(), [
      {
        kind: 'recurring',
        fromMonth: '2026-10',
        toMonth: '2026-11',
        everyMonths: 1,
        amountCents: 5_000,
      },
    ]);
    expect(bounded.totalExtraCents).toBe(10_000);
  });

  it('a higher installment replaces the installment from its month on', () => {
    const s = simulateLoan(flat(), [
      { kind: 'installment', fromMonth: '2027-01', installmentCents: 20_000 },
    ]);
    expect(s.rows.map((r) => r.regularCents)).toEqual([
      10_000, 10_000, 10_000, 20_000, 20_000, 20_000, 10_000,
    ]);
    expect(s.totalExtraCents).toBe(0);
  });

  it('compare: interest saved, months earlier, total paid delta', () => {
    const terms = flat({ balanceCents: 1_000_000, rateBp: 600, installmentCents: 50_000 });
    const c = compareLoanScenario(terms, [
      {
        kind: 'recurring',
        fromMonth: '2026-10',
        toMonth: null,
        everyMonths: 1,
        amountCents: 50_000,
      },
    ]);
    expect(c.monthsEarlier).toBe(c.baseline.months - c.scenario.months);
    expect(c.monthsEarlier).toBeGreaterThan(0);
    expect(c.interestSavedCents).toBe(
      c.baseline.totalInterestCents - c.scenario.totalInterestCents,
    );
    expect(c.interestSavedCents).toBeGreaterThan(0);
    expect(c.totalPaidDeltaCents).toBe(-c.interestSavedCents);
    const worse = compareLoanScenario(terms, [
      { kind: 'rate_change', fromMonth: '2027-01', rateBp: 1200 },
    ]);
    expect(worse.interestSavedCents).toBeLessThan(0);
    expect(worse.monthsEarlier).toBeLessThanOrEqual(0);
  });

  it('a scenario rate change wins over a persisted change of the same month', () => {
    const terms = flat({
      balanceCents: 1_000_000,
      rateBp: 600,
      installmentCents: 50_000,
      rateChanges: [{ month: '2027-01', rateBp: 900 }],
    });
    const s = simulateLoan(terms, [{ kind: 'rate_change', fromMonth: '2027-01', rateBp: 300 }]);
    expect(s.rows.find((r) => r.month === '2027-01')!.rateBp).toBe(300);
  });
});

describe('scenario input', () => {
  const ok = {
    name: ' Sondertilgung ',
    measures: [{ kind: 'one_off', month: '2027-01', amountCents: 100 }],
  };
  it('trims and validates', () => {
    expect(loanScenarioInputSchema.parse(ok).name).toBe('Sondertilgung');
    expect(loanScenarioInputSchema.safeParse({ ...ok, name: '  ' }).success).toBe(false);
    expect(loanScenarioInputSchema.safeParse({ ...ok, measures: [] }).success).toBe(false);
    expect(
      loanScenarioInputSchema.safeParse({
        name: 'x',
        measures: [{ kind: 'one_off', month: '2027-13', amountCents: 100 }],
      }).success,
    ).toBe(false);
    expect(
      loanScenarioInputSchema.safeParse({
        name: 'x',
        measures: [{ kind: 'one_off', month: '2027-01', amountCents: 0 }],
      }).success,
    ).toBe(false);
  });
  it('refuses a recurring end before its start and duplicate rate changes', () => {
    expect(
      loanScenarioInputSchema.safeParse({
        name: 'x',
        measures: [
          {
            kind: 'recurring',
            fromMonth: '2027-05',
            toMonth: '2027-01',
            everyMonths: 1,
            amountCents: 5,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      loanScenarioInputSchema.safeParse({
        name: 'x',
        measures: [
          { kind: 'rate_change', fromMonth: '2027-05', rateBp: 1 },
          { kind: 'rate_change', fromMonth: '2027-05', rateBp: 2 },
        ],
      }).success,
    ).toBe(false);
  });
  it('flags Sondertilgungen entirely before the start', () => {
    expect(
      measuresBeforeStart(
        [
          { kind: 'one_off', month: '2026-01', amountCents: 5 },
          { kind: 'one_off', month: '2026-10', amountCents: 5 },
          { kind: 'rate_change', fromMonth: '2020-01', rateBp: 5 },
          {
            kind: 'recurring',
            fromMonth: '2026-01',
            toMonth: '2026-05',
            everyMonths: 1,
            amountCents: 5,
          },
          {
            kind: 'recurring',
            fromMonth: '2026-01',
            toMonth: null,
            everyMonths: 1,
            amountCents: 5,
          },
        ],
        '2026-10',
      ),
    ).toEqual([0, 3]);
  });
});

describe('several debts: avalanche against snowball (card included)', () => {
  const loans = [
    { id: 'card', name: 'Karte', balanceCents: 200_000, rateBp: 300, minimumCents: 5_000 },
    { id: 'loan', name: 'Kredit', balanceCents: 800_000, rateBp: 1500, minimumCents: 20_000 },
  ];
  it('extra money goes to the highest rate (avalanche) or the smallest balance (snowball)', () => {
    const cmp = comparePayoffStrategies(loans, { extraCents: 30_000, startMonth: '2026-10' });
    const first = (r: typeof cmp.avalanche) => r.rows[0]!.loans.map((l) => [l.id, l.paymentCents]);
    expect(first(cmp.avalanche)).toEqual([
      ['card', 5_000],
      ['loan', 50_000],
    ]);
    expect(first(cmp.snowball)).toEqual([
      ['card', 35_000],
      ['loan', 20_000],
    ]);
    expect(cmp.interestAdvantageCents).toBeGreaterThan(0);
    expect(cmp.avalanche.interestCents).toBeLessThan(cmp.snowball.interestCents);
  });
  it('freed minimums stay in the budget; both strategies pay the same principal', () => {
    const cmp = comparePayoffStrategies(loans, { extraCents: 30_000, startMonth: '2026-10' });
    for (const r of [cmp.avalanche, cmp.snowball]) {
      expect(r.totalPaidCents).toBe(1_000_000 + r.interestCents + r.feeCents);
      expect(r.monthlyBudgetCents).toBe(55_000);
    }
  });
  it('extra money beats minimum-only payments; unpayable minimums throw', () => {
    const minimumOnly = simulatePayoff(loans, { startMonth: '2026-10' });
    const withExtra = simulatePayoff(loans, { extraCents: 30_000, startMonth: '2026-10' });
    expect(withExtra.interestCents).toBeLessThan(minimumOnly.interestCents);
    expect(withExtra.months).toBeLessThan(minimumOnly.months);
    expect(() =>
      simulatePayoff([{ ...loans[1]!, minimumCents: 1_000 }], { startMonth: '2026-10' }),
    ).toThrow(PaymentBelowInterestError);
  });
});
