import { describe, expect, it } from 'vitest';
import { plannedEventOccurrences, planYearScenario } from './planned-events';

const event = {
  id: 'trip',
  name: 'Urlaub',
  date: '2026-01-31',
  amountCents: -10_001,
  categoryId: 'travel',
  enabled: true,
  recurrence: 'monthly' as const,
  recurrenceMonths: [],
  recurrenceUntil: null,
};

describe('planned event recurrence', () => {
  it('terminates at the last supported calendar year', () => {
    expect(plannedEventOccurrences(event, '9999-12-01', '9999-12-31').map((o) => o.date)).toEqual([
      '9999-12-31',
    ]);
  });
  it('clamps short months without drifting; range and end are inclusive', () => {
    expect(plannedEventOccurrences(event, '2026-02-01', '2026-04-30').map((o) => o.date)).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(
      plannedEventOccurrences(
        { ...event, recurrenceUntil: '2026-03-30' },
        '2026-01-01',
        '2026-12-31',
      ).map((o) => o.date),
    ).toEqual(['2026-01-31', '2026-02-28']);
  });
  it('anchors quarters and years and repeats selected months after the start only', () => {
    expect(
      plannedEventOccurrences(
        { ...event, recurrence: 'quarterly' },
        '2026-01-01',
        '2026-12-31',
      ).map((o) => o.date),
    ).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']);
    expect(
      plannedEventOccurrences(
        { ...event, date: '2024-02-29', recurrence: 'yearly' },
        '2025-01-01',
        '2028-12-31',
      ).map((o) => o.date),
    ).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    expect(
      plannedEventOccurrences(
        { ...event, date: '2026-07-15', recurrence: 'months', recurrenceMonths: [6, 11] },
        '2026-01-01',
        '2027-12-31',
      ).map((o) => o.date),
    ).toEqual(['2026-11-15', '2027-06-15', '2027-11-15']);
    expect(
      plannedEventOccurrences({ ...event, recurrence: 'once' }, '2026-02-01', '2027-12-31'),
    ).toEqual([]);
  });
});

describe('annual scenario overlays', () => {
  const baseline = Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    toBeAssignedCents: 50_000,
  }));
  it('uses future selected enabled events once, carries their delta, never sums baseline stocks', () => {
    const events = [
      event,
      {
        ...event,
        id: 'bonus',
        date: '2026-03-20',
        amountCents: 30_000,
        recurrence: 'once' as const,
      },
      { ...event, id: 'off', enabled: false },
    ];
    const result = planYearScenario(2026, baseline, events, ['trip', 'bonus', 'off'], '2026-02-28');
    expect(result.months[1]).toMatchObject({ effectCents: 0, withCents: 50_000 });
    expect(result.months[2]).toEqual({
      month: '2026-03',
      withoutCents: 50_000,
      eventCents: 19_999,
      effectCents: 19_999,
      withCents: 69_999,
    });
    expect(result.yearEnd).toEqual({
      month: '2026-12',
      withoutCents: 50_000,
      eventCents: -10_001,
      effectCents: -70_010,
      withCents: -20_010,
    });
    expect(planYearScenario(2026, baseline, events, [], '2026-02-28').yearEnd.withCents).toBe(
      50_000,
    );
    expect(baseline[11]?.toBeAssignedCents).toBe(50_000);
  });
  it('requires twelve distinct months rather than showing a partial projection', () => {
    expect(() => planYearScenario(2026, baseline.slice(1), [], [], '2026-02-28')).toThrow();
    expect(() =>
      planYearScenario(2026, [...baseline.slice(1), baseline[1]!], [], [], '2026-02-28'),
    ).toThrow();
  });
});
