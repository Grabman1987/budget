import { expect, it } from 'vitest';
import {
  dailyValuation,
  ExchangeRateUnavailableError,
  PriceUnavailableError,
  type DailyValuationObservation,
  type PositionInput,
  type RateTable,
} from './series';

const rates: RateTable = new Map([
  [
    'USD',
    [
      { date: '2026-09-18', rateMicro: 950000, source: 'ecb' },
      { date: '2026-09-19', rateMicro: 950000, source: 'manual' },
    ],
  ],
]);
const position = (overrides: Partial<PositionInput> = {}): PositionInput => ({
  accountId: 'a',
  securityId: 's',
  snapshots: [{ date: '2026-09-18', unitsE8: 100000000 }],
  trades: [],
  prices: [{ date: '2026-09-18', priceMicro: 120000000, currency: 'USD', source: 'import' }],
  ...overrides,
});

it('observes the original quote/FX choices and exact stale boundary without money or input references', () => {
  const p = position(),
    input = position();
  const observations: DailyValuationObservation[] = [];
  const days = ['2026-09-20', '2026-09-25', '2026-09-26'];
  const legacy = dailyValuation([p], days, rates);
  const observed = dailyValuation([p], days, rates, {
    observe: (event) => observations.push(event),
  });
  expect(observed).toEqual(legacy);
  expect(observed.totalCents).toEqual([11400, 11400, 11400]);
  expect(observations.map((event) => [event.day, event.quality])).toEqual([
    ['2026-09-20', 'exact'],
    ['2026-09-25', 'exact'],
    ['2026-09-26', 'stale'],
  ]);
  expect(observations[0]).toEqual({
    accountId: 'a',
    securityId: 's',
    day: '2026-09-20',
    kind: 'quote',
    quality: 'exact',
    date: '2026-09-18',
    currency: 'USD',
    source: 'import',
    lookAhead: false,
    fx: { kind: 'rate', date: '2026-09-19', source: 'manual' },
  });
  for (const event of observations) {
    expect(event).not.toHaveProperty('priceMicro');
    expect(event).not.toHaveProperty('rateMicro');
    expect(event).not.toHaveProperty('unitsE8');
    expect(event).not.toHaveProperty('valueCents');
  }
  observations[0]!.fx = { kind: 'missing' };
  expect(p).toEqual(input);
  expect(dailyValuation([p], days, rates)).toEqual(legacy);
});

it('labels the approved future gross execution and preserves literal .95 conversion without fees or taxes', () => {
  const events: DailyValuationObservation[] = [];
  const p = position({
    prices: [],
    priceTrades: [
      {
        date: '2026-09-21',
        kind: 'buy',
        unitsE8: 100000000,
        amountCents: 12000,
        feeCents: 999,
        taxCents: 777,
        currency: 'USD',
      },
    ],
  });
  expect(
    dailyValuation([p], ['2026-09-20'], rates, { observe: (e) => events.push(e) }).totalCents,
  ).toEqual([11400]);
  expect(events[0]).toMatchObject({
    kind: 'execution',
    date: '2026-09-21',
    currency: 'USD',
    source: null,
    quality: 'exact',
    lookAhead: true,
    fx: { kind: 'rate', date: '2026-09-19' },
  });
  expect(events[0]).not.toHaveProperty('execution');
});

it('observes the actual average-cost fallback across a split barrier, never a barred future execution', () => {
  const events: DailyValuationObservation[] = [];
  const p = position({
    prices: [],
    priceTrades: [
      {
        date: '2026-09-21',
        kind: 'split',
        unitsE8: 100000000,
        amountCents: 0,
        feeCents: 0,
        taxCents: 0,
      },
      {
        date: '2026-09-22',
        kind: 'buy',
        unitsE8: 100000000,
        amountCents: 12000,
        feeCents: 0,
        taxCents: 0,
      },
    ],
    cost: {
      currency: 'USD',
      snapshots: [{ date: '2026-09-18', costBasisCents: 10000 }],
      trades: [],
    },
  });
  expect(
    dailyValuation([p], ['2026-09-20'], rates, { observe: (e) => events.push(e) }).totalCents,
  ).toEqual([9500]);
  expect(events[0]).toMatchObject({
    kind: 'cost',
    quality: 'estimated',
    costMethod: 'average',
    date: null,
    source: null,
    currency: 'USD',
    lookAhead: false,
  });
});

it('keeps absent-basis FX unevaluated and absent cost FX missing instead of claiming an observed zero', () => {
  const events: DailyValuationObservation[] = [];
  const p = position({ prices: [] });
  expect(
    dailyValuation([p], ['2026-09-20'], new Map(), { observe: (e) => events.push(e) }).totalCents,
  ).toEqual([0]);
  expect(events[0]).toMatchObject({
    kind: 'missing',
    quality: 'missing',
    missing: 'price-or-basis',
    fx: { kind: 'not-evaluated' },
  });
  events.length = 0;
  const cost = {
    ...p,
    cost: {
      currency: 'USD',
      snapshots: [{ date: '2026-09-18', costBasisCents: 10000 }],
      trades: [],
    },
  };
  expect(
    dailyValuation([cost], ['2026-09-20'], new Map(), { observe: (e) => events.push(e) })
      .totalCents,
  ).toEqual([0]);
  expect(events[0]).toMatchObject({
    kind: 'cost',
    costMethod: 'average',
    quality: 'missing',
    missing: 'fx',
    fx: { kind: 'missing' },
  });
});

it('does not observe zero units or suppress original strict/missing-FX exceptions; negatives remain observed', () => {
  const events: DailyValuationObservation[] = [];
  const observe = (e: Readonly<DailyValuationObservation>) => events.push(e);
  expect(
    dailyValuation([position({ snapshots: [] })], ['2026-09-20'], new Map(), { observe })
      .totalCents,
  ).toEqual([0]);
  expect(events).toEqual([]);
  expect(() => dailyValuation([position()], ['2026-09-20'], new Map(), { observe })).toThrow(
    ExchangeRateUnavailableError,
  );
  expect(() =>
    dailyValuation([position({ prices: [] })], ['2026-09-20'], rates, { observe, estimate: false }),
  ).toThrow(PriceUnavailableError);
  expect(events).toEqual([]);
  expect(
    dailyValuation(
      [position({ snapshots: [{ date: '2026-09-18', unitsE8: -100000000 }] })],
      ['2026-09-20'],
      rates,
      { observe },
    ).totalCents,
  ).toEqual([-11400]);
  expect(events).toHaveLength(1);
});

it('drops unknown source labels without exposing raw provider strings or changing conversion', () => {
  const events: DailyValuationObservation[] = [];
  const secretLike = 'https://synthetic.invalid/private?token=not-a-real-secret';
  const p = position({
    prices: [{ date: '2026-09-18', currency: 'USD', priceMicro: 120000000, source: secretLike }],
  });
  const unknown: RateTable = new Map([
    ['USD', [{ date: '2026-09-19', rateMicro: 950000, source: secretLike }]],
  ]);
  expect(
    dailyValuation([p], ['2026-09-20'], unknown, { observe: (e) => events.push(e) }).totalCents,
  ).toEqual([11400]);
  expect(events[0]).toMatchObject({
    source: null,
    fx: { kind: 'rate', source: null, date: '2026-09-19' },
  });
  expect(JSON.stringify(events)).not.toContain(secretLike);
});
