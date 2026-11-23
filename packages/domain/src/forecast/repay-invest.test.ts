import { describe, expect, it } from 'vitest';
import { accountLiquidityForecast } from './liquidity';
import { compareRepaymentAndInvestment, type RepaymentTarget } from './repay-invest';

const forecast = accountLiquidityForecast(
  {
    startDay: '2026-10-02',
    accounts: [
      { id: 'cash', name: 'Synthetic cash', balanceCents: 10_001 },
      { id: 'overdraft', name: 'Synthetic overdraft', balanceCents: -1_001 },
    ],
    items: [
      { accountId: 'cash', day: '2026-10-04', cents: -6_000, kind: 'fixed', expected: true },
      { accountId: 'cash', day: '2026-10-03', cents: 99_999, kind: 'income', expected: true },
    ],
    variableMonthlyCents: 0,
  },
  4,
);
const overdraft: RepaymentTarget = {
  kind: 'overdraft',
  id: 'overdraft',
  name: 'Synthetic overdraft',
  owedCents: 1_001,
  rateBp: 1_250,
};
const compare = (
  amountCents: number,
  debt: RepaymentTarget,
  committedReservesCents = 2_000,
  paths = forecast.withoutExpectedInflows,
) =>
  compareRepaymentAndInvestment({
    paths,
    sourceId: 'cash',
    amountCents,
    debt,
    reserveCashCents: 3_000,
    committedReservesCents,
    returnRangeBp: [-500, 500],
  });

describe('repayment and investment', () => {
  it('credits only the overdrawn account on repayment and keeps both outlays out of expected income', () => {
    const result = compare(1_001, overdraft);
    expect(result?.repay).toMatchObject({
      low: { accountId: 'overdraft', cents: 0, day: '2026-10-02' },
      reservesIntact: true,
      interestSavedCents: 125,
    });
    expect(result?.invest).toMatchObject({
      low: { accountId: 'overdraft', cents: -1_001, day: '2026-10-02' },
      reservesIntact: false,
      returnRangeCents: [-50, 50],
    });
    expect(forecast.withoutExpectedInflows.household.low.cents).toBe(3_000);
    expect(forecast.withoutExpectedInflows.accounts[0]!.low.cents).toBe(4_001);
    expect(compare(1_002, overdraft)?.repay).toBeNull();
  });

  it('debits both options equally for an external loan and models first-year interest using loan terms', () => {
    const loan: RepaymentTarget = {
      kind: 'loan',
      id: 'loan',
      name: 'Synthetic loan',
      owedCents: 4_001,
      terms: {
        balanceCents: 4_001,
        startMonth: '2026-10',
        rateBp: 1_200,
        installmentCents: 10_000,
        monthlyFeeCents: 0,
      },
    };
    const paths = {
      ...forecast.withoutExpectedInflows,
      accounts: forecast.withoutExpectedInflows.accounts.slice(0, 1),
    };
    const result = compare(4_001, loan, 0, paths);
    expect(result?.repay).toMatchObject({
      low: { accountId: 'cash', cents: 0, day: '2026-10-04' },
      reservesIntact: true,
      householdCovered: false,
      interestSavedCents: 40,
    });
    expect(result?.invest.low).toEqual(result?.repay?.low);
    expect(compare(1_001, loan, 2_000, paths)?.repay).toMatchObject({
      low: { cents: 3_000 },
      reservesIntact: false,
      householdCovered: true,
    });
    expect(compare(1_000, { ...loan, terms: null }, 2_000, paths)?.repay).toMatchObject({
      low: { cents: 3_001, day: '2026-10-04' },
      reservesIntact: true,
      interestSavedCents: null,
    });
  });

  it('rejects a projection when an otherwise valid input would exceed safe cents', () => {
    const paths = forecast.withoutExpectedInflows;
    expect(
      compare(Number.MAX_SAFE_INTEGER, overdraft, 0, {
        ...paths,
        household: { ...paths.household, low: { ...paths.household.low, cents: -1 } },
      }),
    ).toBeNull();
    expect(
      compareRepaymentAndInvestment({
        paths: forecast.withoutExpectedInflows,
        sourceId: 'cash',
        amountCents: 15_000,
        debt: overdraft,
        reserveCashCents: 3_000,
        committedReservesCents: 2_000,
        returnRangeBp: [0, Number.MAX_SAFE_INTEGER],
      }),
    ).toBeNull();
  });
});
