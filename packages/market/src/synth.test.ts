import { describe, expect, it } from 'vitest';
import { fixtureFxSource, fixtureQuoteSource } from './fixture';
import { isWeekday, synthHistory, type Anchor } from './synth';
import type { SecurityRef } from './types';

const ANCHORS: Anchor[] = [
  { date: '2024-01-31', value: 100_000_000 },
  { date: '2024-02-29', value: 105_250_000 },
  { date: '2024-03-31', value: 99_000_000 }, // a Sunday
];
const OPTS = { seed: 'x', volBp: 120 };

describe('synthHistory', () => {
  it('hits every anchor exactly, including a weekend anchor', () => {
    const series = synthHistory(ANCHORS, '2024-01-31', '2024-03-31', OPTS);
    const byDate = new Map(series.map((p) => [p.date, p.value]));
    for (const a of ANCHORS) expect(byDate.get(a.date), a.date).toBe(a.value);
  });

  it('has weekdays between anchors, positive integers, and is deterministic', () => {
    const series = synthHistory(ANCHORS, '2024-01-31', '2024-03-31', OPTS);
    const between = series.filter((p) => p.date > '2024-01-31' && p.date < '2024-03-31');
    expect(between.every((p) => isWeekday(p.date))).toBe(true);
    expect(between.length).toBeGreaterThan(40);
    expect(series.every((p) => Number.isSafeInteger(p.value) && p.value > 0)).toBe(true);
    expect(synthHistory(ANCHORS, '2024-01-31', '2024-03-31', OPTS)).toEqual(series);
    const other = synthHistory(ANCHORS, '2024-01-31', '2024-03-31', { ...OPTS, seed: 'y' });
    expect(other).not.toEqual(series);
  });

  it('gives the same value for a day whatever range is asked', () => {
    const full = new Map(
      synthHistory(ANCHORS, '2023-12-01', '2024-04-30', OPTS).map((p) => [p.date, p.value]),
    );
    for (const [from, to] of [
      ['2024-02-10', '2024-02-20'],
      ['2024-03-28', '2024-04-10'],
      ['2023-12-15', '2024-01-31'],
    ] as const)
      for (const p of synthHistory(ANCHORS, from, to, OPTS))
        expect(full.get(p.date), p.date).toBe(p.value);
  });

  it('continues with a walk before the first and after the last anchor', () => {
    const series = synthHistory(ANCHORS, '2024-01-22', '2024-04-05', OPTS);
    expect(series[0]?.date).toBe('2024-01-22');
    expect(series.at(-1)?.date).toBe('2024-04-05');
    expect(series.every((p) => p.value > 0)).toBe(true);
    expect(synthHistory([], '2024-01-01', '2024-01-31', OPTS)).toEqual([]);
  });
});

describe('fixture sources', () => {
  const ref: SecurityRef = {
    id: 's1',
    symbol: 'SYN-A',
    fallbackQuoteId: null,
    quoteExchange: null,
    currency: 'EUR',
    adjusted: false,
  };

  it('quotes go through the anchors and never need a network', async () => {
    const source = fixtureQuoteSource({ anchorsFor: () => ANCHORS });
    const quotes = await source.history(ref, '2024-01-31', '2024-02-29');
    expect(quotes[0]).toEqual({ date: '2024-01-31', priceMicro: 100_000_000 });
    expect(quotes.at(-1)).toEqual({ date: '2024-02-29', priceMicro: 105_250_000 });
  });

  it('a security without anchors gets a synthetic base; rates likewise', async () => {
    const quotes = await fixtureQuoteSource().history(ref, '2023-09-25', '2023-10-06');
    expect(quotes.length).toBeGreaterThan(5);
    const rates = await fixtureFxSource().history('USD', '2023-09-25', '2023-10-06');
    expect(rates.length).toBe(quotes.length);
    expect(rates.every((r) => r.rateMicro > 0)).toBe(true);
  });
});
