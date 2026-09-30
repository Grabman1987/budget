import { describe, expect, it } from 'vitest';
import { addDays, daysBetween } from '../date';
import { evenDaily, liquidityForecast, lowPoint, type ForecastItem } from './liquidity';
import {
  PROTO_EVENTS,
  PROTO_ITEMS,
  PROTO_LOW,
  PROTO_START_CENTS,
  PROTO_START_DAY,
  PROTO_SWEEP_BUFFER_CENTS,
  PROTO_VARIABLE_CENTS,
} from './zukunft-sample';

const none = () => 0;

describe('evenDaily', () => {
  it('days of a complete month add up to the monthly amount', () => {
    const f = evenDaily(() => 100_001);
    let sum = 0;
    for (let d = 1; d <= 30; d++) sum += f(`2026-09-${String(d).padStart(2, '0')}`);
    expect(sum).toBe(100_001);
    expect(f('2026-09-01')).toBe(3333);
  });

  it('follows the month and never goes negative', () => {
    const f = evenDaily((m) => (m === '2026-02' ? 28_000 : -5));
    expect(f('2026-02-14')).toBe(1000);
    expect(f('2026-03-14')).toBe(0);
  });
});

describe('liquidityForecast', () => {
  it('runs day by day: variable plan first, dated items on their day, items up to the start are ignored', () => {
    const items: ForecastItem[] = [
      { day: '2026-09-17', cents: -99_999, kind: 'fixed' },
      { day: '2026-09-19', cents: -5000, kind: 'fixed', label: 'Rent' },
      { day: '2026-09-19', cents: 20_000, kind: 'income' },
      { day: '2026-09-20', cents: -1000, kind: 'event' },
      { day: '2026-09-30', cents: 7, kind: 'income' },
    ];
    const f = liquidityForecast({
      startDay: '2026-09-17',
      startCents: 10_000,
      days: 3,
      items,
      variablePerDay: () => 100,
    });
    expect(f.days.map((d) => d.day)).toEqual([
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
    expect(f.days.map((d) => d.balanceCents)).toEqual([10_000, 9900, 24_800, 23_700]);
    expect(f.days[2]?.items).toEqual([
      { cents: -5000, kind: 'fixed', label: 'Rent' },
      { cents: 20_000, kind: 'income' },
    ]);
    expect(f.days[0]?.variableCents).toBe(0);
    expect(f.days[1]?.variableCents).toBe(100);
  });

  it('summarises months with start, flows by kind, low and end', () => {
    const f = liquidityForecast({
      startDay: '2026-09-29',
      startCents: 1000,
      days: 4,
      items: [
        { day: '2026-09-30', cents: -3000, kind: 'fixed' },
        { day: '2026-10-01', cents: 5000, kind: 'income' },
        { day: '2026-10-02', cents: -500, kind: 'event' },
      ],
      variablePerDay: () => 10,
    });
    expect(f.months).toEqual([
      {
        month: '2026-09',
        startCents: 1000,
        incomeCents: 0,
        fixedCents: -3000,
        variableCents: -10,
        eventCents: 0,
        sweepCents: 0,
        lowCents: -2010,
        endCents: -2010,
      },
      {
        month: '2026-10',
        startCents: -2010,
        incomeCents: 5000,
        fixedCents: 0,
        variableCents: -30,
        eventCents: -500,
        sweepCents: 0,
        lowCents: -2010,
        endCents: 2460,
      },
    ]);
  });

  it('never counts an overdraft as money: negative balances stay negative and show as the low point', () => {
    const f = liquidityForecast({
      startDay: '2026-09-17',
      startCents: -50_000,
      days: 2,
      items: [{ day: '2026-09-18', cents: -100, kind: 'fixed' }],
      variablePerDay: none,
    });
    expect(f.days.map((d) => d.balanceCents)).toEqual([-50_000, -50_100, -50_100]);
    expect(lowPoint(f.days, 2)).toEqual({ day: '2026-09-18', index: 1, cents: -50_100 });
  });

  describe('sweep above the buffer', () => {
    const base = {
      startDay: '2026-10-01',
      days: 3,
      variablePerDay: none,
      sweep: { dayOfMonth: 2, bufferCents: 560_000, horizonMonths: 4 },
    };

    it('moves the surplus above buffer plus planned expenses of the next months', () => {
      const f = liquidityForecast({
        ...base,
        startCents: 1_000_000,
        items: [
          { day: '2026-12-05', cents: -250_000, kind: 'event' }, // in the window (Oct to Jan)
          { day: '2027-02-28', cents: -381_200, kind: 'event' }, // outside
          { day: '2026-12-06', cents: 90_000, kind: 'event' }, // income events do not count
        ],
      });
      // keep = 5.600 + 2.500 = 8.100: 1.900 leave on the 2nd
      expect(f.days[1]?.balanceCents).toBe(810_000);
      expect(f.days[1]?.items).toEqual([{ cents: -190_000, kind: 'sweep' }]);
      expect(f.months[0]?.sweepCents).toBe(-190_000);
      expect(f.days[3]?.balanceCents).toBe(810_000);
    });

    it('does nothing at or below the buffer, and never sweeps a negative balance', () => {
      const at = liquidityForecast({ ...base, startCents: 560_000, items: [] });
      expect(at.days[1]?.items).toEqual([]);
      const below = liquidityForecast({ ...base, startCents: -1000, items: [] });
      expect(below.days[1]?.balanceCents).toBe(-1000);
    });

    it('sweeps after the items of that day', () => {
      const f = liquidityForecast({
        ...base,
        startCents: 560_000,
        items: [{ day: '2026-10-02', cents: 40_000, kind: 'income' }],
      });
      expect(f.days[1]?.balanceCents).toBe(560_000);
      expect(f.days[1]?.items.map((i) => i.kind)).toEqual(['income', 'sweep']);
    });
  });

  it('reproduces the 90-day low point of the prototype (reports-zukunft.js forecast)', () => {
    const items: ForecastItem[] = [
      ...PROTO_ITEMS.map(([d, kind, cents]) => ({ day: addDays(PROTO_START_DAY, d), kind, cents })),
      ...PROTO_EVENTS.map((e) => ({
        day: `${e.key}-${String(e.day).padStart(2, '0')}`,
        kind: 'event' as const,
        cents: e.cents,
      })),
    ];
    const f = liquidityForecast({
      startDay: PROTO_START_DAY,
      startCents: PROTO_START_CENTS,
      days: 90,
      items,
      variablePerDay: (day) => PROTO_VARIABLE_CENTS[daysBetween(PROTO_START_DAY, day) - 1] ?? 0,
      sweep: { dayOfMonth: 2, bufferCents: PROTO_SWEEP_BUFFER_CENTS, horizonMonths: 4 },
    });
    const low = lowPoint(f.days, 90);
    expect(low?.index).toBe(PROTO_LOW.day);
    // The prototype works with fractional cents; rounding every item to whole cents drifts by cents only.
    expect(Math.abs((low?.cents ?? 0) - PROTO_LOW.cents)).toBeLessThan(100);
    expect(f.days).toHaveLength(91);
    // the sample never reaches the sweep threshold
    expect(f.months.every((m) => m.sweepCents === 0)).toBe(true);
  });
});

describe('lowPoint', () => {
  const f = liquidityForecast({
    startDay: '2026-09-17',
    startCents: 1000,
    days: 6,
    items: [
      { day: '2026-09-19', cents: -800, kind: 'fixed' },
      { day: '2026-09-21', cents: -800, kind: 'fixed' },
      { day: '2026-09-22', cents: 5000, kind: 'income' },
    ],
    variablePerDay: none,
  });

  it('finds the lowest balance within the window, the earliest on a tie', () => {
    expect(lowPoint(f.days, 6)).toEqual({ day: '2026-09-21', index: 4, cents: -600 });
    expect(lowPoint(f.days, 3)).toEqual({ day: '2026-09-19', index: 2, cents: 200 });
    const tie = liquidityForecast({
      startDay: '2026-09-17',
      startCents: 5,
      days: 2,
      items: [],
      variablePerDay: none,
    });
    expect(lowPoint(tie.days, 2)?.index).toBe(0);
  });

  it('is null without days', () => {
    expect(lowPoint([], 10)).toBeNull();
  });
});
