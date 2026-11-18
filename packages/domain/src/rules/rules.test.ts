import { describe, expect, it } from 'vitest';
import type { AllocMonth } from '../ledger/alloc';
import type { WealthPosition } from '../wealth';
import { summarizeCheck, type CheckRule } from './check';
import { CHECKLIST_DEFS, RULE_DEFS } from './definitions';
import { evaluateRule, formatPercent } from './evaluate';
import {
  applyParamsPatch,
  defaultParams,
  PARAM_SCHEMAS,
  resolveParams,
  RULE_CODES,
} from './params';
import type { RuleInputs } from './types';

const EMPTY: RuleInputs = {
  asOf: '2026-09-17',
  refMonth: '2026-08',
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
};
const inputs = (over: Partial<RuleInputs>): RuleInputs => ({ ...EMPTY, ...over });

describe('parameters', () => {
  it('every rule has a schema; its defaults are the concept thresholds', () => {
    expect(Object.keys(PARAM_SCHEMAS).sort()).toEqual([...RULE_CODES]);
    expect(defaultParams('R01')).toMatchObject({
      needMaxBp: 5000,
      wantMaxBp: 3000,
      futureMinBp: 2000,
    });
    expect(defaultParams('R04')).toMatchObject({ withinDays: 3 });
    expect(defaultParams('R08')).toMatchObject({ maxBp: 3000 });
    expect(defaultParams('R10')).toMatchObject({ maxBp: 5500 });
    expect(defaultParams('R14')).toMatchObject({ singleBp: 1000, platformBp: 2000 });
    expect(defaultParams('R15')).toMatchObject({ limitBp: 1000 });
  });

  it('a stored value over the defaults; garbage falls back to the defaults', () => {
    expect(resolveParams('R08', { maxBp: 2500 })).toMatchObject({ maxBp: 2500, badOverBp: 1000 });
    expect(resolveParams('R08', { maxBp: 'viel' })).toEqual(defaultParams('R08'));
    expect(resolveParams('R08', null)).toEqual(defaultParams('R08'));
    // keys of other writers (the windfall shares) are not lost on a patch, only unknown ones fail
    expect(resolveParams('R12', { windfallShares: { a: 0.5 } })).toMatchObject({
      windfallShares: { a: 0.5 },
    });
  });

  it('a patch is validated strictly', () => {
    expect(applyParamsPatch('R08', { maxBp: 3000 }, { maxBp: 2500 })).toMatchObject({
      maxBp: 2500,
    });
    expect(() => applyParamsPatch('R08', {}, { nope: 1 })).toThrow();
    expect(() => applyParamsPatch('R08', {}, { maxBp: -5 })).toThrow();
    expect(() => applyParamsPatch('R07', {}, { minCents: -1 })).toThrow();
    expect(() => applyParamsPatch('R08', {}, { maxBp: 1.5 })).toThrow();
  });

  it('definitions cover the registered rules and the 14 checklist items', () => {
    expect(RULE_DEFS.map((d) => d.code)).toEqual([...RULE_CODES]);
    expect(CHECKLIST_DEFS).toHaveLength(14);
    expect(CHECKLIST_DEFS.filter((c) => c.ruleCode === null).map((c) => c.code)).toEqual([
      'S1-1',
      'S1-2',
      'S2-5',
      'S2-6',
      'S3-3',
      'S3-4',
    ]);
  });
});

describe('formatPercent', () => {
  it('de-AT with real minus and sign', () => {
    expect(formatPercent(1420)).toBe('14,2 %');
    expect(formatPercent(-400, true)).toBe('−4,0 %');
    expect(formatPercent(310, true)).toBe('+3,1 %');
    expect(formatPercent(0, true)).toBe('0,0 %');
  });
});

describe('no data: nicht bewertbar', () => {
  it('every rule that needs data returns null on empty inputs', () => {
    for (const code of RULE_CODES) {
      const e = evaluateRule(code, {}, EMPTY);
      // R09 and R12 are satisfied without loans or windfalls; the others have nothing to judge
      if (code === 'R12') expect(e?.status).toBe('ok');
      else expect(e, code).toBeNull();
    }
  });
});

const alloc = (income: number, need: number, want: number, future: number): AllocMonth => ({
  incomeCents: income,
  annualIncomeCents: 0,
  items: [
    { class: 'need', cents: need },
    { class: 'want', cents: want },
    { class: 'future', cents: future },
  ],
});
const twelve = (a: AllocMonth) =>
  Object.fromEntries(
    [
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ].map((m) => [m, a]),
  );

describe('R01 50/30/20', () => {
  it('within the shares: erfüllt; thresholds flip the status', () => {
    const i = inputs({ allocByMonth: twelve(alloc(400_000, 200_000, 120_000, 80_000)) });
    expect(evaluateRule('R01', {}, i)).toMatchObject({
      status: 'ok',
      valueText: '50 / 30 / 20 % · übrig 0 %',
      actionNeeded: false,
      actionText: null,
    });
    expect(evaluateRule('R01', { needMaxBp: 4500 }, i)).toMatchObject({
      status: 'warn',
      actionNeeded: true,
    });
    expect(evaluateRule('R01', { needMaxBp: 3000 }, i)?.status).toBe('bad');
  });

  it('expresses the rolling gap as a monthly amount, including short histories', () => {
    const month = alloc(300_000, 150_000, 90_000, 30_000);
    for (const allocByMonth of [twelve(month), { '2026-08': month }])
      expect(evaluateRule('R01', {}, inputs({ allocByMonth }))?.actionText).toBe(
        'Zukunft um 300 € im Monat aufstocken.',
      );
  });
  it('spending from savings is shown as "aus Guthaben"', () => {
    const i = inputs({ allocByMonth: twelve(alloc(400_000, 212_000, 124_000, 80_000)) });
    const e = evaluateRule('R01', {}, i);
    expect(e?.valueText).toBe('53 / 31 / 20 % · aus Guthaben −4 %');
    expect(e?.status).toBe('warn');
    expect(e?.actionText).toContain('Bedarf');
  });
});

describe('R02 Notgroschen', () => {
  const months = [
    '2025-09',
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
  ];
  const emergency = (reserveCents: number) => ({
    reserveCents,
    needSpending: months.map((month) => ({ month, cents: 300_000 })),
    firstMonth: '2023-10',
  });
  it('below 3 months verletzt, up to 6 Warnung, then erfüllt', () => {
    expect(evaluateRule('R02', {}, inputs({ emergency: emergency(720_000) }))).toMatchObject({
      status: 'bad',
      valueText: '2,4 Monate',
    });
    expect(evaluateRule('R02', {}, inputs({ emergency: emergency(1_200_000) }))?.status).toBe(
      'warn',
    );
    expect(evaluateRule('R02', {}, inputs({ emergency: emergency(1_800_000) }))?.status).toBe('ok');
    // thresholds are data
    expect(
      evaluateRule('R02', { minMonths: 2 }, inputs({ emergency: emergency(720_000) }))?.status,
    ).toBe('warn');
  });
  it('the action names the missing amount', () => {
    const e = evaluateRule('R02', {}, inputs({ emergency: emergency(720_000) }));
    expect(e?.detail).toEqual({
      tenthsOfMonth: 24,
      averageNeedCents: 300_000,
      months: 12,
      missingCents: 180_000,
    });
    expect(e?.actionText).toContain('1.800 €');
  });
});

describe('R03 Geldalter', () => {
  const events = [
    { day: '2026-01-01', cents: 100_000 },
    { day: '2026-02-01', cents: -10_000 },
  ];
  it('days against the target', () => {
    expect(evaluateRule('R03', {}, inputs({ moneyEvents: events }))).toMatchObject({
      status: 'ok',
      valueText: 'Geldalter 31 Tage',
    });
    expect(evaluateRule('R03', { targetDays: 45 }, inputs({ moneyEvents: events }))?.status).toBe(
      'warn',
    );
    expect(
      evaluateRule('R03', { targetDays: 45, badBelowDays: 40 }, inputs({ moneyEvents: events }))
        ?.status,
    ).toBe('bad');
  });
});

describe('R04 Pay yourself first', () => {
  const base = { salaryDays: ['2026-07-30', '2026-08-30'], targetCents: 100_000 };
  it('funded within 3 days after the salary', () => {
    const ok = [
      { day: '2026-07-31', class: 'future' as const, amountCents: 100_000 },
      { day: '2026-09-01', class: 'future' as const, amountCents: 100_000 },
    ];
    expect(
      evaluateRule('R04', {}, inputs({ payYourself: { ...base, assignments: ok } })),
    ).toMatchObject({
      status: 'ok',
      valueText: 'am Gehaltstag gefüllt',
    });
  });
  it('one day too late is a miss; nothing at all is verletzt, partly funded is a Warnung', () => {
    const late = [
      { day: '2026-07-31', class: 'future' as const, amountCents: 100_000 },
      { day: '2026-09-05', class: 'future' as const, amountCents: 100_000 },
    ];
    expect(
      evaluateRule('R04', {}, inputs({ payYourself: { ...base, assignments: late } }))?.status,
    ).toBe('bad');
    const partly = [
      { day: '2026-07-31', class: 'future' as const, amountCents: 100_000 },
      { day: '2026-08-30', class: 'future' as const, amountCents: 40_000 },
    ];
    expect(
      evaluateRule('R04', {}, inputs({ payYourself: { ...base, assignments: partly } }))?.status,
    ).toBe('warn');
    // a longer window makes the late one fine
    expect(
      evaluateRule(
        'R04',
        { withinDays: 6 },
        inputs({ payYourself: { ...base, assignments: late } }),
      )?.status,
    ).toBe('ok');
  });
  it('a salary whose window is still open is not judged', () => {
    const i = inputs({
      asOf: '2026-09-01',
      payYourself: { salaryDays: ['2026-08-30'], assignments: [], targetCents: 100_000 },
    });
    expect(evaluateRule('R04', {}, i)).toBeNull();
  });
  it('no Zukunft target: nicht bewertbar', () => {
    expect(
      evaluateRule(
        'R04',
        {},
        inputs({ payYourself: { ...base, assignments: [], targetCents: 0 } }),
      ),
    ).toBeNull();
  });
});

describe('R05 and R06', () => {
  const fund = (id: string, assigned: number) => ({
    id,
    target: {
      kind: 'by_date' as const,
      amountCents: 48_000,
      everyMonths: 1,
      targetDate: '2027-01-15',
    },
    envelope: { month: '2026-09', carryCents: 0, assignedCents: assigned, refill: false },
  });
  it('R05 counts covered funds; half uncovered is verletzt', () => {
    // 480 € in 5 months: 96 € a month
    const i = inputs({ sinkingFunds: [fund('a', 9600), fund('b', 9600), fund('c', 9600)] });
    expect(evaluateRule('R05', {}, i)).toMatchObject({
      status: 'ok',
      valueText: '3 von 3 gedeckt',
    });
    const one = inputs({ sinkingFunds: [fund('a', 9600), fund('b', 9600), fund('c', 0)] });
    expect(evaluateRule('R05', {}, one)).toMatchObject({
      status: 'warn',
      valueText: '2 von 3 gedeckt',
    });
    const half = inputs({ sinkingFunds: [fund('a', 9600), fund('b', 0)] });
    expect(evaluateRule('R05', {}, half)?.status).toBe('bad');
    expect(evaluateRule('R05', { badUncoveredBp: 6000 }, half)?.status).toBe('warn');
  });
  it('R06: a card balance not covered by its envelope is verletzt', () => {
    const covered = inputs({ cards: [{ id: 'k', owedCents: 45_000, availableCents: 45_000 }] });
    expect(evaluateRule('R06', {}, covered)).toMatchObject({
      status: 'ok',
      valueText: 'Saldo gedeckt',
    });
    const short = inputs({ cards: [{ id: 'k', owedCents: 45_000, availableCents: 10_000 }] });
    const e = evaluateRule('R06', {}, short);
    expect(e).toMatchObject({ status: 'bad', valueText: '1 Karte nicht gedeckt' });
    expect(e?.actionText).toContain('350 €');
  });
});

describe('R07 Dispo', () => {
  it('returns unavailable instead of all-clear when a forecast FX rate is missing within the account horizon', () => {
    const forecast = {
      startDay: '2026-01-30',
      startCents: 1_100,
      items: [],
      variableMonthlyCents: 0,
      lastResortCents: 0,
      accountLiquidity: {
        startDay: '2026-01-30',
        through: '2026-03-16',
        accounts: [{ id: 'payment', name: 'Zahlkonto', balanceCents: 1_100 }],
        items: [],
        variableMonthlyCents: 0,
        missingFx: [{ paymentId: 'synthetic-usd', dueDate: '2026-03-11', currency: 'USD' }],
      },
    };
    expect(evaluateRule('R07', {}, inputs({ forecast }))).toBeNull();
    forecast.accountLiquidity.missingFx[0]!.dueDate = '2026-03-17';
    expect(evaluateRule('R07', {}, inputs({ forecast }))?.status).toBe('ok');
  });
  it('keeps an unassigned household shortfall bad when expected income masks the legacy forecast', () => {
    const items = [
      {
        accountId: 'payment',
        day: '2026-01-31',
        cents: 1_000,
        kind: 'income' as const,
        expected: true,
      },
      {
        accountId: null,
        day: '2026-02-01',
        cents: -1_500,
        kind: 'fixed' as const,
        expected: false,
      },
    ];
    // Known cash 1,100 - unassigned 1,500 = -400. Expected 1,000 would mask this as +600.
    // Both actual account paths stay positive; the separate unassigned path must still count.
    const forecast = {
      startDay: '2026-01-30',
      startCents: 1_100,
      items,
      variableMonthlyCents: 0,
      lastResortCents: 5_000,
      accountLiquidity: {
        startDay: '2026-01-30',
        accounts: [
          { id: 'payment', name: 'Zahlkonto', balanceCents: 100 },
          { id: 'other', name: 'Zweitkonto', balanceCents: 1_000 },
        ],
        items,
        variableMonthlyCents: 0,
      },
    };
    expect(evaluateRule('R07', {}, inputs({ forecast }))).toMatchObject({
      status: 'bad',
      valueText: 'Tiefpunkt −4 €',
      detail: {
        lowCents: 600,
        conservativeLowDay: '2026-02-01',
        conservativeLowCents: -400,
        shortAccounts: [],
      },
    });
  });
  it('uses the payday-plus-30 account horizon without changing the legacy 35-day household figure', () => {
    const items = [
      {
        accountId: 'payment',
        day: '2026-03-11',
        cents: -300,
        kind: 'fixed' as const,
        expected: false,
      },
    ];
    // Day 40: account 100 - 300 = -200; household 1,100 - 300 = 800.
    // The existing 35-day household low stays 1,100, while the account horizon reaches March 16.
    const forecast = {
      startDay: '2026-01-30',
      startCents: 1_100,
      items,
      variableMonthlyCents: 0,
      lastResortCents: 0,
      accountLiquidity: {
        startDay: '2026-01-30',
        through: '2026-03-16',
        accounts: [
          { id: 'payment', name: 'Zahlkonto', balanceCents: 100 },
          { id: 'other', name: 'Zweitkonto', balanceCents: 1_000 },
        ],
        items,
        variableMonthlyCents: 0,
      },
    };
    expect(evaluateRule('R07', {}, inputs({ forecast }))).toMatchObject({
      status: 'bad',
      detail: {
        lowCents: 1_100,
        shortAccounts: [{ firstBelowZero: { day: '2026-03-11', cents: -200 } }],
      },
    });
  });
  it('keeps a payment-account shortfall bad despite positive household cash, expected income and overdraft', () => {
    const items = [
      {
        accountId: 'payment',
        day: '2026-01-31',
        cents: 300,
        kind: 'income' as const,
        expected: true,
      },
      {
        accountId: 'payment',
        day: '2026-02-01',
        cents: -300,
        kind: 'fixed' as const,
        expected: false,
      },
    ];
    // Payment cash 100 - 300 = -200; household stays 100 + 1,000 - 300 = 800.
    // Neither the expected 300 nor the available 5,000 credit line can cover the verdict.
    const forecast = {
      startDay: '2026-01-30',
      startCents: 1_100,
      items,
      variableMonthlyCents: 0,
      lastResortCents: 5_000,
      accountLiquidity: {
        startDay: '2026-01-30',
        accounts: [
          { id: 'payment', name: 'Zahlkonto', balanceCents: 100 },
          { id: 'other', name: 'Zweitkonto', balanceCents: 1_000 },
        ],
        items,
        variableMonthlyCents: 0,
      },
    };
    const result = evaluateRule('R07', {}, inputs({ forecast }));
    expect(result).toMatchObject({
      status: 'bad',
      detail: {
        lowCents: 1_100,
        lastResortCents: 5_000,
        shortAccounts: [
          { accountId: 'payment', firstBelowZero: { day: '2026-02-01', cents: -200 } },
        ],
      },
    });
    expect(result?.valueText).toContain('Zahlkonto');
    expect(result?.actionText).toContain('01.02.');
  });
  it('does not count a payment after day 35, even with a stored 90-day setting', () => {
    const f = {
      startDay: '2026-01-01',
      startCents: 10000,
      variableMonthlyCents: 0,
      lastResortCents: 0,
      items: [
        { day: '2026-02-05', cents: -5000, kind: 'fixed' as const },
        { day: '2026-02-06', cents: -20000, kind: 'fixed' as const },
      ],
    };
    expect(evaluateRule('R07', { horizonDays: 90 }, inputs({ forecast: f }))).toMatchObject({
      status: 'ok',
      valueText: 'Tiefpunkt 50 €',
    });
    expect(
      evaluateRule('R07', { horizonDays: 90, minCents: 6000 }, inputs({ forecast: f }))?.status,
    ).toBe('warn');
  });
  const forecast = (startCents: number, lastResortCents = 300_000) => ({
    startDay: '2026-09-17',
    startCents,
    items: [{ day: '2026-09-20', cents: -50_000, kind: 'fixed' as const }],
    variableMonthlyCents: 0,
    lastResortCents,
  });
  it('lowest balance within the horizon; the overdraft is no money, below 0 is always bad', () => {
    expect(evaluateRule('R07', {}, inputs({ forecast: forecast(100_000) }))).toMatchObject({
      status: 'ok',
      valueText: 'Tiefpunkt 500 €',
    });
    // a low point inside the overdraft limit is still a squeeze (owner decision 2026-11-17)
    expect(evaluateRule('R07', {}, inputs({ forecast: forecast(30_000) }))).toMatchObject({
      status: 'bad',
      valueText: 'Tiefpunkt −200 €',
      detail: { lastResortCents: 300_000 },
    });
    expect(evaluateRule('R07', {}, inputs({ forecast: forecast(30_000, 0) }))?.status).toBe('bad');
    expect(
      evaluateRule('R07', { minCents: -60_000 }, inputs({ forecast: forecast(30_000) }))?.status,
    ).toBe('bad');
    // a threshold of 600 € flips the first case
    expect(
      evaluateRule('R07', { minCents: 60_000 }, inputs({ forecast: forecast(100_000) }))?.status,
    ).toBe('warn');
  });
});

describe('R08 and R10 quotas', () => {
  it('R08 debt service ratio', () => {
    const i = inputs({ netIncomeMonthlyCents: 400_000, loanPaymentsMonthlyCents: 41_200 });
    expect(evaluateRule('R08', {}, i)).toMatchObject({ status: 'ok', valueText: '10,3 %' });
    expect(evaluateRule('R08', { maxBp: 1000 }, i)?.status).toBe('warn');
    expect(evaluateRule('R08', { maxBp: 500, badOverBp: 100 }, i)?.status).toBe('bad');
  });
  it('R10 fixed cost ratio incl. periodic twelfths', () => {
    const i = inputs({
      netIncomeMonthlyCents: 400_000,
      fixedCosts: { fixedMonthlyCents: 150_000, periodicAnnualCents: 600_000 },
    });
    // (150.000 + 50.000) / 400.000
    expect(evaluateRule('R10', {}, i)).toMatchObject({ status: 'ok', valueText: '50,0 %' });
    expect(evaluateRule('R10', { maxBp: 4500 }, i)?.status).toBe('warn');
  });
});

describe('R09 Tilgungsreihenfolge', () => {
  const loan = { id: 'l', name: 'Kredit', rateBp: 632, balanceCents: 1_000_000 };
  it('no expensive loan: erfüllt; extra repayment active: erfüllt; none: Warnung; investing too: verletzt', () => {
    expect(
      evaluateRule(
        'R09',
        {},
        inputs({
          debt: {
            loans: [{ ...loan, rateBp: 400 }],
            extraRepayments: [],
            investingAssignedCents: 0,
          },
        }),
      )?.status,
    ).toBe('ok');
    const active = {
      loans: [loan],
      extraRepayments: [{ month: '2026-08', cents: 30_000 }],
      investingAssignedCents: 50_000,
    };
    expect(evaluateRule('R09', {}, inputs({ debt: active }))).toMatchObject({
      status: 'ok',
      valueText: 'Sondertilgung aktiv',
    });
    const none = { loans: [loan], extraRepayments: [], investingAssignedCents: 0 };
    expect(evaluateRule('R09', {}, inputs({ debt: none }))).toMatchObject({
      status: 'warn',
      valueText: 'Sondertilgung fehlt',
    });
    expect(
      evaluateRule('R09', {}, inputs({ debt: { ...none, investingAssignedCents: 1 } }))?.status,
    ).toBe('bad');
    // the threshold is data: at 7 % the loan is no longer expensive
    expect(evaluateRule('R09', { rateBp: 700 }, inputs({ debt: none }))?.status).toBe('ok');
    // an old repayment is outside the look-back
    const old = {
      loans: [loan],
      extraRepayments: [{ month: '2026-03', cents: 30_000 }],
      investingAssignedCents: 0,
    };
    expect(evaluateRule('R09', {}, inputs({ debt: old }))?.status).toBe('warn');
  });
});

describe('R11 Lifestyle-Inflation', () => {
  const flows = (spend: [number, number], income: [number, number]) => {
    const months = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => {
        const k = from + i; // 0 = 2024-09 ... 23 = 2026-08
        const y = 2024 + Math.floor((8 + k) / 12);
        const m = ((8 + k) % 12) + 1;
        return `${y}-${String(m).padStart(2, '0')}`;
      });
    return [
      ...months(0, 11).map((month) => ({ month, incomeCents: income[0], spendingCents: spend[0] })),
      ...months(12, 23).map((month) => ({
        month,
        incomeCents: income[1],
        spendingCents: spend[1],
      })),
    ];
  };
  it('spending growth against income growth', () => {
    expect(
      evaluateRule('R11', {}, inputs({ flows: flows([100_000, 102_000], [400_000, 410_000]) })),
    ).toMatchObject({
      status: 'ok',
      valueText: 'Ausgaben +2,0 % · Einkommen +2,5 %',
    });
    const over = inputs({ flows: flows([100_000, 105_000], [400_000, 404_000]) });
    expect(evaluateRule('R11', {}, over)?.status).toBe('warn');
    expect(evaluateRule('R11', { toleranceBp: 500 }, over)?.status).toBe('ok');
    expect(
      evaluateRule('R11', {}, inputs({ flows: flows([100_000, 120_000], [400_000, 400_000]) }))
        ?.status,
    ).toBe('bad');
  });
});

describe('R12 Windfall', () => {
  const w = (undistributed: number, assigned: Record<string, number> = {}) => [
    {
      month: '2026-08',
      windfallCents: 100_000,
      undistributedCents: undistributed,
      assignedByCategory: assigned,
    },
  ];
  it('no special payment: erfüllt; distributed: erfüllt; left over: Warnung', () => {
    expect(evaluateRule('R12', {}, EMPTY)).toMatchObject({
      status: 'ok',
      valueText: 'keine Sonderzahlung',
    });
    expect(evaluateRule('R12', {}, inputs({ windfall: w(0) }))).toMatchObject({
      status: 'ok',
      valueText: 'Sonderzahlung verteilt',
    });
    // the Genuss share and the slack may stay in "Zu verteilen"
    expect(evaluateRule('R12', {}, inputs({ windfall: w(15_000) }))?.status).toBe('ok');
    expect(evaluateRule('R12', {}, inputs({ windfall: w(40_000) }))).toMatchObject({
      status: 'warn',
      valueText: '250 € der Sonderzahlung noch zu verteilen',
    });
  });
  it('with tracked Genuss envelopes, more than the share is a Warnung', () => {
    const p = { enjoyCategoryIds: ['genuss'] };
    expect(evaluateRule('R12', p, inputs({ windfall: w(0, { genuss: 9_000 }) }))?.status).toBe(
      'ok',
    );
    expect(evaluateRule('R12', p, inputs({ windfall: w(0, { genuss: 30_000 }) }))).toMatchObject({
      status: 'warn',
      valueText: 'mehr als der Genuss-Anteil',
    });
  });
});

const pos = (
  id: string,
  kind: WealthPosition['kind'],
  cls: string,
  cents: number,
  platform = 'p1',
): WealthPosition => ({
  id,
  kind,
  assetClass: cls,
  valueCents: cents,
  platform,
});

describe('R13 to R15 portfolio', () => {
  const names = {
    assetClasses: { world: 'Welt', em: 'Schwellenländer', spec: 'Spekulativ' },
    securities: { s1: 'Aktie X' },
    platforms: { p2: 'Plattform D' },
  };
  const positions = [
    pos('w', 'etf', 'world', 6_850_000),
    pos('e', 'etf', 'em', 700_000),
    { ...pos('s', 'stock', 'spec', 450_000), securityId: 's1' },
    pos('c', 'crypto', 'spec', 800_000, 'p2'),
  ];
  const targets = [
    { assetClass: 'world', targetBp: 8000 },
    { assetClass: 'em', targetBp: 1200 },
    { assetClass: 'spec', targetBp: 800 },
  ];
  it('R13 names the class that is furthest off; a speculative overweight is left to R15', () => {
    const e = evaluateRule('R13', {}, inputs({ positions, classTargets: targets, names }));
    expect(e).toMatchObject({ status: 'warn', valueText: 'Schwellenländer −4,0 Pp' });
    expect(e?.actionText).toContain('Schwellenländer');
    // a wider band takes the breach away
    const wide = targets.map((t) => ({ ...t, bandBp: 1000 }));
    expect(evaluateRule('R13', {}, inputs({ positions, classTargets: wide, names }))?.status).toBe(
      'ok',
    );
    expect(
      evaluateRule(
        'R13',
        { badFactorPct: 100 },
        inputs({ positions, classTargets: targets, names }),
      )?.status,
    ).toBe('bad');
  });
  it('R15 speculative share', () => {
    expect(evaluateRule('R15', {}, inputs({ positions, names }))).toMatchObject({
      status: 'bad',
      valueText: '14,2 %',
    });
    expect(evaluateRule('R15', { limitBp: 1500 }, inputs({ positions, names }))?.status).toBe('ok');
    expect(evaluateRule('R15', { badOverBp: 1000 }, inputs({ positions, names }))?.status).toBe(
      'warn',
    );
  });
  it('R13 keeps speculative overweight when a stored R15 limit covers it', () => {
    const i = inputs({ positions, classTargets: targets, names });
    i.portfolioRiskPolicy = {
      R13: PARAM_SCHEMAS.R13.parse({}),
      R14: PARAM_SCHEMAS.R14.parse({}),
      R15: PARAM_SCHEMAS.R15.parse({ limitBp: 2000 }),
    };
    expect(evaluateRule('R13', {}, i)!.detail['breaches']).toContain('spec');
  });
  it('R14 single titles and platforms', () => {
    const calm = [
      pos('w', 'etf', 'world', 9_000_000),
      { ...pos('s', 'stock', 'spec', 450_000), securityId: 's1' },
    ];
    expect(evaluateRule('R14', {}, inputs({ positions: calm, names }))).toMatchObject({
      status: 'ok',
      valueText: 'größte Position 4,8 %',
    });
    expect(
      evaluateRule('R14', { singleBp: 400 }, inputs({ positions: calm, names })),
    ).toMatchObject({
      status: 'warn',
      valueText: 'Aktie X 4,8 %',
    });
    // 8,0 % crypto on platform p2 against a 5 % platform limit
    const e = evaluateRule(
      'R14',
      { platformBp: 500, singleBp: 5000 },
      inputs({ positions, names }),
    );
    expect(e?.valueText).toContain('Plattform Plattform D');
    expect(e?.status).not.toBe('ok');
  });
  it('no positions: nicht bewertbar', () => {
    for (const code of ['R13', 'R14', 'R15'] as const)
      expect(evaluateRule(code, {}, EMPTY)).toBeNull();
  });
});

describe('R16 Freiheitszahl', () => {
  const freedom = (invested: number, prev: number | null) => ({
    investedCents: invested,
    annualSpendCents: 4_000_000,
    previousProgressBp: prev,
  });
  it('progress against the freedom number; falling progress is a Warnung', () => {
    expect(evaluateRule('R16', {}, inputs({ freedom: freedom(8_900_000, 800) }))).toMatchObject({
      status: 'ok',
      valueText: '8,9 %',
    });
    expect(evaluateRule('R16', {}, inputs({ freedom: freedom(8_900_000, null) }))?.status).toBe(
      'ok',
    );
    expect(evaluateRule('R16', {}, inputs({ freedom: freedom(8_900_000, 950) }))?.status).toBe(
      'warn',
    );
    // a 20 x multiple raises the progress
    expect(
      evaluateRule('R16', { multiple: 20 }, inputs({ freedom: freedom(8_900_000, null) }))
        ?.valueText,
    ).toBe('11,1 %');
    expect(evaluateRule('R16', {}, inputs({ freedom: freedom(0, null) }))?.valueText).toBe('0,0 %');
    expect(
      evaluateRule(
        'R16',
        {},
        inputs({ freedom: { investedCents: 1, annualSpendCents: 0, previousProgressBp: null } }),
      ),
    ).toBeNull();
  });
});

describe('summarizeCheck', () => {
  const rule = (code: string, status: 'ok' | 'warn' | 'bad' | null, enabled = true): CheckRule => ({
    code,
    name: code,
    stage: 2,
    enabled,
    evaluation:
      status === null
        ? null
        : {
            status,
            valueText: `${code} ${status}`,
            actionNeeded: status !== 'ok',
            actionText: null,
            detail: {},
          },
  });
  const rules = [
    rule('R01', 'warn'),
    rule('R02', 'bad'),
    rule('R03', 'warn'),
    rule('R04', 'ok'),
    rule('R07', 'ok'),
    rule('R08', 'ok'),
    rule('R09', null),
    rule('R15', 'bad'),
    rule('R16', 'ok', false),
  ];
  const checklist = [
    {
      code: 'S1-1',
      stage: 1,
      text: 'a',
      source: null,
      enabled: true,
      ruleCode: null,
      confirmedAt: null,
    },
    {
      code: 'S1-2',
      stage: 1,
      text: 'b',
      source: null,
      enabled: true,
      ruleCode: null,
      confirmedAt: '2026-09-01T10:00:00.000Z',
    },
    {
      code: 'S1-4',
      stage: 1,
      text: 'c',
      source: null,
      enabled: true,
      ruleCode: 'R04',
      confirmedAt: null,
    },
    {
      code: 'S2-4',
      stage: 2,
      text: 'd',
      source: null,
      enabled: true,
      ruleCode: 'R09',
      confirmedAt: null,
    },
    {
      code: 'S3-3',
      stage: 3,
      text: 'e',
      source: null,
      enabled: false,
      ruleCode: null,
      confirmedAt: null,
    },
  ];
  const s = summarizeCheck({ rules, checklist, netWorthCents: 8_473_000 });

  it('counts the enabled rules; a rule without data is not counted as ok', () => {
    expect(s.counts).toEqual({ ok: 3, warn: 2, bad: 2, total: 8, notEvaluated: 1 });
  });
  it('key rules ordered by severity, ties in the key order of Heute', () => {
    expect(s.keyRules.map((r) => r.code)).toEqual(['R02', 'R15', 'R01', 'R03', 'R08', 'R07']);
  });
  it('stage from net worth', () => {
    expect(s.stage).toMatchObject({ stage: 2, label: 'Aufbau' });
  });
  it('a confirmed manual item counts, a rule item follows its rule, disabled items are left out', () => {
    expect(s.checklist.items.map((i) => [i.code, i.basis, i.status, i.done])).toEqual([
      ['S1-1', 'manual', 'open', false],
      ['S1-2', 'manual', 'ok', true],
      ['S1-4', 'rule', 'ok', true],
      ['S2-4', 'rule', 'open', false],
    ]);
    expect(s.checklist).toMatchObject({ done: 2, total: 4 });
  });
});

it('does not label missing debt payments as a fulfilled zero ratio', () => {
  expect(
    evaluateRule(
      'R08',
      {},
      inputs({ netIncomeMonthlyCents: 300000, loanPaymentsMonthlyCents: null }),
    ),
  ).toBeNull();
});
