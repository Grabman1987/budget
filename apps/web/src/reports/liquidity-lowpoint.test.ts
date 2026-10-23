import { describe, expect, it } from 'vitest';
import { liquidityReport, type LiquidityReport } from '@budget/domain';
import { lowestPoint, salaryDay, upcomingEvents } from './liquidity-selection';

const point = (day: string, balanceCents: number) => ({
  day,
  balanceCents,
  bufferCents: balanceCents - 500,
  plainCents: balanceCents,
});

describe('lowestPoint', () => {
  it('returns the minimum of the plotted balance series to the cent, with its day', () => {
    const points = [
      point('2026-09-17', 100_000),
      point('2026-09-18', 90_001),
      point('2026-09-19', -12_345),
      point('2026-09-20', 5_000),
    ];
    expect(lowestPoint(points)).toEqual({ day: '2026-09-19', cents: -12_345, index: 2 });
  });

  it('takes the first day on a tie and also finds the start day', () => {
    expect(
      lowestPoint([point('2026-09-17', 10), point('2026-09-18', 20), point('2026-09-19', 10)]),
    ).toEqual({ day: '2026-09-17', cents: 10, index: 0 });
  });

  it('is null without points', () => {
    expect(lowestPoint([])).toBeNull();
  });

  it('agrees with the low point of the domain report for every horizon', () => {
    for (const horizon of ['90d', '6m', '12m'] as const) {
      const report = liquidityReport({
        startDay: '2026-09-17',
        startCents: 123_456,
        items: [
          { day: '2026-10-15', cents: -300_000, kind: 'fixed', label: 'Miete' },
          { day: '2026-11-15', cents: 250_001, kind: 'income', label: 'Gehalt' },
        ],
        events: [{ day: '2027-01-10', cents: -99_999, kind: 'event', label: 'Urlaub' }],
        variableMonthlyCents: 40_000,
        horizon,
        levers: [],
      });
      const low = lowestPoint(report.points);
      expect(low).toMatchObject({ day: report.low!.day, cents: report.low!.cents });
    }
  });
});

describe('upcomingEvents', () => {
  const report = liquidityReport({
    startDay: '2026-09-17',
    startCents: 500_000,
    items: [
      { day: '2026-09-25', cents: -80_000, kind: 'fixed', label: 'Miete' },
      { day: '2026-09-30', cents: 250_000, kind: 'income', label: 'Gehalt' },
    ],
    events: [{ day: '2026-09-27', cents: -45_000, kind: 'event', label: 'Reparatur' }],
    variableMonthlyCents: 0,
    horizon: '90d',
    levers: [],
  });

  it('lists the movements behind the chart in chart order with their balance after', () => {
    const rows = upcomingEvents(report, 10);
    expect(rows.map((r) => [r.day, r.label, r.cents])).toEqual([
      ['2026-09-25', 'Miete', -80_000],
      ['2026-09-27', 'Reparatur', -45_000],
      ['2026-09-30', 'Gehalt', 250_000],
    ]);
    for (const r of rows)
      expect(r.afterCents).toBe(report.points.find((p) => p.day === r.day)!.balanceCents);
  });

  it('stops after the limit', () => {
    expect(upcomingEvents(report, 2)).toHaveLength(2);
  });
});

describe('salaryDay', () => {
  const report = {
    startDay: '2026-09-17',
    scheduledInflows: [
      { day: '2026-09-20', cents: 90_000, ref: { paymentId: 'x', dueDate: '' } },
      { day: '2026-09-30', cents: 250_000, ref: { paymentId: 's', dueDate: '' } },
      { day: '2026-10-30', cents: 250_000, ref: { paymentId: 's', dueDate: '' } },
    ],
  } as unknown as LiquidityReport;

  it('is the first upcoming income of a salary payment', () => {
    expect(salaryDay(report, new Set(['s']))).toBe('2026-09-30');
  });

  it('is null when no salary payment is known or planned', () => {
    expect(salaryDay(report, new Set())).toBeNull();
    expect(salaryDay(report, new Set(['other']))).toBeNull();
  });
});
