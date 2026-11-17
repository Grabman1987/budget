/// <reference types="node" />
import { createHash } from 'node:crypto';
import replayFixture from './fixtures/replay.json';
import { describe, expect, it } from 'vitest';
import {
  applyAssumptions,
  canonicalJson,
  deserializeScenario,
  diff,
  evaluate,
  serializeScenario,
  type Assumption,
  type Scenario,
  type Snapshot,
} from './index';

const cashAccount = {
  onBudget: true,
  role: 'budget',
  closedAt: null,
  openingDate: '2020-01-01',
  currency: 'EUR' as const,
};
const baseline = (): Snapshot => ({
  asOf: '2028-01-30',
  through: '2028-03-31',
  accounts: [
    { ...cashAccount, id: 'pay', balanceCents: 10_000 },
    { ...cashAccount, id: 'reserve', balanceCents: 90_000, role: 'reserve' },
  ],
  items: [
    {
      id: 'income-jan',
      accountId: 'pay',
      day: '2028-01-31',
      cents: 20_000,
      kind: 'income',
      expected: true,
      paymentId: 'income',
    },
    {
      id: 'cost',
      accountId: 'pay',
      day: '2028-02-01',
      cents: -15_000,
      kind: 'fixed',
      expected: false,
    },
    {
      id: 'income-feb',
      accountId: 'pay',
      day: '2028-02-29',
      cents: 20_001,
      kind: 'income',
      expected: true,
      paymentId: 'income',
    },
  ],
  loans: [],
  savingsPlans: [],
});
const scenario = (assumptions: Assumption[] = []): Scenario => ({
  version: 1,
  id: 'synthetic-f12',
  name: 'Testplan',
  baselineAsOf: '2028-01-30',
  baseline: baseline(),
  assumptions,
});
const horizon = { through: '2028-03-31', bufferCents: 1000 };
const result = (assumptions: Assumption[], input = baseline()) =>
  evaluate(applyAssumptions(input, assumptions), horizon);
const cash = (assumptions: Assumption[], day: string, input = baseline(), accountId = 'pay') =>
  result(assumptions, input)
    .outcomes[0]!.withExpectedInflows.accounts.find((a) => a.accountId === accountId)!
    .series.find((d) => d.day === day)!.cents;

describe('verifiable scenario', () => {
  it('derives payment eligibility from the same dated account facts as Heute', () => {
    const input = baseline();
    Object.assign(input.accounts[0]!, {
      onBudget: true,
      role: 'reserve',
      closedAt: null,
      openingDate: '2020-01-01',
      currency: 'EUR',
    });
    input.accounts[0]!.balanceCents = -701;
    const outcome = evaluate(input, { through: input.asOf }).outcomes[0]!.withExpectedInflows;
    expect(outcome.accounts[0]!.series[0]!.cents).toBe(-701);
    expect(outcome.firstBelowZero).toEqual([]);
  });
  it('rejects a supplied cash leg that duplicates a generated savings leg', () => {
    const input = baseline();
    input.savingsPlans = [
      {
        id: 'saving',
        fromAccountId: 'pay',
        toAccountId: 'reserve',
        dayOfMonth: 29,
        monthlyCents: 1001,
      },
    ];
    input.items.push({
      id: 'savings:saving:2028-02-29:out',
      accountId: 'pay',
      day: '2028-02-29',
      cents: -1001,
      kind: 'event',
      expected: false,
    });
    expect(() => evaluate(input, horizon)).toThrow('Duplicate identity');
    expect(() => serializeScenario({ ...scenario(), baseline: input })).toThrow(
      'Duplicate identity',
    );
  });
  it('rejects supplied loan legs and duplicate repayment identities before counting cash twice', () => {
    const input = baseline();
    input.loans = [
      {
        id: 'loan',
        accountId: 'pay',
        paymentDay: 29,
        terms: {
          balanceCents: 1001,
          startMonth: '2028-02',
          rateBp: 0,
          installmentCents: 1001,
          monthlyFeeCents: 0,
          rateChanges: [],
        },
        repayments: [],
      },
    ];
    input.items.push({
      id: 'loan:loan:2028-02',
      accountId: 'pay',
      day: '2028-02-29',
      cents: -1001,
      kind: 'fixed',
      expected: false,
    });
    expect(() => evaluate(input, horizon)).toThrow('Duplicate identity');
    input.items.pop();
    input.loans[0]!.repayments = [
      { assumptionId: 'same', date: '2028-02-05', amountCents: 1 },
      { assumptionId: 'same', date: '2028-02-06', amountCents: 1 },
    ];
    expect(() => evaluate(input, horizon)).toThrow('Duplicate identity');
  });
  it.each([
    { onBudget: false },
    { role: 'reserve' },
    { role: null },
    { closedAt: '2028-01-29' },
    { openingDate: '2028-01-31' },
  ])('excludes ineligible account facts from payment breaches: %j', (patch) => {
    const input = baseline();
    Object.assign(input.accounts[0]!, patch, { balanceCents: -701 });
    const outcome = evaluate(input, { through: input.asOf }).outcomes[0]!.withExpectedInflows;
    expect(outcome.firstBelowZero).toEqual([]);
    expect(outcome.accounts[0]!.series[0]!.cents).toBe(-701);
  });
  it('rejects unsupported currencies instead of summing foreign cents as EUR', () => {
    const input = baseline();
    Object.assign(input.accounts[0]!, { currency: 'USD' });
    expect(() => evaluate(input, horizon)).toThrow();
  });
  it('rejects repeated savings-change provenance before applying the delta twice', () => {
    const input = baseline();
    input.savingsPlans = [
      {
        id: 'saving',
        fromAccountId: 'pay',
        toAccountId: 'reserve',
        dayOfMonth: 29,
        monthlyCents: 1001,
        changes: [
          { assumptionId: 'same', from: '2028-02-01', deltaMonthlyCents: 1 },
          { assumptionId: 'same', from: '2028-02-01', deltaMonthlyCents: 1 },
        ],
      },
    ];
    expect(() => evaluate(input, horizon)).toThrow('Duplicate identity');
  });
  it('no assumptions returns the baseline unchanged, including object identity', () => {
    const input = baseline();
    expect(applyAssumptions(input, [])).toBe(input);
    expect(result([])).toEqual(evaluate(input, horizon));
  });
  it('delays only the named inflow by calendar days across month-end', () => {
    const input = baseline();
    const saved = canonicalJson(input);
    const assumptions: Assumption[] = [
      { id: 'delay', kind: 'delayedIncome', inflowId: 'income-jan', days: 3 },
    ];
    expect(cash(assumptions, '2028-02-01', input)).toBe(-5000);
    expect(cash(assumptions, '2028-02-03', input)).toBe(15_000);
    expect(cash(assumptions, '2028-02-29', input)).toBe(35_001);
    expect(canonicalJson(input)).toBe(saved);
    const adjusted = applyAssumptions(input, assumptions) as Snapshot;
    expect(adjusted.items[1]).toEqual(input.items[1]);
    expect(adjusted.items[2]).toEqual(input.items[2]);
    expect(adjusted.accounts).toEqual(input.accounts);
  });
  it('interrupts only the named source inclusively and rounds a share to cents', () => {
    const input = baseline();
    input.items.push({
      id: 'other',
      accountId: 'reserve',
      day: '2028-02-29',
      cents: 700,
      kind: 'income',
      expected: true,
      paymentId: 'other',
    });
    const assumptions: Assumption[] = [
      {
        id: 'pause',
        kind: 'incomeInterruption',
        paymentId: 'income',
        from: '2028-02-29',
        to: '2028-02-29',
        shareBp: 5000,
      },
    ];
    expect(cash(assumptions, '2028-02-29', input)).toBe(25_000);
    expect(cash(assumptions, '2028-02-29', input, 'reserve')).toBe(90_700);
    expect(cash(assumptions, '2028-01-31', input)).toBe(30_000);
  });
  it('reports an account shortfall even when the household stays positive, including weekend date', () => {
    const outcome = result([
      {
        id: 'purchase',
        kind: 'largerPurchase',
        accountId: 'pay',
        date: '2028-02-05',
        amountCents: 16_000,
      },
    ]).outcomes[0]!.withExpectedInflows;
    expect(outcome.firstBelowZero).toEqual([{ accountId: 'pay', day: '2028-02-05', cents: -1000 }]);
    expect(outcome.accounts[0]!.lowest).toEqual({ day: '2028-02-05', cents: -1000, index: 6 });
    expect(outcome.household.lowest).toEqual({ day: '2028-02-05', cents: 89_000 });
  });
  it('reports strict buffer breaches, opening shortfalls, ties and payment-account eligibility', () => {
    const input = baseline();
    input.accounts[0]!.balanceCents = 1000;
    input.accounts[1]!.balanceCents = -10;
    expect(
      evaluate(input, { through: input.asOf, bufferCents: 1000 }).outcomes[0]!.withExpectedInflows
        .firstBelowBuffer,
    ).toEqual([]);
    input.accounts[0]!.balanceCents = -1;
    const projection = evaluate(input, { through: '2028-01-31', bufferCents: 1000 }).outcomes[0]!
      .withExpectedInflows;
    expect(projection.firstBelowZero).toEqual([{ accountId: 'pay', day: '2028-01-30', cents: -1 }]);
  });
  it('keeps expected inflows separate and never adds overdraft money', () => {
    const outcome = result([]).outcomes[0]!;
    expect(outcome.withExpectedInflows.accounts[0]!.series[2]!.cents).toBe(15_000);
    expect(outcome.withoutExpectedInflows.firstBelowZero).toEqual([
      { accountId: 'pay', day: '2028-02-01', cents: -5000 },
    ]);
    expect(outcome.expectedInflows.map((i) => i.cents)).toEqual([20_000, 20_001]);
  });
  it('changes a named monthly savings transfer without changing household money or another plan', () => {
    const input = baseline();
    input.savingsPlans = [
      {
        id: 'saving',
        fromAccountId: 'pay',
        toAccountId: 'reserve',
        dayOfMonth: 31,
        monthlyCents: 1000,
      },
      {
        id: 'other',
        fromAccountId: 'pay',
        toAccountId: 'reserve',
        dayOfMonth: 15,
        monthlyCents: 100,
      },
    ];
    const assumptions: Assumption[] = [
      {
        id: 'rate',
        kind: 'changedSavingsRate',
        savingsPlanId: 'saving',
        from: '2028-02-01',
        deltaMonthlyCents: 500,
      },
    ];
    expect(cash(assumptions, '2028-01-31', input)).toBe(29_000);
    expect(cash(assumptions, '2028-02-29', input)).toBe(32_401);
    expect(cash(assumptions, '2028-03-31', input)).toBe(30_801);
    expect(result(assumptions, input).outcomes[0]!.withExpectedInflows.household).toEqual(
      result([], input).outcomes[0]!.withExpectedInflows.household,
    );
    expect(
      cash(
        [
          {
            ...assumptions[0]!,
            kind: 'changedSavingsRate',
            savingsPlanId: 'saving',
            from: '2028-02-01',
            deltaMonthlyCents: -1000,
          },
        ],
        '2028-03-31',
        input,
      ),
    ).toBe(33_801);
  });
  it('reuses the loan plan, caps special repayments and removes later regular payments', () => {
    const input = baseline();
    input.loans = [
      {
        id: 'loan',
        accountId: 'pay',
        paymentDay: 29,
        terms: {
          balanceCents: 10_000,
          startMonth: '2028-02',
          rateBp: 1200,
          installmentCents: 4000,
          monthlyFeeCents: 0,
          rateChanges: [],
        },
        repayments: [],
      },
    ];
    const assumptions: Assumption[] = [
      {
        id: 'extra',
        kind: 'specialLoanRepayment',
        loanId: 'loan',
        date: '2028-02-05',
        amountCents: 20_000,
      },
    ];
    // Existing monthly model: interest 100, regular 4,000, capped extra 6,100.
    expect(cash(assumptions, '2028-02-05', input)).toBe(8900);
    expect(cash(assumptions, '2028-02-29', input)).toBe(24_901);
    expect(cash(assumptions, '2028-03-31', input)).toBe(24_901);
    expect(cash([], '2028-03-31', input)).toBe(27_001);
    expect(input.loans[0]!.repayments).toEqual([]);
  });
  it('uses the existing cent-conserving variable forecast', () => {
    const input = baseline();
    input.items = [];
    input.accounts[0]!.variableMonthlyCents = 2900;
    expect(cash([], '2028-02-29', input)).toBe(7006);
  });
  it('retains every possible delay including interior days instead of guessing a precise date', () => {
    const assumptions: Assumption[] = [
      { id: 'range', kind: 'delayedIncome', inflowId: 'income-jan', days: { min: 0, max: 3 } },
    ];
    const evaluated = result(assumptions);
    expect(evaluated.certainty).toBe('range');
    expect(evaluated.range!.accounts[0]!.withExpectedInflows).toMatchObject({
      minCents: -5000,
      maxCents: 10_000,
    });
    expect(result([])).not.toHaveProperty('range');
    expect(evaluated.outcomes.map((o) => o.expectedInflows[0]!.day)).toEqual([
      '2028-01-31',
      '2028-02-01',
      '2028-02-02',
      '2028-02-03',
    ]);
    expect(evaluated.outcomes.map((o) => o.withExpectedInflows.accounts[0]!.lowest.cents)).toEqual([
      10_000, 10_000, -5000, -5000,
    ]);
    expect(result([]).certainty).toBe('conditional');
  });
  it('attributes differences to named assumptions with deterministic German explanations', () => {
    const saved = scenario([
      {
        id: 'purchase',
        kind: 'largerPurchase',
        accountId: 'pay',
        date: '2028-02-05',
        amountCents: 16_000,
      },
      { id: 'delay', kind: 'delayedIncome', inflowId: 'income-feb', days: 1 },
    ]);
    const differences = diff(saved.baseline, saved, horizon);
    expect(
      differences.find((d) => d.figure === 'withExpectedInflows.account.pay.2028-02-05'),
    ).toEqual({
      figure: 'withExpectedInflows.account.pay.2028-02-05',
      baseValue: [15_000],
      scenarioValue: [-1000],
      assumptionIds: ['purchase'],
      explanationDe:
        'Kontostand „pay“ am 2028-02-05 mit erwarteten Eingängen: Basis 150,00 €; Szenario −10,00 €. Annahmen: „purchase“. Mehrere Werte sind mögliche Ergebnisse, keine Wahrscheinlichkeiten.',
    });
    expect(
      differences.find((d) => d.figure === 'withExpectedInflows.account.pay.2028-02-29')!
        .assumptionIds,
    ).toEqual(['purchase', 'delay']);
    expect(diff(saved.baseline, saved, horizon)).toEqual(differences);
    expect(diff(baseline(), scenario(), horizon)).toEqual([]);
  });
  it('rejects unknown targets, invalid dates, fractional cents and unsupported coverage', () => {
    expect(() =>
      result([{ id: 'bad', kind: 'delayedIncome', inflowId: 'missing', days: 1 }]),
    ).toThrow();
    expect(() =>
      result([
        {
          id: 'bad',
          kind: 'largerPurchase',
          accountId: 'missing',
          date: '2028-02-01',
          amountCents: 1,
        },
      ]),
    ).toThrow();
    expect(() =>
      result([
        { id: 'bad', kind: 'largerPurchase', accountId: 'pay', date: '2028-02-30', amountCents: 1 },
      ]),
    ).toThrow();
    expect(() =>
      result([
        {
          id: 'bad',
          kind: 'largerPurchase',
          accountId: 'pay',
          date: '2028-02-01',
          amountCents: 0.5,
        },
      ]),
    ).toThrow();
    expect(() => evaluate(baseline(), { through: '2028-04-01' })).toThrow();
    const saved = scenario();
    saved.baselineAsOf = '2028-01-29';
    expect(() => serializeScenario(saved)).toThrow();
  });
  it('applies ongoing interruption and savings changes to future occurrences only', () => {
    const input = baseline();
    input.savingsPlans = [
      {
        id: 'saving',
        fromAccountId: 'pay',
        toAccountId: 'reserve',
        dayOfMonth: 31,
        monthlyCents: 1000,
      },
    ];
    const assumptions: Assumption[] = [
      {
        id: 'ongoing',
        kind: 'incomeInterruption',
        paymentId: 'income',
        from: '2028-01-01',
        to: '2028-02-29',
        shareBp: 10_000,
      },
      {
        id: 'rate',
        kind: 'changedSavingsRate',
        savingsPlanId: 'saving',
        from: '2028-01-30',
        deltaMonthlyCents: -1000,
      },
    ];
    expect(cash(assumptions, '2028-01-30', input)).toBe(10_000);
    expect(cash(assumptions, '2028-02-29', input)).toBe(-5000);
  });
  it('allocates capped loan extras chronologically, exposing an earlier shortfall', () => {
    const input = baseline();
    input.accounts[0]!.balanceCents = 0;
    input.loans = [
      {
        id: 'loan',
        accountId: 'pay',
        paymentDay: 29,
        terms: {
          balanceCents: 10_000,
          startMonth: '2028-02',
          rateBp: 0,
          installmentCents: 4000,
          monthlyFeeCents: 0,
          rateChanges: [],
        },
        repayments: [{ assumptionId: 'later', date: '2028-02-20', amountCents: 6000 }],
      },
    ];
    const assumptions: Assumption[] = [
      {
        id: 'earlier',
        kind: 'specialLoanRepayment',
        loanId: 'loan',
        date: '2028-02-05',
        amountCents: 6000,
      },
    ];
    expect(cash([], '2028-02-05', input)).toBe(5000);
    expect(cash(assumptions, '2028-02-05', input)).toBe(-1000);
    expect(cash(assumptions, '2028-02-20', input)).toBe(-1000);
    expect(result(assumptions, input).outcomes[0]!.withExpectedInflows.firstBelowZero).toEqual([
      { accountId: 'pay', day: '2028-02-05', cents: -1000 },
    ]);
  });
  it('rejects unsafe intermediate cent sums even when cancellation would hide the overflow', () => {
    const input = baseline();
    input.accounts[0]!.balanceCents = 0;
    const positive = Array.from({ length: 9008 }, (_, i) => ({
      id: `positive-${i}`,
      accountId: 'pay',
      day: '2028-01-31',
      cents: 1_000_000_000_000,
      kind: 'event' as const,
      expected: false,
    }));
    input.items = [
      ...positive,
      {
        id: 'one-cent',
        accountId: 'pay',
        day: '2028-01-31',
        cents: 1,
        kind: 'event',
        expected: false,
      },
      ...positive.map((i) => ({ ...i, id: `negative-${i.id}`, cents: -i.cents })),
    ];
    // Exact mathematical result is one cent. Reject before the shared engine can lose that cent.
    expect(() => evaluate(input, horizon)).toThrow('Unsafe intermediate cent arithmetic');
    input.items = [];
    input.accounts = Array.from({ length: 18_016 }, (_, i) => ({
      ...cashAccount,
      id: `account-${i}`,
      balanceCents: i < 9008 ? 1_000_000_000_000 : -1_000_000_000_000,
    }));
    expect(() => evaluate(input, { through: input.asOf })).toThrow(
      'Unsafe intermediate cent arithmetic',
    );
  });
  it('rejects negative savings rates, duplicate assumptions and excessive range combinations', () => {
    const input = baseline();
    input.savingsPlans = [
      {
        id: 'saving',
        fromAccountId: 'pay',
        toAccountId: 'reserve',
        dayOfMonth: 31,
        monthlyCents: 1000,
      },
    ];
    expect(() =>
      applyAssumptions(input, [
        {
          id: 'rate',
          kind: 'changedSavingsRate',
          savingsPlanId: 'saving',
          from: '2028-02-01',
          deltaMonthlyCents: -1001,
        },
      ]),
    ).toThrow('Savings rate would be negative');
    const purchase: Assumption = {
      id: 'same',
      kind: 'largerPurchase',
      date: '2028-02-05',
      amountCents: 1,
      accountId: 'pay',
    };
    expect(() => applyAssumptions(input, [purchase, purchase])).toThrow('Duplicate identity');
    const long = baseline();
    long.through = '2029-03-31';
    expect(() =>
      applyAssumptions(long, [
        { id: 'r1', kind: 'delayedIncome', inflowId: 'income-jan', days: { min: 0, max: 64 } },
        { id: 'r2', kind: 'delayedIncome', inflowId: 'income-feb', days: { min: 0, max: 64 } },
      ]),
    ).toThrow('Too many uncertainty combinations');
  });
  it('does not confuse unrelated item IDs with savings-change provenance', () => {
    const input = baseline();
    input.savingsPlans = [
      {
        id: 'saving',
        fromAccountId: 'pay',
        toAccountId: 'reserve',
        dayOfMonth: 31,
        monthlyCents: 1000,
      },
    ];
    input.items.push({
      id: 'savings:saving:2028-02-29:delta:unrelated',
      accountId: 'reserve',
      day: '2028-02-29',
      cents: 1000,
      kind: 'event',
      expected: false,
    });
    expect(() =>
      applyAssumptions(input, [
        {
          id: 'rate',
          kind: 'changedSavingsRate',
          savingsPlanId: 'saving',
          from: '2028-02-01',
          deltaMonthlyCents: -1500,
        },
      ]),
    ).toThrow('Savings rate would be negative');
  });
  it('normalizes saved names consistently and rejects mismatched baselines', () => {
    const input = scenario();
    input.name = '  Testplan  ';
    const saved = serializeScenario(input);
    expect(serializeScenario(deserializeScenario(saved))).toBe(saved);
    const other = baseline();
    other.accounts[0]!.balanceCents = 1;
    expect(() => diff(other, scenario())).toThrow('Baseline mismatch');
  });
  it('replays a stored synthetic scenario to the identical canonical SHA-256 result', () => {
    const fixture = replayFixture as {
      scenario: Scenario;
      horizon: typeof horizon;
      expectedHash: string;
    };
    const run = (s: Scenario) => ({
      evaluation: evaluate(applyAssumptions(s.baseline, s.assumptions), fixture.horizon),
      differences: diff(s.baseline, s, fixture.horizon),
    });
    const saved = serializeScenario(fixture.scenario);
    const replayed = deserializeScenario(saved);
    expect(run(replayed)).toEqual(run(fixture.scenario));
    expect(
      createHash('sha256')
        .update(canonicalJson(run(replayed)))
        .digest('hex'),
    ).toBe(fixture.expectedHash);
    expect(serializeScenario(replayed)).toBe(saved);
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });
});
