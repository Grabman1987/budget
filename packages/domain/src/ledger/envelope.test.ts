import { describe, expect, it } from 'vitest';
import { envelopeMonth, envelopeSeries, overspentEnvelopes } from './envelope';

it('counts only negative available envelopes after the month carry rules, including one cent', () => {
  const regular = envelopeSeries([
    { month: '2026-08', assignedCents: 0, activityCents: -100 },
    { month: '2026-09', assignedCents: 0, activityCents: 0 },
  ]);
  const carried = envelopeSeries(
    [
      { month: '2026-08', assignedCents: 0, activityCents: -1 },
      { month: '2026-09', assignedCents: 0, activityCents: 0 },
    ],
    0,
    { rolloverOverspending: true },
  );
  const month = {
    envelopes: [
      regular[1]!,
      carried[1]!,
      envelopeMonth({ carryCents: 20, assignedCents: 0, activityCents: -21 }),
    ],
  };
  expect(overspentEnvelopes(month)).toEqual([month.envelopes[1], month.envelopes[2]]);
  expect(overspentEnvelopes({ envelopes: [] })).toEqual([]);
});

describe('envelopeMonth', () => {
  it('available = carry + assigned + activity (activity is negative for spending)', () => {
    expect(
      envelopeMonth({ carryCents: 2800, assignedCents: 57200, activityCents: -38800 }),
    ).toEqual({
      carryCents: 2800,
      assignedCents: 57200,
      activityCents: -38800,
      availableCents: 21200,
      overspentCents: 0,
    });
  });

  it('overspending shows as a negative available amount and as overspent cents', () => {
    const e = envelopeMonth({ carryCents: 0, assignedCents: 14000, activityCents: -15240 });
    expect(e.availableCents).toBe(-1240);
    expect(e.overspentCents).toBe(1240);
  });
});

describe('envelopeSeries', () => {
  it('rolls the available amount over from month to month', () => {
    const months = envelopeSeries([
      { month: '2026-07', assignedCents: 10000, activityCents: -4000 },
      { month: '2026-08', assignedCents: 10000, activityCents: -12000 },
      { month: '2026-09', assignedCents: 10000, activityCents: -5000 },
    ]);
    expect(months.map((m) => m.availableCents)).toEqual([6000, 4000, 9000]);
    expect(months.map((m) => m.carryCents)).toEqual([0, 6000, 4000]);
  });

  it('does not carry overspending (concept §5.3): the next month starts at 0', () => {
    const months = envelopeSeries([
      { month: '2026-08', assignedCents: 10000, activityCents: -15000 },
      { month: '2026-09', assignedCents: 5000, activityCents: 0 },
    ]);
    expect(months.map((m) => m.availableCents)).toEqual([-5000, 5000]);
    expect(months.map((m) => m.carryCents)).toEqual([0, 0]);
    expect(months.map((m) => m.overspentCents)).toEqual([5000, 0]);
  });

  it('carries the negative amount with rolloverOverspending (Actual option)', () => {
    const months = envelopeSeries(
      [
        { month: '2026-08', assignedCents: 10000, activityCents: -15000 },
        { month: '2026-09', assignedCents: 5000, activityCents: 0 },
      ],
      0,
      { rolloverOverspending: true },
    );
    expect(months.map((m) => m.availableCents)).toEqual([-5000, 0]);
  });

  it('starts from a given carry', () => {
    expect(
      envelopeSeries([{ month: '2026-01', assignedCents: 100, activityCents: 0 }], 900)[0]
        ?.availableCents,
    ).toBe(1000);
  });
});
