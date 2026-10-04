import { describe, expect, it } from 'vitest';
import {
  contractPrices,
  derivePriceHistory,
  personalInflation,
  type InflationItem,
} from './inflation';

const months = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const n = i; // 2023-10 first
    const y = 2023 + Math.floor((9 + n) / 12);
    return `${y}-${String(((9 + n) % 12) + 1).padStart(2, '0')}`;
  });
const available = months(36); // 2023-10 .. 2026-09
const flat = (value: number, from = 0): Record<string, number | null> =>
  Object.fromEntries(available.map((m, i) => [m, i >= from ? value : null]));
const spend = (value: number) => Object.fromEntries(available.map((m) => [m, value]));
const steps = (steps: Array<[number, number]>): Record<string, number | null> =>
  Object.fromEntries(
    available.map((m, i) => [m, [...steps].reverse().find(([from]) => i >= from)?.[1] ?? null]),
  );

describe('personalInflation', () => {
  const rent: InflationItem = {
    id: 'rent',
    name: 'Miete',
    class: 'need',
    level: steps([
      [0, 80_000],
      [24, 88_000], // +10 % in month 24 (2025-10)
    ]),
    spend: spend(80_000),
  };
  const power: InflationItem = {
    id: 'power',
    name: 'Strom',
    class: 'need',
    level: steps([
      [0, 10_000],
      [30, 12_000], // +20 %
    ]),
    spend: spend(10_000),
  };
  const result = personalInflation({
    available,
    items: [rent, power],
    baseConsumptionCents: 12 * 120_000,
  });

  it('is a fixed-weight index that starts at 100', () => {
    expect(result.status).toBe('ok');
    expect(result.points[0]?.index).toBe(100);
    // Weights 8/9 and 1/9: rent +10 % from month 24, power +20 % from month 30.
    expect(result.points[24]?.index).toBeCloseTo(100 + (8 / 9) * 10, 3);
    expect(result.points[35]?.index).toBeCloseTo(100 + (8 / 9) * 10 + (1 / 9) * 20, 3);
  });
  it('measures the last twelve months against the twelve before', () => {
    expect(result.fromMonth).toBe('2023-10'.replace('2023-10', available[23]!));
    expect(result.toMonth).toBe(available[35]);
    const from = result.points[23]!.index;
    const to = result.points[35]!.index;
    expect(result.inflationBp).toBe(Math.round((to / from - 1) * 10_000));
  });
  it('contributions are weight times price change and add up to the index change', () => {
    const [first, second] = result.contributions;
    expect(first?.id).toBe('rent');
    expect(first).toMatchObject({ changeBp: 1_000, shareBp: 8_889 });
    expect(second).toMatchObject({ id: 'power', changeBp: 2_000, shareBp: 1_111 });
    expect(result.contributionSumBp).toBe(
      result.contributions.reduce((a, c) => a + c.contributionBp, 0),
    );
    expect(Math.abs(result.contributionSumBp - (result.inflationBp ?? 0))).toBeLessThanOrEqual(2);
  });
  it('says how much of the consumption the basket covers', () => {
    expect(result.basketItems).toBe(2);
    expect(result.coverageBp).toBe(Math.round((12 * 90_000 * 10_000) / (12 * 120_000)));
  });
  it('leaves out contracts that started after the base month and keeps ended ones at their last price', () => {
    const late: InflationItem = {
      id: 'late',
      name: 'Neu',
      class: 'want',
      level: flat(5_000, 20),
      spend: spend(5_000),
    };
    const ended: InflationItem = {
      id: 'ended',
      name: 'Alt',
      class: 'want',
      level: Object.fromEntries(available.map((m, i) => [m, i < 10 ? 2_000 : null])),
      spend: spend(2_000),
    };
    const r = personalInflation({ available, items: [rent, late, ended], baseConsumptionCents: 1 });
    expect(r.basketItems).toBe(2);
    // The new contract has a price at both ends of the window and no change; the ended one has none.
    expect(r.contributions.map((c) => [c.id, c.changeBp])).toEqual([
      ['rent', 1_000],
      ['late', 0],
    ]);
    expect(r.points[35]?.index).toBeGreaterThan(100);
  });
  it('compares with a reference index when one is stored', () => {
    const reference = Object.fromEntries(available.map((m, i) => [m, 100 + i]));
    const r = personalInflation({ available, items: [rent], baseConsumptionCents: 1, reference });
    expect(r.points[0]?.reference).toBe(100);
    expect(r.referenceBp).toBe(Math.round((135 / 123 - 1) * 10_000));
    expect(r.differenceBp).toBe((r.inflationBp ?? 0) - (r.referenceBp ?? 0));
    expect(result.referenceBp).toBeNull();
    expect(result.differenceBp).toBeNull();
  });
  it('compares month by month and by calendar-year averages when the reference ends earlier', () => {
    // A reference that starts before the own data and ends in December 2025: +0,5 per month.
    const refMonths = Array.from({ length: 60 }, (_, i) => {
      const y = 2021 + Math.floor(i / 12);
      return [`${y}-${String((i % 12) + 1).padStart(2, '0')}`, 100 + i * 0.5] as const;
    });
    const reference = Object.fromEntries(refMonths);
    const r = personalInflation({ available, items: [rent], baseConsumptionCents: 1, reference });
    // 12-month changes start with the 13th month; the reference has them until its last month.
    expect(r.monthly[0]?.month).toBe('2024-10');
    const dec = r.monthly.find((m) => m.month === '2025-12');
    expect(dec?.referenceBp).toBe(
      Math.round((reference['2025-12']! / reference['2024-12']! - 1) * 1e4),
    );
    expect(r.monthly.find((m) => m.month === '2026-01')?.referenceBp).toBeNull();
    expect(r.latestComparison?.month).toBe('2025-12');
    expect(r.latestComparison?.differenceBp).toBe((dec?.ownBp ?? 0) - (dec?.referenceBp ?? 0));
    // The window of the headline lies beyond the reference: no window figure, not a guess.
    expect(r.referenceBp).toBeNull();
    // Years: 2023 is cut at the start, 2026 at the end; changes only between complete years.
    const y = Object.fromEntries(r.years.map((x) => [x.year, x]));
    expect(r.years.map((x) => x.year)).toEqual([2023, 2024, 2025, 2026]);
    expect([y[2023]?.ownMonths, y[2024]?.ownMonths, y[2026]?.ownMonths]).toEqual([3, 12, 9]);
    expect(y[2024]?.ownChangeBp).toBeNull();
    expect(y[2025]?.ownChangeBp).not.toBeNull();
    expect(y[2024]?.referenceMonths).toBe(12);
    expect(y[2023]?.referenceMonths).toBe(12);
    // Reference averages are rebased to the first own month (= 100).
    const base = reference['2023-10']!;
    const avg2024 =
      (refMonths.filter(([m]) => m.startsWith('2024-')).reduce((a, [, v]) => a + v, 0) /
        12 /
        base) *
      100;
    expect(y[2024]?.referenceAverage).toBeCloseTo(avg2024, 3);
    expect(y[2024]?.referenceChangeBp).toBe(
      Math.round((y[2024]!.referenceAverage! / y[2023]!.referenceAverage! - 1) * 1e4),
    );
    expect(y[2026]?.referenceChangeBp).toBeNull();
  });
  it('is insufficient with less than 13 months or without priced items', () => {
    expect(
      personalInflation({
        available: available.slice(0, 12),
        items: [rent],
        baseConsumptionCents: 1,
      }).status,
    ).toBe('insufficient');
    expect(personalInflation({ available, items: [], baseConsumptionCents: 1 }).status).toBe(
      'insufficient',
    );
    const noSpend = { ...rent, spend: {} };
    expect(personalInflation({ available, items: [noSpend], baseConsumptionCents: 1 }).status).toBe(
      'insufficient',
    );
  });
});

describe('derivePriceHistory', () => {
  const monthly = (cents: number[], from = 1) =>
    cents.map((c, i) => ({
      date: `2026-${String(from + i).padStart(2, '0')}-03`,
      amountCents: c,
    }));

  it('opens at the first charge and adds a price that stays', () => {
    expect(derivePriceHistory(monthly([-1_000, -1_000, -1_200, -1_200, -1_200]))).toEqual([
      { validFrom: '2026-01-03', amountCents: 1_000 },
      { validFrom: '2026-03-03', amountCents: 1_200 },
    ]);
  });

  it('ignores a one-off outlier but follows a second price change', () => {
    expect(derivePriceHistory(monthly([-1_000, -1_500, -1_000, -1_000, -1_100, -1_100]))).toEqual([
      { validFrom: '2026-01-03', amountCents: 1_000 },
      { validFrom: '2026-05-03', amountCents: 1_100 },
    ]);
  });

  it('ignores refunds and sorts by date', () => {
    const charges = [...monthly([-1_000, 1_000, -1_000, -1_300, -1_300])].reverse();
    expect(derivePriceHistory(charges)).toEqual([
      { validFrom: '2026-01-03', amountCents: 1_000 },
      { validFrom: '2026-04-03', amountCents: 1_300 },
    ]);
  });

  it('does not trust the newest charge alone and needs one charge at least', () => {
    expect(derivePriceHistory(monthly([-1_000, -1_000, -1_400]))).toEqual([
      { validFrom: '2026-01-03', amountCents: 1_000 },
    ]);
    expect(derivePriceHistory(monthly([-1_000]))).toEqual([
      { validFrom: '2026-01-03', amountCents: 1_000 },
    ]);
    expect(derivePriceHistory([])).toEqual([]);
  });
});

describe('contractPrices', () => {
  const charges = [
    { date: '2026-01-03', amountCents: -1_000 },
    { date: '2026-02-03', amountCents: -1_200 },
    { date: '2026-03-03', amountCents: -1_200 },
  ];
  const v = (validFrom: string, amountCents: number) => ({
    validFrom,
    amountCents,
    currency: 'EUR',
  });

  it('lets an explicit history win over the charges', () => {
    const stored = [v('2025-01-01', 900), v('2025-06-01', 950)];
    expect(contractPrices(stored, charges)).toEqual({ versions: stored, source: 'stored' });
  });

  it('derives from the charges when there is no history, in the stored currency', () => {
    expect(contractPrices([{ ...v('2026-03-01', 1_200), currency: 'USD' }], charges)).toEqual({
      versions: [
        { validFrom: '2026-01-03', amountCents: 1_000, currency: 'USD' },
        { validFrom: '2026-02-03', amountCents: 1_200, currency: 'USD' },
      ],
      source: 'bookings',
    });
  });

  it('keeps the stored versions when there is no charge', () => {
    expect(contractPrices([], [])).toEqual({ versions: [], source: 'stored' });
  });
});
