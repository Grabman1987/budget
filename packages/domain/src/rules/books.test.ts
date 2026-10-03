import { describe, expect, it } from 'vitest';
import { addMonths, lastDayOfMonth, monthsBetween } from '../date';
import { bookUnavailableReason, bookWindow } from './books';
import { evaluateRule } from './evaluate';
import { applyParamsPatch, BOOK_RULE_CODES } from './params';
import type { BookRuleInputs, RuleInputs } from './types';

const months = monthsBetween('2023-03', '2024-02');
const base: BookRuleInputs = {
  firstMonth: '2022-03',
  payslips: months.map((month) => ({ month, day: lastDayOfMonth(month), grossCents: 100_000 })),
  investmentFlows: [{ day: '2024-02-29', cents: 300_000 }],
  employerPension: months.map((month) => ({ month, cents: 0 })),
  // Invented birth month for deterministic benchmark tests; never an owner value.
  birthMonth: '1994-02',
  netWorthCents: 3_600_000,
  sideIncome: [],
  capitalIncome: [],
  assignments: monthsBetween('2022-03', '2024-02').map((month, index) => ({
    month,
    incomeCents: index < 12 ? 100_000 : 110_000,
    futureCents: index < 12 ? 10_000 : 15_000,
  })),
  activity: months.map((month) => ({
    month,
    bought: true,
    deposited: false,
    extraRepaymentCents: 0,
    loans: [],
  })),
  debtPriorityRateBp: 500,
  investmentValueCents: 1_000_000,
  platformBalances: [],
  positions: [
    {
      securityId: 'synthetic-fund',
      kind: 'etf',
      valueCents: 1_000_000,
      terBp: 30,
      leverageFactor: 10,
    },
  ],
  tradingFeesCents: 3000,
  averagePortfolioCents: 1_000_000,
  flowUnavailableReason: null,
};
const inputs = (patch: Partial<BookRuleInputs> = {}, asOf = '2024-02-29'): RuleInputs => ({
  asOf,
  refMonth:
    asOf === lastDayOfMonth(asOf.slice(0, 7)) ? asOf.slice(0, 7) : addMonths(asOf.slice(0, 7), -1),
  books: { ...base, ...patch },
  allocByMonth: null,
  emergency: null,
  moneyEvents: [],
  payYourself: null,
  sinkingFunds: [],
  cards: [],
  forecast: null,
  netIncomeMonthlyCents: null,
  loanPaymentsMonthlyCents: 0,
  fixedCosts: null,
  debt: null,
  flows: [],
  windfall: [],
  positions: [],
  classTargets: [],
  names: { assetClasses: {}, securities: {}, platforms: {} },
  freedom: null,
});

describe('calendar windows and missing sources', () => {
  it.each([
    ['2024-02-29', '2023-03-01'],
    ['2025-02-28', '2024-02-29'],
    ['2024-03-31', '2023-04-01'],
    ['2024-03-15', '2023-03-16'],
  ])('clamps %s without month overflow', (day, from) =>
    expect(bookWindow(day)).toEqual({ from, to: day }),
  );
  it.each(BOOK_RULE_CODES)('%s returns null without inputs', (code) => {
    const i = inputs();
    delete i.books;
    expect(evaluateRule(code, {}, i)).toBeNull();
    expect(bookUnavailableReason(code, {}, i)).toContain('fehlen');
  });
  it.each(['R17', 'R18'] as const)('%s needs all twelve payroll months', (code) => {
    const i = inputs({ payslips: base.payslips.slice(1) });
    expect(evaluateRule(code, {}, i)).toBeNull();
    expect(bookUnavailableReason(code, {}, i)).toContain('2023-03');
  });
  it('patches are strict, booleans stay booleans, R18 cannot turn red', () => {
    expect(
      applyParamsPatch('R17', {}, { includeEmployerPension: false })['includeEmployerPension'],
    ).toBe(false);
    expect(() => applyParamsPatch('R18', {}, { maxSeverity: 'bad' })).toThrow();
    for (const code of BOOK_RULE_CODES)
      expect(() => applyParamsPatch(code, {}, { unexpected: 1 })).toThrow();
  });
});

describe('R17 gross investment rate', () => {
  it.each([
    [2500, 'ok'],
    [2499, 'warn'],
    [1500, 'warn'],
    [1499, 'bad'],
  ] as const)('rate %i bp → %s', (bp, status) => {
    const i = inputs({ investmentFlows: [{ day: '2024-02-29', cents: bp * 120 }] });
    expect(evaluateRule('R17', {}, i)?.status).toBe(status);
  });
  it('includes special gross and employer money, shows own-only, excludes future/outside flows', () => {
    const i = inputs({
      payslips: [...base.payslips, { month: '2023-06', day: '2023-06-30', grossCents: 240_000 }],
      employerPension: months.map((month) => ({ month, cents: 5000 })),
      investmentFlows: [
        { day: '2023-02-28', cents: 999_000 },
        { day: '2024-02-29', cents: 300_000 },
        { day: '2024-03-01', cents: 999_000 },
      ],
    });
    const e = evaluateRule('R17', {}, i);
    expect(e).toMatchObject({
      status: 'ok',
      valueText: '25,0 % (eigene 20,8 %)',
      detail: { grossCents: 1_440_000, employerCents: 60_000 },
    });
    expect(evaluateRule('R17', { includeEmployerPension: false }, i)?.status).toBe('warn');
  });
  it('missing pension is not assumed zero; leap-month accrual uses actual days', () => {
    const i = inputs({ employerPension: [] });
    expect(evaluateRule('R17', {}, i)).toBeNull();
    expect(evaluateRule('R17', { includeEmployerPension: false }, i)).not.toBeNull();
    const partial = inputs(
      {
        payslips: [{ month: '2023-02', day: '2023-02-28', grossCents: 1 }, ...base.payslips],
        employerPension: [
          { month: '2023-02', cents: 2800 },
          ...months.map((month) => ({ month, cents: 2900 })),
        ],
      },
      '2024-02-15',
    );
    expect(evaluateRule('R17', {}, partial)?.detail['employerCents']).toBe(34_700);
  });
  it('caps severity and gives a literal monthly increase', () => {
    const i = inputs({ investmentFlows: [] });
    expect(evaluateRule('R17', { maxSeverity: 'warn' }, i)).toMatchObject({
      status: 'warn',
      actionText: 'Sparplan um 250 € im Monat erhöhen, um 25,0 % zu erreichen.',
    });
  });
});

describe('R18 neutral wealth benchmark', () => {
  it.each([
    [3_600_000, 'ok', 100],
    [3_564_000, 'warn', 99],
    [1_800_000, 'warn', 50],
    [1_764_000, 'warn', 49],
    [-36_000, 'warn', -1],
  ] as const)('actual %i → %s', (netWorthCents, status, indexX100) => {
    expect(evaluateRule('R18', {}, inputs({ netWorthCents }))).toMatchObject({
      status,
      detail: { expectedCents: 3_600_000, indexX100 },
    });
  });
  it('requires month/year and minimum age; uses decimal years, side and optional capital income', () => {
    expect(evaluateRule('R18', {}, inputs({ birthMonth: null }))).toBeNull();
    expect(evaluateRule('R18', { minAge: 31 }, inputs())).toBeNull();
    const i = inputs({
      birthMonth: '1993-08',
      sideIncome: [{ day: '2024-02-29', cents: 120_000 }],
      capitalIncome: [{ day: '2024-02-29', cents: 120_000 }],
    });
    expect(evaluateRule('R18', {}, i)?.detail['expectedCents']).toBe(4_392_000);
    expect(evaluateRule('R18', { includeCapitalIncome: false }, i)?.detail['expectedCents']).toBe(
      4_026_000,
    );
    expect(evaluateRule('R18', {}, i)?.detail['note']).toContain('Pensionskassen');
  });
});

describe('R19 marginal future assignments', () => {
  it.each([
    [5000, 'ok'],
    [4999, 'warn'],
    [2500, 'warn'],
    [2499, 'bad'],
    [-100, 'bad'],
  ] as const)('marginal %i bp → %s', (rate, status) => {
    const assignments = base.assignments.map((r, index) =>
      index < 12 ? r : { ...r, futureCents: 10_000 + rate },
    );
    // Delta income per month 10 000 cents; delta future `rate` cents.
    expect(evaluateRule('R19', {}, inputs({ assignments }))?.status).toBe(status);
  });
  it('needs 24 months; growth below the threshold is ok/not applicable', () => {
    expect(evaluateRule('R19', {}, inputs({ assignments: base.assignments.slice(1) }))).toBeNull();
    for (const income of [102_990, 100_000, 90_000]) {
      const assignments = base.assignments.map((r, n) =>
        n < 12 ? r : { ...r, incomeCents: income },
      );
      expect(evaluateRule('R19', {}, inputs({ assignments }))).toMatchObject({
        status: 'ok',
        valueText: 'kein Einkommenszuwachs',
      });
    }
    const assignments = base.assignments.map((r, n) =>
      n < 12 ? r : { ...r, incomeCents: 103_000, futureCents: 10_000 },
    );
    expect(evaluateRule('R19', {}, inputs({ assignments }))?.status).toBe('bad');
  });
});

describe('R20 investment continuity', () => {
  it.each([
    [12, 'ok'],
    [11, 'ok'],
    [10, 'warn'],
    [9, 'warn'],
    [8, 'bad'],
  ] as const)('%i invested months → %s', (n, status) => {
    expect(
      evaluateRule(
        'R20',
        {},
        inputs({ activity: base.activity.map((r, idx) => ({ ...r, bought: idx < n })) }),
      )?.status,
    ).toBe(status);
  });
  it('requires twelve full months; debt priority respects R09 and the inclusion toggle', () => {
    expect(evaluateRule('R20', {}, inputs({ firstMonth: '2023-04' }))).toBeNull();
    const activity = base.activity.map((r) => ({
      ...r,
      bought: false,
      extraRepaymentCents: 1,
      loans: [{ balanceCents: 100, rateBp: 501 }],
    }));
    expect(evaluateRule('R20', {}, inputs({ activity }))?.status).toBe('ok');
    expect(evaluateRule('R20', { exemptDebtPriority: false }, inputs({ activity }))?.status).toBe(
      'bad',
    );
    expect(evaluateRule('R20', {}, inputs({ activity, debtPriorityRateBp: 501 }))?.status).toBe(
      'bad',
    );
    expect(evaluateRule('R20', {}, inputs())?.detail['strip']).toHaveLength(12);
  });
});

describe('R21 leverage and platform debt', () => {
  it.each([
    [1000, 'ok'],
    [1001, 'warn'],
    [1500, 'warn'],
    [1501, 'bad'],
  ] as const)('leverage %i bp → %s', (bp, status) => {
    const positions = [{ ...base.positions[0]!, valueCents: bp * 100, leverageFactor: 20 }];
    expect(evaluateRule('R21', {}, inputs({ positions }))?.status).toBe(status);
  });
  it.each([
    [0, 'ok'],
    [-10_000, 'ok'],
    [-10_001, 'warn'],
    [-50_000, 'warn'],
    [-50_100, 'bad'],
  ] as const)('debit %i cents → %s', (balanceCents, status) => {
    expect(
      evaluateRule('R21', {}, inputs({ platformBalances: [{ id: 'platform', balanceCents }] }))
        ?.status,
    ).toBe(status);
  });
  it('missing positive investment value is unavailable; exposure divides by equity', () => {
    expect(evaluateRule('R21', {}, inputs({ investmentValueCents: 0 }))).toBeNull();
    expect(
      evaluateRule(
        'R21',
        {},
        inputs({
          positions: [{ ...base.positions[0]!, valueCents: 100_000, leverageFactor: 30 }],
          platformBalances: [{ id: 'platform', balanceCents: -200_000 }],
        }),
      )?.detail['exposureBp'],
    ).toBe(2500);
  });
});

describe('R22 known fund costs', () => {
  it.each([
    [30, 'ok'],
    [31, 'warn'],
    [60, 'warn'],
    [61, 'bad'],
  ] as const)('TER %i bp → %s', (terBp, status) => {
    expect(
      evaluateRule('R22', {}, inputs({ positions: [{ ...base.positions[0]!, terBp }] }))?.status,
    ).toBe(status);
  });
  it('exact unknown share limit; deduplicates missing securities across accounts', () => {
    const positions = [
      { ...base.positions[0]!, valueCents: 800_000 },
      { ...base.positions[0]!, securityId: 'missing', terBp: 0, valueCents: 100_000 },
      { ...base.positions[0]!, securityId: 'missing', terBp: 0, valueCents: 100_000 },
    ];
    expect(evaluateRule('R22', {}, inputs({ positions }))).toMatchObject({
      status: 'ok',
      detail: { costBp: 30, unknownCount: 1 },
    });
    positions[1]!.valueCents += 100;
    expect(evaluateRule('R22', {}, inputs({ positions }))).toBeNull();
    expect(bookUnavailableReason('R22', {}, inputs({ positions }))).toContain('1 Wertpapieren');
  });
  it('weighted costs, excluded leveraged funds and display-only fees', () => {
    const positions = [
      { ...base.positions[0]!, valueCents: 500_000, terBp: 20 },
      { ...base.positions[0]!, securityId: 'fund-b', kind: 'fund', valueCents: 500_000, terBp: 40 },
      {
        ...base.positions[0]!,
        securityId: 'leveraged',
        valueCents: 1_000_000,
        terBp: 100,
        leverageFactor: 20,
      },
    ];
    expect(evaluateRule('R22', {}, inputs({ positions }))).toMatchObject({
      status: 'ok',
      detail: { costBp: 30, feesBp: 30 },
    });
    expect(evaluateRule('R22', { excludeLeveraged: false }, inputs({ positions }))?.status).toBe(
      'bad',
    );
    expect(
      evaluateRule('R22', {}, inputs({ positions, averagePortfolioCents: null }))?.status,
    ).toBe('ok');
  });
  it('BigInt weighting remains exact beyond the float product range', () => {
    expect(
      evaluateRule(
        'R22',
        {},
        inputs({
          positions: [{ ...base.positions[0]!, valueCents: 1_000_000_000_000, terBp: 61 }],
        }),
      )?.detail['costBp'],
    ).toBe(61);
  });
});

it('rejects inverted targets and keeps any meaningful platform debit visible', () => {
  expect(() => applyParamsPatch('R17', {}, { minBp: 2501 })).toThrow();
  expect(() => applyParamsPatch('R18', {}, { warnFromX100: 101 })).toThrow();
  expect(() => applyParamsPatch('R19', {}, { minBp: 5001 })).toThrow();
  expect(() => applyParamsPatch('R20', {}, { warnMonths: 12 })).toThrow();
  expect(() => applyParamsPatch('R21', {}, { debitWarnFromBp: 501 })).toThrow();
  expect(
    evaluateRule(
      'R21',
      {},
      inputs({
        investmentValueCents: 1_000_000_000,
        platformBalances: [{ id: 'synthetic-platform', balanceCents: -10_001 }],
      }),
    )?.status,
  ).toBe('warn');
});
