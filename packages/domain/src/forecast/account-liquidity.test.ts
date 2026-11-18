import { describe, expect, it } from 'vitest';
import {
  accountLiquidityForecast,
  budgetLiquidityForecast,
  type AccountLiquidityInput,
  type ForecastAccountItem,
} from './liquidity';

const payment = (overrides: Partial<ForecastAccountItem> = {}): ForecastAccountItem => ({
  accountId: 'payment',
  day: '2026-02-01',
  cents: -300,
  kind: 'fixed',
  label: 'Synthetic payment',
  expected: false,
  ...overrides,
});
const input = (overrides: Partial<AccountLiquidityInput> = {}): AccountLiquidityInput => ({
  startDay: '2026-01-30',
  accounts: [
    { id: 'payment', name: 'Zahlkonto', balanceCents: 100, bufferCents: 50 },
    { id: 'other', name: 'Zweitkonto', balanceCents: 1_000 },
  ],
  items: [payment()],
  variableMonthlyCents: 0,
  ...overrides,
});

describe('accountLiquidityForecast', () => {
  it('marks missing forecast FX within the horizon incomplete, including overdue payments', () => {
    const missingFx = [
      { paymentId: 'overdue', dueDate: '2026-01-29', currency: 'USD' },
      { paymentId: 'within', dueDate: '2026-02-01', currency: 'USD' },
      { paymentId: 'later', dueDate: '2026-03-01', currency: 'USD' },
    ];
    const result = accountLiquidityForecast(input({ missingFx }), 4);
    expect(result.incomplete).toBe(true);
    expect(result.missingFx.map((item) => item.paymentId)).toEqual(['overdue', 'within']);
    expect(accountLiquidityForecast(input({ missingFx: [missingFx[2]!] }), 4).incomplete).toBe(
      false,
    );
  });
  it('rejects fractional cents even when they cancel to an integer closing balance', () => {
    expect(() =>
      accountLiquidityForecast(
        input({ items: [payment({ cents: 0.5 }), payment({ cents: -0.5 })] }),
        4,
      ),
    ).toThrow('Invalid liquidity cents');
  });

  it('rejects unsafe intermediate arithmetic even when signed items cancel', () => {
    expect(() =>
      accountLiquidityForecast(
        input({
          items: [
            payment({ cents: Number.MAX_SAFE_INTEGER }),
            payment({ cents: -Number.MAX_SAFE_INTEGER }),
          ],
        }),
        4,
      ),
    ).toThrow('Unsafe liquidity cent arithmetic');
  });
  it('names a short account and date while the household remains positive', () => {
    const result = accountLiquidityForecast(input(), 4).withoutExpectedInflows;
    // 100 - 300 = -200 on February 1; household 100 + 1,000 - 300 = 800.
    expect(result.accounts[0]).toMatchObject({
      name: 'Zahlkonto',
      balanceTodayCents: 100,
      low: { day: '2026-02-01', cents: -200 },
      firstBelowZero: { day: '2026-02-01', cents: -200 },
      firstBelowBuffer: { day: '2026-02-01', cents: -200 },
      payments: [{ label: 'Synthetic payment', cents: -300 }],
    });
    expect(result.household.low).toMatchObject({ day: '2026-02-01', cents: 800 });
  });

  it('an own-account transfer before the low covers the account and leaves the household neutral', () => {
    const result = accountLiquidityForecast(
      input({
        items: [
          payment(),
          payment({ day: '2026-01-31', cents: 200 }),
          payment({ accountId: 'other', day: '2026-01-31', cents: -200 }),
        ],
      }),
      4,
    ).withoutExpectedInflows;
    // Transfer: 100 + 200 - 300 = 0, other 1,000 - 200 = 800; total stays 800.
    expect(result.accounts[0]?.firstBelowZero).toBeNull();
    expect(result.accounts[0]?.low.cents).toBe(0);
    expect(result.household.low.cents).toBe(800);
  });

  it('expected income changes only the forecast variant', () => {
    const result = accountLiquidityForecast(
      input({
        items: [
          payment(),
          payment({ day: '2026-01-31', cents: 300, expected: true, kind: 'income' }),
        ],
      }),
      4,
    );
    // Expected 300 covers the forecast (100 + 300 - 300 = 100), never the alert (-200).
    expect(result.withExpectedInflows.accounts[0]?.firstBelowZero).toBeNull();
    expect(result.withExpectedInflows.accounts[0]?.low.cents).toBe(100);
    expect(result.withoutExpectedInflows.accounts[0]?.firstBelowZero).toMatchObject({
      day: '2026-02-01',
      cents: -200,
    });
  });

  it('keeps unassigned payments and variable spending out of every account path', () => {
    const result = accountLiquidityForecast(
      input({ items: [payment({ accountId: null })], variableMonthlyCents: 28 }),
      3,
    );
    // Jan 31 variable = 1; Feb 1 and 2 = 1 each. Household 1,100 - 300 - 3 = 797.
    expect(result.variableSpendingUnassigned).toBe(true);
    expect(result.unassignedPayments).toMatchObject([{ accountId: null, cents: -300 }]);
    expect(result.withoutExpectedInflows.accounts.map((a) => a.low.cents)).toEqual([100, 1_000]);
    expect(result.withoutExpectedInflows.unassigned.low.cents).toBe(-303);
    expect(result.withoutExpectedInflows.household.low.cents).toBe(797);
    for (const variant of [result.withExpectedInflows, result.withoutExpectedInflows]) {
      for (const [index, day] of variant.household.days.entries()) {
        expect(
          variant.accounts.reduce((sum, a) => sum + a.days[index]!.balanceCents, 0) +
            variant.unassigned.days[index]!.balanceCents,
        ).toBe(day.balanceCents);
      }
    }
  });

  it('deducts overdue day-zero obligations once without changing the actual balance', () => {
    const result = accountLiquidityForecast(
      input({
        dayZeroItems: [payment({ day: '2026-01-30', cents: -120 })],
        items: [],
      }),
      2,
    ).withoutExpectedInflows;
    // Actual 100; projected day zero 100 - 120 = -20; household 1,000 - 20 = 980.
    expect(result.accounts[0]).toMatchObject({
      balanceTodayCents: 100,
      low: { day: '2026-01-30', cents: -20 },
      firstBelowZero: { day: '2026-01-30', cents: -20 },
    });
    expect(result.household.low.cents).toBe(980);
  });

  it.each(['2026-01-30', '2026-01-31'])('keeps expected payday %s out of available cash', (day) => {
    const result = accountLiquidityForecast(
      input({
        dayZeroItems: day === '2026-01-30' ? [payment({ day, cents: 300, expected: true })] : [],
        items: [
          payment(),
          ...(day === '2026-01-31' ? [payment({ day, cents: 300, expected: true })] : []),
        ],
      }),
      4,
    );
    // Whether payday is today or tomorrow, the decisive balance is still 100 - 300 = -200.
    expect(result.withoutExpectedInflows.accounts[0]?.low.cents).toBe(-200);
    expect(result.withExpectedInflows.accounts[0]?.firstBelowZero).toBeNull();
  });

  it('retains household figures when attached to the existing budget projection', () => {
    const base = {
      startDay: '2026-01-30',
      startCents: 1_100,
      items: [payment()],
      variableMonthlyCents: 0,
    };
    const legacy = budgetLiquidityForecast(base, 4);
    const additive = budgetLiquidityForecast({ ...base, accountLiquidity: input() }, 4);
    expect(additive.days).toEqual(legacy.days);
    expect(additive.months).toEqual(legacy.months);
    expect(additive.low).toEqual(legacy.low);
    expect(additive.accountLiquidity?.withoutExpectedInflows.accounts[0]?.low.cents).toBe(-200);
  });

  it('uses the next proven inflow only as an alert boundary, keeping the full table path', () => {
    const result = accountLiquidityForecast(
      input({
        accounts: [
          { id: 'payment', name: 'Zahlkonto', balanceCents: 100, nextSafeInflowDay: '2026-01-31' },
        ],
        items: [payment(), payment({ day: '2026-01-31', cents: 100, kind: 'income' })],
      }),
      4,
    ).withoutExpectedInflows.accounts[0]!;
    // Before safe inflow: 100. Later full horizon: 100 + 100 - 300 = -100.
    expect(result.lowBeforeSafeInflow.cents).toBe(100);
    expect(result.low.cents).toBe(-100);
    expect(result.firstBelowZero?.day).toBe('2026-02-01');
  });
});
