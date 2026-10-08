import { describe, expect, it } from 'vitest';
import { occurrences, type SchedulePayment, type ScheduleVersion } from '../schedule/occurrences';
import { incomePauseAmount } from './income-pause';
import { liquidityForecast } from './liquidity';
import { liquidityReport } from './report';

type IncomePause = {
  expectedPaymentId: string;
  startDate: string;
  endDate: string;
};

type ProjectedOccurrence = {
  expectedPaymentId: string;
  dueDate: string;
  kind: 'inflow' | 'outflow';
  currency: 'EUR' | 'USD';
  amountCents: number;
};

const schedule = (over: Partial<SchedulePayment> = {}): SchedulePayment => ({
  rhythm: 'monthly',
  dueDay: 15,
  dueMonth: null,
  dateShift: 'none',
  startDate: null,
  endDate: null,
  kind: 'inflow',
  contactShareBp: 0,
  ...over,
});

const projectedOccurrences = (
  payment: SchedulePayment,
  versions: readonly ScheduleVersion[],
  from: string,
  to: string,
  expectedPaymentId = 'salary',
  currency: ProjectedOccurrence['currency'] = 'EUR',
): ProjectedOccurrence[] =>
  occurrences(payment, versions, from, to).map((occurrence) => ({
    expectedPaymentId,
    dueDate: occurrence.dueDate,
    kind: payment.kind,
    currency,
    amountCents: occurrence.amountCents,
  }));

const income = (over: Partial<ProjectedOccurrence> = {}): ProjectedOccurrence => ({
  expectedPaymentId: 'salary',
  dueDate: '2027-06-15',
  kind: 'inflow',
  currency: 'EUR',
  amountCents: 300_000,
  ...over,
});

const amount = (items: readonly ProjectedOccurrence[], pause: IncomePause) =>
  items.map((item) => incomePauseAmount(item, pause));

describe('income pause forecast amount', () => {
  it('replaces the three monthly receipts with zero and resumes the scheduled amount', () => {
    const items = projectedOccurrences(
      schedule(),
      [{ validFrom: '2027-01-01', amountCents: 300_000, amountMaxCents: null }],
      '2027-06-01',
      '2027-09-30',
    );

    expect(items.map((item) => item.dueDate)).toEqual([
      '2027-06-15',
      '2027-07-15',
      '2027-08-15',
      '2027-09-15',
    ]);
    expect(
      amount(items, {
        expectedPaymentId: 'salary',
        startDate: '2027-06-01',
        endDate: '2027-08-31',
      }),
    ).toEqual([0, 0, 0, 300_000]);
  });

  it('includes both pause endpoints and leaves adjacent dates unchanged', () => {
    const pause = {
      expectedPaymentId: 'salary',
      startDate: '2027-06-15',
      endDate: '2027-08-15',
    };
    const items = [
      income({ dueDate: '2027-06-14' }),
      income({ dueDate: '2027-06-15' }),
      income({ dueDate: '2027-08-15' }),
      income({ dueDate: '2027-08-16' }),
    ];

    expect(amount(items, pause)).toEqual([300_000, 0, 0, 300_000]);
  });

  it('uses each occurrence’s effective amount version and resumes its later value', () => {
    const items = projectedOccurrences(
      schedule(),
      [
        { validFrom: '2027-01-01', amountCents: 300_000, amountMaxCents: null },
        { validFrom: '2027-07-01', amountCents: 325_000, amountMaxCents: null },
      ],
      '2027-06-01',
      '2027-09-30',
    );

    expect(items.map((item) => item.amountCents)).toEqual([300_000, 325_000, 325_000, 325_000]);
    expect(
      amount(items, {
        expectedPaymentId: 'salary',
        startDate: '2027-06-01',
        endDate: '2027-08-31',
      }),
    ).toEqual([0, 0, 0, 325_000]);
  });

  it('pauses only actual quarterly occurrences and compares the shifted due date', () => {
    const quarterly = projectedOccurrences(
      schedule({ rhythm: 'quarterly', dueMonth: 1 }),
      [{ validFrom: '2027-01-01', amountCents: 300_000, amountMaxCents: null }],
      '2027-01-01',
      '2027-10-31',
    );
    expect(quarterly.map((item) => item.dueDate)).toEqual([
      '2027-01-15',
      '2027-04-15',
      '2027-07-15',
      '2027-10-15',
    ]);
    expect(
      amount(quarterly, {
        expectedPaymentId: 'salary',
        startDate: '2027-04-01',
        endDate: '2027-04-30',
      }),
    ).toEqual([300_000, 0, 300_000, 300_000]);

    const shifted = projectedOccurrences(
      schedule({ dueDay: 1, dateShift: 'before' }),
      [{ validFrom: '2026-01-01', amountCents: 300_000, amountMaxCents: null }],
      '2026-10-01',
      '2026-11-30',
    );
    expect(shifted.map((item) => item.dueDate)).toEqual(['2026-10-01', '2026-10-30']);
    expect(
      amount(shifted, {
        expectedPaymentId: 'salary',
        startDate: '2026-10-30',
        endDate: '2026-10-30',
      }),
    ).toEqual([300_000, 0]);
    expect(
      incomePauseAmount(shifted[1]!, {
        expectedPaymentId: 'salary',
        startDate: '2026-10-31',
        endDate: '2026-11-30',
      }),
    ).toBe(300_000);
  });

  it('leaves a different source, an outflow and a non-EUR inflow unchanged', () => {
    const pause = {
      expectedPaymentId: 'salary',
      startDate: '2027-06-01',
      endDate: '2027-08-31',
    };

    expect(incomePauseAmount(income({ expectedPaymentId: 'other-income' }), pause)).toBe(300_000);
    expect(incomePauseAmount(income({ kind: 'outflow', amountCents: -300_000 }), pause)).toBe(
      -300_000,
    );
    expect(incomePauseAmount(income({ currency: 'USD' }), pause)).toBe(300_000);
  });

  it('preserves a separate additive event and does not mutate the resolved occurrence or pause', () => {
    const occurrence = Object.freeze(income());
    const pause = Object.freeze({
      expectedPaymentId: 'salary',
      startDate: '2027-06-01',
      endDate: '2027-08-31',
    });
    const additiveEventCents = 50_000;
    const forecastCashCents = incomePauseAmount(occurrence, pause) + additiveEventCents;

    expect(forecastCashCents).toBe(50_000);
    expect(occurrence.amountCents).toBe(300_000);
    expect(pause).toEqual({
      expectedPaymentId: 'salary',
      startDate: '2027-06-01',
      endDate: '2027-08-31',
    });
  });

  it('feeds one adjusted salary into the shared cash forecast and report without double counting', () => {
    const pause = {
      expectedPaymentId: 'salary',
      startDate: '2027-06-15',
      endDate: '2027-06-15',
    };
    const resolved = [
      income(),
      income({ expectedPaymentId: 'other-income', amountCents: 40_000 }),
      income({
        expectedPaymentId: 'bill',
        kind: 'outflow',
        dueDate: '2027-06-16',
        amountCents: -200_000,
      }),
    ];
    const items = resolved.map((item) => ({
      day: item.dueDate,
      cents: incomePauseAmount(item, pause),
      kind: item.kind === 'inflow' ? ('income' as const) : ('fixed' as const),
    }));
    const events = [{ day: '2027-06-15', cents: 50_000, kind: 'event' as const }];
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.cents)).toEqual([0, 40_000, -200_000]);

    const forecast = liquidityForecast({
      startDay: '2027-06-14',
      startCents: 100_000,
      days: 2,
      items: [...items, ...events],
      variablePerDay: () => 0,
    });
    expect(forecast.days.map((day) => day.balanceCents)).toEqual([100_000, 190_000, -10_000]);
    expect(forecast.months[0]).toMatchObject({
      incomeCents: 40_000,
      fixedCents: -200_000,
      eventCents: 50_000,
      endCents: -10_000,
    });
    const report = liquidityReport({
      startDay: '2027-06-14',
      startCents: 100_000,
      items,
      events,
      variableMonthlyCents: 0,
      horizon: '90d',
      levers: [],
    });
    expect(report.points.find((point) => point.day === '2027-06-16')).toMatchObject({
      balanceCents: -10_000,
      plainCents: -60_000,
    });
    expect(report.low?.cents).toBe(-10_000);
  });
});
