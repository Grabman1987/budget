import { describe, expect, it } from 'vitest';
import {
  STRATEGY_CATEGORIES,
  nextStrategyContribution,
  strategyContribution,
  strategyMonthSchedule,
  strategyMonthlySignal,
  strategyPurchase,
  strategyRebalance,
  type StrategyPosition,
  type StrategyRoute,
} from './strategy-plan';
import type { StrategyTrendInput } from './strategy-trend';

const positions = (values: number[]): StrategyPosition[] =>
  values.map((valueCents, index) => ({
    category: STRATEGY_CATEGORIES[index]!,
    securityId: `synthetic-${index}`,
    valueCents,
  }));
const routes: StrategyRoute[] = STRATEGY_CATEGORIES.map((category, i) => ({
  category,
  securityId: `synthetic-${i}`,
  weightBp: 10000,
  daily2xNasdaqConfirmed: category === 'nasdaq2x',
  constraints: { minimumGrossCents: 0, fixedFeeCents: 0, feeBp: 0, unitStepE8: null },
  quote: null,
}));
const contribute = (
  values = [60000, 10000, 10000, 20000],
  cashCents = 0,
  includeFreeCash = false,
  contributionCents = 10000,
) =>
  strategyContribution({
    trend: 'mixed',
    positions: positions(values),
    cashCents,
    contributionCents,
    includeFreeCash,
    routes,
  });

describe('strategy contribution: literal synthetic EUR examples', () => {
  it('sends only the new rate to underweights with exact largest remainders', () => {
    const result = contribute();
    expect(result.rows.map((row) => row.idealCents)).toEqual([0, 667, 4333, 5000]);
    expect(result.rows.map((row) => row.deficitBpCents)).toEqual([
      '0',
      '10000000',
      '65000000',
      '75000000',
    ]);
    expect(result).toMatchObject({
      portfolioCents: 100000,
      fundingCents: 10000,
      grossCents: 10000,
      feeCents: 0,
      residualCents: 0,
    });
  });
  it('keeps cash in the denominator once and invests it only on explicit opt-in', () => {
    expect(
      contribute([45000, 9000, 13500, 22500], 10000).rows.map((row) => row.idealCents),
    ).toEqual([5000, 1000, 1500, 2500]);
    const result = contribute([45000, 9000, 13500, 22500], 10000, true);
    expect(result.rows.map((row) => row.idealCents)).toEqual([10000, 2000, 3000, 5000]);
    expect(result).toMatchObject({
      portfolioCents: 100000,
      fundingCents: 20000,
      cashAddedCents: 10000,
    });
  });
  it('retains non-buy holdings and prefers underweights within a category', () => {
    const result = strategyContribution({
      trend: 'mixed',
      positions: [
        { category: 'global', securityId: 'synthetic-old', valueCents: 10000 },
        { category: 'global', securityId: 'synthetic-0', valueCents: 40000 },
        ...positions([0, 10000, 15000, 25000]).slice(1),
      ],
      cashCents: 0,
      contributionCents: 10000,
      includeFreeCash: false,
      routes: [
        { ...routes[0]!, weightBp: 5000 },
        { ...routes[0]!, securityId: 'synthetic-new', weightBp: 5000 },
        ...routes.slice(1),
      ],
    });
    expect(result.rows[0]).toMatchObject({ valueCents: 50000, idealCents: 5000 });
    expect(result.rows[0]!.purchases.map((purchase) => purchase.grossCents)).toEqual([0, 5000]);
  });
  it('conserves an odd cent deterministically, including the empty portfolio and zero rate', () => {
    expect(contribute([0, 0, 0, 0], 0, false, 1).rows.map((row) => row.idealCents)).toEqual([
      1, 0, 0, 0,
    ]);
    expect(contribute([0, 0, 0, 0], 0, false, 0)).toMatchObject({
      status: 'no_deficit',
      grossCents: 0,
      residualCents: 0,
      executable: false,
    });
  });
  it('does not spend signed negative cash or discard invalid inputs', () => {
    expect(contribute(undefined, -1000, true).cashAddedCents).toBe(0);
    expect(() => contribute([0, 0, 0, 0], -1000)).toThrow();
    expect(() => contribute([0.5, 0, 0, 0])).toThrow();
    expect(() => contribute([Number.MAX_SAFE_INTEGER, 1000, 0, 0])).toThrow();
    expect(() =>
      strategyContribution({
        trend: 'mixed',
        positions: [],
        cashCents: 0,
        contributionCents: 100,
        includeFreeCash: false,
        routes: [routes[0]!, routes[0]!],
      }),
    ).toThrow();
  });
});

describe('purchase constraints', () => {
  const route = (
    patch: Partial<NonNullable<StrategyRoute['constraints']>> = {},
  ): StrategyRoute => ({
    ...routes[0]!,
    constraints: { ...routes[0]!.constraints!, fixedFeeCents: 100, feeBp: 100, ...patch },
  });
  it('includes fees inside the budget and requires the gross minimum', () => {
    expect(strategyPurchase(1000, route())).toMatchObject({
      grossCents: 891,
      feeCents: 109,
      residualCents: 0,
    });
    expect(strategyPurchase(1000, route({ minimumGrossCents: 900 }))).toMatchObject({
      grossCents: 0,
      feeCents: 0,
      residualCents: 1000,
      reason: 'below_minimum',
    });
  });
  const whole = (priceMicro = 25000000): StrategyRoute => ({
    ...route({ feeBp: 0, unitStepE8: 100000000 }),
    quote: {
      choice: { quality: 'exact', price: { date: '2026-11-06', currency: 'EUR', priceMicro } },
      fxRateMicro: 1000000,
    },
  });
  it('buys three whole units and leaves an explicit residual', () => {
    expect(strategyPurchase(10000, whole())).toMatchObject({
      unitsE8: 300000000,
      grossCents: 7500,
      feeCents: 100,
      residualCents: 2400,
    });
  });
  it('rounds exact purchase consideration upward before testing affordability', () => {
    const r = whole(100004000);
    r.constraints!.fixedFeeCents = 0;
    expect(strategyPurchase(10000, r)).toMatchObject({ grossCents: 0, residualCents: 10000 });
    expect(strategyPurchase(10001, r)).toMatchObject({
      unitsE8: 100000000,
      grossCents: 10001,
      residualCents: 0,
    });
  });
  it('handles fractional unit steps and explicit FX with integer arithmetic', () => {
    const r = whole(25000000);
    r.constraints = { ...r.constraints!, fixedFeeCents: 0, unitStepE8: 1000000 };
    r.quote!.fxRateMicro = 900000;
    r.quote!.choice.price.currency = 'USD';
    expect(strategyPurchase(100, r)).toMatchObject({
      unitsE8: 4000000,
      grossCents: 90,
      feeCents: 0,
      residualCents: 10,
    });
  });
  it('keeps unknown constraints and missing/stale prices visible', () => {
    expect(strategyPurchase(100, { ...routes[0]!, constraints: null })).toMatchObject({
      reason: 'constraints_unknown',
      residualCents: 100,
    });
    expect(strategyPurchase(100, { ...whole(), quote: null })).toMatchObject({
      reason: 'price_unavailable',
      residualCents: 100,
    });
    const r = whole();
    r.quote!.choice.quality = 'stale';
    expect(strategyPurchase(100, r).reason).toBe('price_unavailable');
  });
});

describe('verified schedules and separate rebalancing', () => {
  const calendar = {
    id: 'synthetic-us',
    sourceId: 'synthetic',
    month: '2026-11',
    verifiedComplete: true as const,
    sessions: ['2026-11-02', '2026-11-25', '2026-11-27', '2026-11-30'],
  };
  it('uses supplied penultimate/last sessions, never a weekday rule', () => {
    expect(strategyMonthSchedule(calendar)).toMatchObject({
      signalDate: '2026-11-27',
      effectiveDate: '2026-11-30',
    });
    expect(() =>
      strategyMonthSchedule({ ...calendar, sessions: ['2026-11-30', '2026-11-27'] }),
    ).toThrow();
    expect(() =>
      strategyMonthSchedule({ ...calendar, sessions: ['2026-11-27', '2026-12-01'] }),
    ).toThrow();
  });
  it('refuses contradictory month and completed-session calendars even with equal IDs', () => {
    const input: StrategyTrendInput = {
      asOf: '2026-11-27T22:00:00.000Z',
      latestCompletedSession: '2026-11-27',
      calendar: {
        id: calendar.id,
        verifiedComplete: true,
        sessions: [{ date: '2026-11-27', completedAt: '2026-11-27T21:00:00.000Z' }],
      },
      source: {
        sourceId: 'synthetic',
        indexId: 'synthetic',
        currency: 'USD',
        leverage: 1,
        kind: 'price-index',
        unitsPerPoint: 1000,
      },
      closes: [],
    };
    expect(() => strategyMonthlySignal(input, calendar)).toThrow(/disagree/);
  });
  it('marks missing execution calendars provisional and keeps a delayed current-month date', () => {
    expect(nextStrategyContribution('2026-11-06')).toMatchObject({
      nominalDate: '2026-11-15',
      executionDate: null,
      provisional: true,
    });
    const execution = {
      id: 'synthetic-execution',
      verifiedComplete: true as const,
      from: '2026-11-01',
      through: '2026-12-31',
      days: ['2026-11-17', '2026-12-16'],
    };
    expect(nextStrategyContribution('2026-11-16', execution)).toMatchObject({
      nominalDate: '2026-11-15',
      executionDate: '2026-11-17',
      provisional: false,
    });
    expect(nextStrategyContribution('2026-11-18', execution)).toMatchObject({
      nominalDate: '2026-12-15',
      executionDate: '2026-12-16',
    });
    expect(nextStrategyContribution('2026-12-31')).toMatchObject({
      nominalDate: '2027-01-15',
      executionDate: null,
    });
  });
  it('separates gross sales from contributions and emits one trigger at coinciding events', () => {
    const result = strategyRebalance({
      current: 'mixed',
      previous: 'weak',
      effectiveDate: '2026-09-30',
      positions: positions([60000, 10000, 10000, 20000]),
      cashCents: 0,
    });
    expect(result).toMatchObject({
      due: true,
      trigger: 'regime_changed',
      executable: false,
      totalCents: 100000,
    });
    expect(result.rows.map((row) => [row.sellCents, row.buyCents])).toEqual([
      [10000, 0],
      [0, 0],
      [0, 5000],
      [0, 5000],
    ]);
    expect(
      strategyRebalance({
        current: 'mixed',
        previous: 'mixed',
        effectiveDate: '2026-11-30',
        positions: positions([60000, 10000, 10000, 20000]),
        cashCents: 0,
      }).due,
    ).toBe(false);
    expect(
      strategyRebalance({
        current: 'mixed',
        previous: 'mixed',
        effectiveDate: '2026-12-30',
        positions: [],
        cashCents: 0,
      }).trigger,
    ).toBe('quarter_end');
  });
  it('keeps the next planning date visible beyond a finite verified execution calendar', () => {
    const execution = {
      id: 'synthetic-execution',
      verifiedComplete: true as const,
      from: '2026-11-01',
      through: '2026-11-30',
      days: ['2026-11-16'],
    };
    expect(nextStrategyContribution('2026-11-18', execution)).toMatchObject({
      nominalDate: '2026-12-15',
      executionDate: null,
      provisional: true,
      reason: 'execution_calendar_incomplete',
    });
    expect(nextStrategyContribution('2026-12-02', execution).nominalDate).toBe('2026-12-15');
  });
});
