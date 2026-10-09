import { describe, expect, it } from 'vitest';
import { daysBetween, lastDayOfMonth } from '../date';
import { evenDaily, liquidityForecast, lowPoint, type ForecastItem } from './liquidity';
import { horizonDays, liquidityReport, sameDayInMonths, type LiquidityReportInput } from './report';
import {
  PROTO_EVENTS,
  PROTO_ITEMS,
  PROTO_START_CENTS,
  PROTO_START_DAY,
  PROTO_VARIABLE_CENTS,
} from './zukunft-sample';

const MONTHS = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'];
const items = (): ForecastItem[] => [
  { day: '2026-09-30', cents: 300_000, kind: 'income', label: 'Gehalt' },
  ...MONTHS.flatMap((m): ForecastItem[] => [
    { day: `${m}-05`, cents: -90_000, kind: 'fixed', label: 'Miete', group: 'need' },
    { day: `${m}-08`, cents: -4_000, kind: 'fixed', label: 'Streaming', group: 'want' },
    { day: `${m}-10`, cents: -20_000, kind: 'fixed', label: 'ETF-Sparplan', group: 'future' },
    { day: lastDayOfMonth(m), cents: 300_000, kind: 'income', label: 'Gehalt' },
  ]),
];
const base = (over: Partial<LiquidityReportInput> = {}): LiquidityReportInput => ({
  startDay: '2026-09-17',
  startCents: 100_000,
  items: items(),
  events: [],
  variableMonthlyCents: 150_000,
  horizon: '6m',
  levers: [],
  ...over,
});

describe('horizons', () => {
  it('counts calendar days; a missing day falls to the end of the month', () => {
    expect(horizonDays('90d', '2026-09-17')).toBe(90);
    expect(horizonDays('6m', '2026-09-17')).toBe(daysBetween('2026-09-17', '2027-03-17'));
    expect(horizonDays('12m', '2026-09-17')).toBe(365);
    expect(sameDayInMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(sameDayInMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('liquidityReport', () => {
  it('dates the deciding low within the unchanged six-month verdict, even with a shorter chart', () => {
    const r = liquidityReport(
      base({
        items: [],
        variableMonthlyCents: 0,
        horizon: '90d',
        events: [
          { day: '2027-03-16', cents: -120_001, kind: 'event' },
          { day: '2027-03-31', cents: 300_000, kind: 'event' },
        ],
      }),
    );
    expect(r.verdict).toMatchObject({ status: 'bad', day: '2027-03-16', shortfallCents: 20_001 });
    expect(r.verdictEnd).toBe('2027-03-17');
    expect(r.low?.cents).toBe(100_000);
  });
  it('month rows add up from start to end and chain into each other', () => {
    const r = liquidityReport(base());
    expect(r.months.length).toBe(7);
    expect(r.months[0]?.startCents).toBe(100_000);
    r.months.forEach((m, i) => {
      expect(m.startCents + m.incomeCents + m.fixedCents + m.variableCents + m.eventCents).toBe(
        m.endCents,
      );
      if (i > 0) expect(m.startCents).toBe(r.months[i - 1]?.endCents);
      expect(m.lowCents).toBeLessThanOrEqual(Math.min(m.startCents, m.endCents));
    });
    expect(r.months[0]?.partialStart).toBe(true);
    expect(r.months[1]?.partialStart).toBe(false);
    expect(r.months.at(-1)?.partialEnd).toBe(true);
    expect(r.months.at(-1)?.month).toBe('2027-03');
    expect(r.months.at(-1)?.endCents).toBe(
      r.points.find((p) => p.day === r.verdictEnd)?.balanceCents,
    );
  });

  it('agrees with the plain forecast engine on the same inputs', () => {
    const r = liquidityReport(base({ horizon: '12m' }));
    const direct = liquidityForecast({
      startDay: '2026-09-17',
      startCents: 100_000,
      days: 365,
      items: items(),
      variablePerDay: evenDaily(() => 150_000),
    });
    expect(r.points.map((p) => p.plainCents)).toEqual(direct.days.map((d) => d.balanceCents));
    expect(r.low).toEqual(lowPoint(direct.days, 365));
  });

  it('the buffer adds 10 % to the variable spending and never raises the balance', () => {
    const r = liquidityReport(base());
    const last = r.points.at(-1)!;
    expect(last.bufferCents).toBeLessThan(last.balanceCents);
    expect(r.lowBuffer!.cents).toBeLessThanOrEqual(r.low!.cents);
    // 6 months of 150.000 cents: ten percent are about 90.000 cents
    expect(last.balanceCents - last.bufferCents).toBeGreaterThan(80_000);
  });

  it('planned events change the forecast and appear as marks and movement rows', () => {
    const events: ForecastItem[] = [
      { day: '2026-11-15', cents: -150_000, kind: 'event', label: 'Möbel' },
      { day: '2028-01-01', cents: -1, kind: 'event', label: 'Außerhalb' },
    ];
    const withEvent = liquidityReport(base({ events }));
    const without = liquidityReport(base());
    expect(withEvent.eventMarks).toEqual([{ day: '2026-11-15', label: 'Möbel', cents: -150_000 }]);
    expect(withEvent.lowPlain).toEqual(without.low);
    expect(withEvent.low!.cents).toBeLessThan(withEvent.lowPlain!.cents);
    const nov = withEvent.movements.find((m) => m.month === '2026-11')!;
    expect(nov.rows.find((x) => x.planned)).toMatchObject({ label: 'Möbel', cents: -150_000 });
    // rows + rest add up to the month
    const sum = nov.rows.reduce((a, x) => a + x.cents, 0) + nov.restCents;
    expect(nov.startCents + sum).toBe(nov.endCents);
    expect(withEvent.months.find((m) => m.month === '2026-11')?.eventCents).toBe(-150_000);
  });

  it('verdict: ok, then warn when only the buffer fails, then bad', () => {
    expect(liquidityReport(base()).verdict.status).toBe('ok');
    const withEvent = (cents: number) =>
      liquidityReport(
        base({
          variableMonthlyCents: 170_000,
          events: [{ day: '2026-09-18', cents: -cents, kind: 'event', label: 'x' }],
        }),
      );
    const amounts = Array.from({ length: 61 }, (_, i) => i * 2000);
    const statuses = amounts.map((c) => withEvent(c).verdict.status);
    // the more is planned out, the worse the verdict gets: ok, warn, bad in this order
    expect(statuses[0]).toBe('ok');
    expect(statuses).toContain('warn');
    expect(statuses.at(-1)).toBe('bad');
    const order = { ok: 0, warn: 1, bad: 2 } as const;
    expect(statuses.map((s) => order[s])).toEqual([...statuses.map((s) => order[s])].sort());
    const warn = withEvent(amounts[statuses.indexOf('warn')] as number);
    expect(warn.verdict.shortfallCents).toBeGreaterThan(0);
    expect(warn.low!.cents).toBeGreaterThanOrEqual(0);
    const bad = withEvent(120_000);
    expect(bad.verdict.shortfallCents).toBe(
      -bad.months.reduce((a, m) => Math.min(a, m.lowCents), Infinity),
    );
    expect(bad.verdict.month).toBe(bad.low!.day.slice(0, 7));
  });

  it('levers: what they act on, their gain and the effect when switched on', () => {
    const r = liquidityReport(base());
    const byId = Object.fromEntries(r.levers.map((l) => [l.id, l]));
    expect(byId['pause-future']).toMatchObject({ available: true, labels: ['ETF-Sparplan'] });
    expect(byId['cancel-want']).toMatchObject({ available: true, labels: ['Streaming'] });
    expect(byId['trim-variable']).toMatchObject({ available: true, active: false });
    expect(r.levers.every((l) => l.gainCents >= 0)).toBe(true);
    const on = liquidityReport(base({ levers: ['pause-future', 'cancel-want', 'trim-variable'] }));
    expect(on.low!.cents).toBeGreaterThan(r.low!.cents);
    expect(on.levers.every((l) => l.active)).toBe(true);
    // switching an active lever off would lose what it brought
    expect(on.levers.find((l) => l.id === 'pause-future')!.gainCents).toBeLessThanOrEqual(0);
    // pause-future reaches the next 90 days, cancel-want starts next month
    const pause = liquidityReport(base({ levers: ['pause-future'] }));
    expect(pause.months.find((m) => m.month === '2026-10')?.fixedCents).toBe(-94_000);
    const cancel = liquidityReport(base({ levers: ['cancel-want'] }));
    expect(cancel.months.find((m) => m.month === '2026-10')?.fixedCents).toBe(-110_000);
  });

  it('a lever that has nothing to act on is not available', () => {
    const r = liquidityReport(
      base({ items: items().filter((i) => i.group === 'need' || i.kind === 'income') }),
    );
    expect(r.levers.find((l) => l.id === 'pause-future')?.available).toBe(false);
    expect(r.levers.find((l) => l.id === 'cancel-want')?.available).toBe(false);
    expect(liquidityReport(base({ variableMonthlyCents: 0 })).levers[2]?.available).toBe(false);
  });

  it('runs the prototype sample with its events', () => {
    const dayOf = (n: number) =>
      new Date(Date.parse(`${PROTO_START_DAY}T00:00:00Z`) + n * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const sample: ForecastItem[] = PROTO_ITEMS.map(([n, kind, cents]) => ({
      day: dayOf(n),
      cents,
      kind,
    }));
    const events: ForecastItem[] = PROTO_EVENTS.map((e) => ({
      day: `${e.key}-${String(e.day).padStart(2, '0')}`,
      cents: e.cents,
      kind: 'event',
    }));
    const r = liquidityReport({
      startDay: PROTO_START_DAY,
      startCents: PROTO_START_CENTS,
      items: sample,
      events,
      variableMonthlyCents: Math.round(
        (PROTO_VARIABLE_CENTS.slice(0, 13).reduce((a, b) => a + b, 0) / 13) * 30,
      ),
      horizon: '90d',
      levers: [],
    });
    expect(r.points).toHaveLength(91);
    expect(r.points[0]?.balanceCents).toBe(PROTO_START_CENTS);
    expect(r.low?.cents).toBeLessThan(PROTO_START_CENTS);
    expect(r.lowPlain!.cents).toBeGreaterThanOrEqual(r.low!.cents);
  });
});
