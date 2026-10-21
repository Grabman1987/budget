import { describe, expect, it } from 'vitest';
import { horizonDays, liquidityReport, type LiquidityReportInput } from './report';

const input = (overrides: Partial<LiquidityReportInput> = {}): LiquidityReportInput => ({
  startDay: '2026-09-17',
  startCents: 100_000,
  items: [
    { day: '2026-09-27', cents: -12_500, kind: 'fixed', label: 'Synthetic payment' },
    { day: '2026-10-07', cents: 9_000, kind: 'income', label: 'Synthetic income' },
  ],
  events: [],
  variableMonthlyCents: 0,
  horizon: '35d',
  levers: [],
  ...overrides,
});

describe('35-day forecast shared by Heute and Details (#568/#569)', () => {
  it('includes day0 through35 and chooses the first day of a repeated literal minimum', () => {
    const report = liquidityReport(input());
    expect(horizonDays('35d', '2026-09-17')).toBe(35);
    expect(report).toMatchObject({
      startDay: '2026-09-17', startCents: 100_000, horizon: '35d', horizonDays: 35,
      low: { day: '2026-09-27', index: 10, cents: 87_500 },
      lowBuffer: { day: '2026-09-27', index: 10, cents: 87_500 },
      lowPlain: { day: '2026-09-27', index: 10, cents: 87_500 },
    });
    expect(report.points).toHaveLength(36);
    expect(report.points[0]).toEqual({ day: '2026-09-17', balanceCents: 100_000,
      bufferCents: 100_000, plainCents: 100_000 });
    expect(report.points[9]).toMatchObject({ day: '2026-09-26', balanceCents: 100_000 });
    expect(report.points.slice(10, 20).map((point) => point.balanceCents)).toEqual(Array(10).fill(87_500));
    expect(report.points[20]).toMatchObject({ day: '2026-10-07', balanceCents: 96_500 });
    expect(report.points[35]).toEqual({ day: '2026-10-22', balanceCents: 96_500,
      bufferCents: 96_500, plainCents: 96_500 });
    expect(report.points.every((point) => point.balanceCents === point.bufferCents &&
      point.balanceCents === point.plainCents)).toBe(true);
  });

  it('does not charge a day0 item twice and retains today as the earliest flat minimum', () => {
    const report = liquidityReport(input({ items: [
      { day: '2026-09-17', cents: -99_999, kind: 'fixed', label: 'Already included in opening balance' },
    ] }));
    expect(report.points.map((point) => point.balanceCents)).toEqual(Array(36).fill(100_000));
    expect(report.low).toEqual({ day: '2026-09-17', index: 0, cents: 100_000 });
  });

  it('includes the day35 boundary but keeps day36 out of the chart and in the unchanged six-month verdict', () => {
    const report = liquidityReport(input({ events: [
      { day: '2026-10-22', cents: -100_000, kind: 'event', label: 'Inside day35' },
      { day: '2026-10-23', cents: -20_000, kind: 'event', label: 'Outside day36' },
    ] }));
    expect(report.points).toHaveLength(36);
    expect(report.points.at(-1)).toEqual({ day: '2026-10-22', balanceCents: -3_500,
      bufferCents: -3_500, plainCents: 96_500 });
    expect(report.low).toEqual({ day: '2026-10-22', index: 35, cents: -3_500 });
    expect(report.eventMarks).toEqual([{ day: '2026-10-22', label: 'Inside day35', cents: -100_000 }]);
    expect(report.verdictEnd).toBe('2027-03-17');
    expect(report.verdict).toMatchObject({ status: 'bad', day: '2026-10-23', shortfallCents: 23_500 });
  });
});
