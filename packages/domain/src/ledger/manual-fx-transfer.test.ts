import { describe, expect, it } from 'vitest';
import { planManualFxTransfer, type ManualFxTransferInput } from './manual-fx-transfer';

// Literal synthetic posting oracles; no expected amount is calculated by the planner.
const fixture: ManualFxTransferInput = {
  date: '2026-10-18',
  from: { accountId: 'cash-usd', currency: 'USD', amountCents: 10_000, onBudget: false },
  to: { accountId: 'cash-eur', currency: 'EUR', amountCents: 9_000, onBudget: false },
  executionQuote: {
    baseCurrency: 'USD',
    quoteCurrency: 'EUR',
    rateMicro: 900_000,
    date: '2026-10-18',
    source: 'synthetic-execution',
  },
  principalCategoryId: null,
  costs: { kind: 'none' },
  referenceRates: {
    from: { date: '2026-10-16', rateMicro: 950_000, source: 'synthetic-reference' },
  },
};

function ready(input: unknown = fixture) {
  const result = planManualFxTransfer(input);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Expected a complete domain plan');
  return result;
}

describe('manual FX transfer preparation (#519)', () => {
  it('preserves exactly two native principals and discloses reference loss without a booking', () => {
    const result = ready();
    expect(result.principalLegs).toEqual([
      {
        accountId: 'cash-usd',
        currency: 'USD',
        amountCents: -10_000,
        categoryId: null,
        transferAccountId: 'cash-eur',
      },
      {
        accountId: 'cash-eur',
        currency: 'EUR',
        amountCents: 9_000,
        categoryId: null,
        transferAccountId: 'cash-usd',
      },
    ]);
    expect(result.fees).toEqual([]);
    expect(result.executionQuote).toEqual(fixture.executionQuote);
    expect(result.quoteComparison).toEqual({
      currency: 'EUR',
      expectedCents: 9_000,
      actualCents: 9_000,
      differenceCents: 0,
    });
    expect(result.referenceValuation.principal.map((leg) => leg.eurCents)).toEqual([-9_500, 9_000]);
    expect(result.referenceValuation.executionEffectEurCents).toBe(-500);
    expect(result.referenceValuation.totalChangeEurCents).toBe(-500);
    expect(result.referenceValuation.principal[0]).toMatchObject({
      rateDate: '2026-10-16',
      rateSource: 'synthetic-reference',
    });
  });

  it('records actual separately charged fees without netting either principal', () => {
    const result = ready({
      ...fixture,
      costs: {
        kind: 'separate',
        fees: [
          {
            side: 'from',
            currency: 'USD',
            amountCents: 200,
            categoryId: 'fee-category',
            source: 'synthetic-charge-a',
          },
          {
            side: 'to',
            currency: 'EUR',
            amountCents: 30,
            categoryId: 'fee-category',
            source: 'synthetic-charge-b',
          },
        ],
      },
    });
    expect(result.principalLegs.map((leg) => leg.amountCents)).toEqual([-10_000, 9_000]);
    expect(result.fees).toEqual([
      {
        accountId: 'cash-usd',
        currency: 'USD',
        amountCents: -200,
        categoryId: 'fee-category',
        source: 'synthetic-charge-a',
      },
      {
        accountId: 'cash-eur',
        currency: 'EUR',
        amountCents: -30,
        categoryId: 'fee-category',
        source: 'synthetic-charge-b',
      },
    ]);
    expect(result.referenceValuation.fees.map((fee) => fee.eurCents)).toEqual([-190, -30]);
    expect(result.referenceValuation.executionEffectEurCents).toBe(-500);
    expect(result.referenceValuation.totalChangeEurCents).toBe(-720);
    // Per-account native conservation, including a separately debited fee.
    expect(result.principalLegs[0].amountCents + result.fees[0]!.amountCents).toBe(-10_200);
    expect(result.principalLegs[1].amountCents + result.fees[1]!.amountCents).toBe(8_970);
  });

  it.each([
    [1, 1, 499_999, 0, 1],
    [1, 1, 500_000, 1, 0],
    [101, 51, 500_000, 51, 0],
    [101, 49, 500_000, 51, -2],
  ])(
    'compares %i source cents with %i actual destination cents at %i micro',
    (from, to, rate, expected, difference) => {
      const result = ready({
        ...fixture,
        from: { ...fixture.from, amountCents: from },
        to: { ...fixture.to, amountCents: to },
        executionQuote: { ...fixture.executionQuote, rateMicro: rate },
      });
      expect(result.quoteComparison).toEqual({
        currency: 'EUR',
        expectedCents: expected,
        actualCents: to,
        differenceCents: difference,
      });
      expect(result.principalLegs.map((leg) => leg.amountCents)).toEqual([-from, to]);
      expect(result.fees).toEqual([]);
    },
  );

  it('uses the recorded reverse orientation directly, without a rounded reciprocal', () => {
    const result = ready({
      ...fixture,
      from: { ...fixture.from, amountCents: 3_000_000 },
      to: { ...fixture.to, amountCents: 1_000_000 },
      executionQuote: {
        ...fixture.executionQuote,
        baseCurrency: 'EUR',
        quoteCurrency: 'USD',
        rateMicro: 3_000_000,
      },
    });
    expect(result.quoteComparison).toEqual({
      currency: 'EUR',
      expectedCents: 1_000_000,
      actualCents: 1_000_000,
      differenceCents: 0,
    });
  });

  it('rounds each signed reference leg once; a half-cent never becomes a synthetic charge', () => {
    const result = ready({
      ...fixture,
      from: { ...fixture.from, amountCents: 101 },
      to: { ...fixture.to, amountCents: 51 },
      executionQuote: { ...fixture.executionQuote, rateMicro: 500_000 },
      referenceRates: {
        from: { date: fixture.date, rateMicro: 500_000, source: 'synthetic-reference' },
      },
    });
    expect(result.referenceValuation.principal.map((leg) => leg.eurCents)).toEqual([-51, 51]);
    expect(result.referenceValuation.executionEffectEurCents).toBe(0);
    expect(result.referenceValuation.totalChangeEurCents).toBe(0);
  });

  it.each([{}, { from: { date: '2026-10-19', rateMicro: 950_000, source: 'synthetic-future' } }])(
    'keeps missing or future reference FX unavailable without assuming parity',
    (referenceRates) => {
      const result = ready({ ...fixture, referenceRates });
      expect(result.referenceValuation.principal.map((leg) => leg.eurCents)).toEqual([null, 9_000]);
      expect(result.referenceValuation.executionEffectEurCents).toBeNull();
      expect(result.referenceValuation.totalChangeEurCents).toBeNull();
      expect(result.principalLegs).toHaveLength(2);
    },
  );

  it.each([
    [true, false, 'principal-category', null],
    [false, true, null, 'principal-category'],
    [true, true, null, null],
  ])(
    'places the explicit category only on a crossing budget leg',
    (fromBudget, toBudget, fromCategory, toCategory) => {
      const result = ready({
        ...fixture,
        from: { ...fixture.from, onBudget: fromBudget },
        to: { ...fixture.to, onBudget: toBudget },
        principalCategoryId: fromBudget !== toBudget ? 'principal-category' : null,
      });
      expect(result.principalLegs.map((leg) => leg.categoryId)).toEqual([fromCategory, toCategory]);
    },
  );

  it.each(['embedded-fee', 'spread', 'unknown'])(
    'returns only manual review for unsupported %s costs',
    (kind) => {
      expect(planManualFxTransfer({ ...fixture, costs: { kind } })).toEqual({
        status: 'manual-review',
        reason: 'unsupported-costs',
      });
    },
  );

  it.each([
    { from: { ...fixture.from, amountCents: 0 } },
    { from: { ...fixture.from, amountCents: -1 } },
    { from: { ...fixture.from, amountCents: 1.5 } },
    { from: { ...fixture.from, amountCents: Number.MAX_SAFE_INTEGER + 1 } },
    { to: { ...fixture.to, amountCents: undefined } },
    { to: { ...fixture.to, accountId: fixture.from.accountId } },
    { to: { ...fixture.to, currency: 'USD' } },
    { executionQuote: undefined },
    { executionQuote: { ...fixture.executionQuote, rateMicro: 0 } },
    { executionQuote: { ...fixture.executionQuote, rateMicro: 1.5 } },
    { executionQuote: { ...fixture.executionQuote, baseCurrency: undefined } },
    { executionQuote: { ...fixture.executionQuote, quoteCurrency: 'GBP' } },
    { executionQuote: { ...fixture.executionQuote, source: ' ' } },
    { executionQuote: { ...fixture.executionQuote, date: '2026-10-19' } },
    { date: '2026-02-30' },
    { costs: undefined },
    { costs: { kind: 'separate', fees: [] } },
    { from: { ...fixture.from, onBudget: true } },
    { principalCategoryId: 'unexpected-category' },
    { referenceRates: { from: { date: fixture.date, rateMicro: -1, source: 'synthetic' } } },
    {
      costs: {
        kind: 'separate',
        fees: [
          {
            side: 'from',
            currency: 'EUR',
            amountCents: 200,
            categoryId: 'fee-category',
            source: 'synthetic',
          },
        ],
      },
    },
    {
      costs: {
        kind: 'separate',
        fees: [
          {
            side: 'from',
            currency: 'USD',
            amountCents: 200,
            categoryId: null,
            source: 'synthetic',
          },
        ],
      },
    },
  ])('does not produce partial postings for invalid explicit inputs: %j', (patch) => {
    expect(planManualFxTransfer({ ...fixture, ...patch })).toEqual({
      status: 'manual-review',
      reason: 'invalid-input',
    });
  });

  it('rejects unsafe derived amounts rather than emitting rounded or partial postings', () => {
    expect(
      planManualFxTransfer({
        ...fixture,
        from: { ...fixture.from, amountCents: Number.MAX_SAFE_INTEGER },
        executionQuote: { ...fixture.executionQuote, rateMicro: 2_000_000 },
      }),
    ).toEqual({ status: 'manual-review', reason: 'unsafe-amount' });
  });

  it('does not mutate supplied native amounts or provenance', () => {
    const original = JSON.stringify(fixture);
    ready(fixture);
    expect(JSON.stringify(fixture)).toBe(original);
  });

  it('conserves an explicit EUR to USD transfer with its inverse, in each native currency', () => {
    const outward = ready({
      ...fixture,
      from: fixture.to,
      to: fixture.from,
      executionQuote: {
        ...fixture.executionQuote,
        baseCurrency: 'EUR',
        quoteCurrency: 'USD',
        rateMicro: 1_111_111,
      },
      referenceRates: { to: fixture.referenceRates.from },
    });
    const inward = ready();
    expect(outward.principalLegs.map((leg) => leg.amountCents)).toEqual([-9_000, 10_000]);
    expect(outward.referenceValuation.principal.map((leg) => leg.eurCents)).toEqual([
      -9_000, 9_500,
    ]);
    expect(outward.referenceValuation.executionEffectEurCents).toBe(500);
    expect(outward.principalLegs[0].amountCents + inward.principalLegs[1].amountCents).toBe(0);
    expect(outward.principalLegs[1].amountCents + inward.principalLegs[0].amountCents).toBe(0);
  });

  it('values a non-EUR pair using each currency reference, independently of the execution quote', () => {
    const result = ready({
      ...fixture,
      to: { ...fixture.to, accountId: 'cash-gbp', currency: 'GBP', amountCents: 8_000 },
      executionQuote: { ...fixture.executionQuote, quoteCurrency: 'GBP', rateMicro: 800_000 },
      referenceRates: {
        from: fixture.referenceRates.from,
        to: { date: '2026-10-16', rateMicro: 1_200_000, source: 'synthetic-reference-gbp' },
      },
    });
    expect(result.principalLegs.map((leg) => [leg.currency, leg.amountCents])).toEqual([
      ['USD', -10_000],
      ['GBP', 8_000],
    ]);
    expect(result.referenceValuation.principal.map((leg) => leg.eurCents)).toEqual([-9_500, 9_600]);
    expect(result.referenceValuation.executionEffectEurCents).toBe(100);
    expect(result.fees).toEqual([]);
  });

  it('does not double-round cents through EUR when comparing a cross-currency quote', () => {
    const result = ready({
      ...fixture,
      from: { ...fixture.from, amountCents: 1 },
      to: { ...fixture.to, currency: 'GBP', amountCents: 1 },
      executionQuote: { ...fixture.executionQuote, quoteCurrency: 'GBP', rateMicro: 833_333 },
      referenceRates: {
        from: { date: fixture.date, rateMicro: 500_000, source: 'synthetic-reference-usd' },
        to: { date: fixture.date, rateMicro: 600_000, source: 'synthetic-reference-gbp' },
      },
    });
    expect(result.quoteComparison.expectedCents).toBe(1);
    expect(result.referenceValuation.principal.map((leg) => leg.eurCents)).toEqual([-1, 1]);
  });

  it('rejects overflow in a combined native debit, even when every individual amount is safe', () => {
    expect(
      planManualFxTransfer({
        ...fixture,
        from: { ...fixture.from, amountCents: Number.MAX_SAFE_INTEGER },
        executionQuote: { ...fixture.executionQuote, rateMicro: 1 },
        costs: {
          kind: 'separate',
          fees: [
            {
              side: 'from',
              currency: 'USD',
              amountCents: 1,
              categoryId: 'fee-category',
              source: 'synthetic-charge',
            },
          ],
        },
      }),
    ).toEqual({ status: 'manual-review', reason: 'unsafe-amount' });
  });
});
